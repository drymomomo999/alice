/**
 * QuestMind AI 服务
 *
 * 调用方式（优先级顺序）：
 * 1. 直连 DeepSeek Chat（优先，走 Vite 代理绕 CORS）
 *    - 在 .env 中设置 VITE_DEEPSEEK_API_KEY
 *    - 注意：Key 会暴露在浏览器，仅用于开发调试
 *
 * 2. Supabase Edge Function（生产推荐，API Key 不暴露前端）
 */

import type { AICharacter, AIMessage, Goal, GoalCategory } from '@/types'
import { generateId } from '@/lib/utils'
import { getSupabase } from './supabase'
import { REM_CONFIG, getRemSystemPrompt } from './rem.service'
import { ALICE_CONFIG, getAliceSystemPrompt, getAliceRoomPromptWithMemory } from './alice.service'
import RemAvatar from '@/assets/rem.png'

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'

/**
 * 去除 AI 返回内容中的 markdown 代码块标记（```json ... ``` 或 ``` ... ```）
 * DeepSeek 等模型经常在返回的 JSON 外面包裹代码块。
 *
 * 支持三种情况：
 * 1. 整个内容就是代码块：```json\n...\n```
 * 2. 代码块前后有文字："好的，这是计划：\n```json\n...\n```"
 * 3. 多个代码块（取第一个）
 */
function stripMarkdownCodeBlock(text: string): string {
  const trimmed = text.trim()
  // 情况1：整个内容就是代码块
  const fullMatch = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/)
  if (fullMatch) return fullMatch[1].trim()

  // 情况2/3：提取第一个代码块的内容
  const inlineMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/)
  if (inlineMatch) {
    console.warn('[stripMarkdownCodeBlock] 检测到内嵌代码块，提取内容')
    return inlineMatch[1].trim()
  }

  return trimmed
}

/**
 * 安全解析 AI 返回的 JSON 字符串。
 *
 * AI 模型常见 JSON 错误（按处理顺序）：
 * 1. 字符串值内包含未转义的控制字符（\x00-\x1F）
 * 2. 属性名未加双引号（如 `key:` 应为 `"key":`）
 * 3. 末尾多余的逗号（trailing comma）
 * 4. 内容过长被截断（JSON 不完整）
 *
 * 此函数采用逐级容错策略，先尝试标准解析，失败后逐步修复。
 */
function safeJSONParse(text: string): unknown {
  // ---- 预处理：去除 markdown 代码块 ----
  let sanitized = stripMarkdownCodeBlock(text).trim()

  // ---- Strategy 1：只修复控制字符后直接解析 ----
  try {
    const cleaned = sanitizedControlChars(sanitized)
    return JSON.parse(cleaned)
  } catch (_e1) { /* 继续 */ }

  // ---- Strategy 2：修复未加引号的属性名 ----
  try {
    const cleaned = fixUnquotedKeys(sanitizedControlChars(sanitized))
    return JSON.parse(cleaned)
  } catch (_e2) { /* 继续 */ }

  // ---- Strategy 3：去除末尾多余逗号 ----
  try {
    const cleaned = removeTrailingCommas(fixUnquotedKeys(sanitizedControlChars(sanitized)))
    return JSON.parse(cleaned)
  } catch (_e3) { /* 继续 */ }

  // ---- Strategy 4：截断恢复 — 从末尾回退找到最后一个合法的结构闭合点 ----
  try {
    const recovered = recoverTruncatedJSON(
      removeTrailingCommas(fixUnquotedKeys(sanitizedControlChars(sanitized)))
    )
    if (recovered) {
      console.warn('[safeJSONParse] JSON 被截断，已尝试自动恢复。原始长度:', sanitized.length, '恢复后:', recovered.length)
      return JSON.parse(recovered)
    }
  } catch (_e4) { /* 继续 */ }

  // ---- Strategy 5：暴力修复 —— 把整段文本当作 JavaScript 对象字面量处理 ----
  try {
    const recovered = bruteForceJSONFix(sanitized)
    if (recovered) {
      console.warn('[safeJSONParse] 暴力修复策略成功')
      return JSON.parse(recovered)
    }
  } catch (_e5) { /* 继续 */ }

  // 全部失败，抛出包含诊断信息的错误
  const snippet = sanitized.slice(Math.max(0, 9000), Math.min(sanitized.length, 9100))
  throw new Error(
    `JSON parse failed (len=${sanitized.length}). Error near position ${sanitized.length > 9000 ? 9000 : 0}: ...${snippet}...`
  )
}

/** 替换 JSON 字符串值中的控制字符 */
function sanitizedControlChars(text: string): string {
  return text.replace(/"(?:[^"\\]|\\.)*"/g, (match) =>
    match.replace(/[\x00-\x1F]/g, (ch) => {
      const hex = ch.charCodeAt(0).toString(16).padStart(4, '0')
      return `\\u00${hex}`
    })
  )
}

/** 修复未加引号的 JSON 属性名：`key:` → `"key":` */
function fixUnquotedKeys(text: string): string {
  // 匹配：行首/逗号后/花括号后的无引号单词后跟冒号
  // 排除已经在字符串内部的情况
  return text.replace(
    /(^|\n|[{,]\s*)([a-zA-Z_$][\w$]*)(\s*:)/g,
    '$1"$2"$3'
  )
}

/** 去除 JSON 末尾多余的逗号 */
function removeTrailingCommas(text: string): string {
  // 去除对象/数组尾部逗号：`, }` → ` }`、`, ]` → ` ]`
  return text.replace(/,(\s*[}\]])/g, '$1')
}

/** 尝试从截断的 JSON 中恢复：找到最后一个完整结构并闭合 */
function recoverTruncatedJSON(text: string): string | null {
  // 找到最后一个合法的闭合点
  // 策略：从最后一个逗号处截断，尝试闭合结构
  let best: string | null = null

  // 尝试在最后一个完整键值对处截断
  const lastComma = text.lastIndexOf(',')
  if (lastComma > text.length * 0.3) {
    // 只尝试如果截断位置在合理范围内
    const truncated = text.slice(0, lastComma)
    // 计算需要闭合的括号
    const openBraces = (truncated.match(/{/g) || []).length
    const closeBraces = (truncated.match(/}/g) || []).length
    const openBrackets = (truncated.match(/\[/g) || []).length
    const closeBrackets = (truncated.match(/]/g) || []).length
    const needBraces = openBraces - closeBraces
    const needBrackets = openBrackets - closeBrackets
    if (needBraces >= 0 && needBrackets >= 0) {
      const closed = truncated + ']'.repeat(needBrackets) + '}'.repeat(needBraces)
      try { JSON.parse(closed); best = closed } catch { /* keep trying */ }
    }
  }

  // 尝试在最后一个 ] 或 } 之后截断
  if (!best) {
    for (const char of [']', '}']) {
      const idx = text.lastIndexOf(char)
      if (idx > text.length * 0.5) {
        const truncated = text.slice(0, idx + 1)
        try { JSON.parse(truncated); best = truncated; break } catch { /* continue */ }
      }
    }
  }

  return best
}

/** 暴力修复：用 Function 构造器当 JavaScript 对象字面量执行（最后手段） */
function bruteForceJSONFix(text: string): string | null {
  try {
    // 尝试用 JSON5 风格的宽容解析
    // 先修复最常见的无引号 key
    let fixed = text
      .replace(/([{,]\s*|\n\s*)([a-zA-Z_$][\w$]*)\s*:/g, '$1"$2":')
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/:\s*undefined/g, ': null')
      .replace(/:\s*NaN/g, ': null')
      .replace(/:\s*Infinity/g, ': null')
      .replace(/:\s*-Infinity/g, ': null')

    // 尝试解析
    JSON.parse(fixed)
    return fixed
  } catch {
    return null
  }
}

// AI 角色配置
export const AI_CHARACTERS = {
  xiaoSi: {
    id: 'xiaoSi' as AICharacter,
    name: '小思',
    avatar: '/avatars/xiaosi.png',
    description: '你的AI学习搭子，温暖陪伴，共同进步',
    personality: '温暖、鼓励、耐心、善于倾听，像一个懂你的朋友'
  },
  coach: {
    id: 'coach' as AICharacter,
    name: '督促师',
    avatar: '/avatars/coach.png',
    description: '严格的AI教练，推动你突破极限',
    personality: '严格、激励、专业、不留情面，像一个严格的教练'
  },
  friend: {
    id: 'friend' as AICharacter,
    name: '学友',
    avatar: '/avatars/friend.png',
    description: '并肩作战的学习伙伴，互相监督',
    personality: '友好、竞争、互助、轻松幽默，像一个损友但关键时刻靠谱'
  },
  rem: {
    id: REM_CONFIG.id,
    name: REM_CONFIG.name,
    avatar: RemAvatar,
    description: REM_CONFIG.description,
    personality: REM_CONFIG.personality
  },
  alice: {
    id: ALICE_CONFIG.id,
    name: ALICE_CONFIG.name,
    avatar: ALICE_CONFIG.avatar,
    description: ALICE_CONFIG.description,
    personality: ALICE_CONFIG.personality
  }
}

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface SendMessageOptions {
  characterId: AICharacter
  userId: string
  userName: string
  currentGoals?: string[]
  selectedGoalContext?: string   // 目标的详细上下文（description + context + 附件文字）
  messageHistory?: AIMessage[]
  scene?: 'room' | 'goals' | 'default'  // 场景：小屋闲聊 / 目标学习 / 默认
  // 小屋记忆感参数
  memorySummary?: string   // 从历史消息提炼的话题摘要
  lastVisitInfo?: string   // "3天前"、"昨天" 等人性化描述
  // 动态档案：传入后跳过 buildSystemPrompt，直接使用此 system prompt
  customSystemPrompt?: string
}

// 构建 AI 角色的系统 Prompt
function buildSystemPrompt(
  characterId: AICharacter,
  userName: string,
  currentGoals?: string[],
  selectedGoalContext?: string,
  scene?: 'room' | 'goals' | 'default',
  memorySummary?: string,
  lastVisitInfo?: string
): string {
  // 蕾姆使用特殊的系统提示词
  if (characterId === 'rem') {
    let remPrompt = getRemSystemPrompt(userName)
    if (currentGoals && currentGoals.length > 0) {
      remPrompt += `\n\n- 当前目标：${currentGoals.join('、')}`
    }
    remPrompt += '\n\n蕾姆会像真正的GalGame女仆一样，用心回应主人。请直接以蕾姆的身份回复。'
    return remPrompt
  }

  // Alice 小屋场景：用纯聊天/朋友 prompt，注入记忆上下文
  if (characterId === 'alice' && scene === 'room') {
    return getAliceRoomPromptWithMemory(userName, memorySummary, lastVisitInfo)
  }

  // Alice 学习/目标 场景：用完整引导员 prompt
  if (characterId === 'alice') {
    const alicePrompt = getAliceSystemPrompt()
    let context = `\n\n当前用户：${userName}`
    if (currentGoals && currentGoals.length > 0) {
      context += `\n- 当前目标：${currentGoals.join('、')}`
    }
    if (selectedGoalContext) {
      context += `\n\n【当前关注目标的详细信息】\n${selectedGoalContext}`
    }
    return alicePrompt + context
  }

  const character = AI_CHARACTERS[characterId]

  let basePrompt = `你是QuestMind应用中的AI角色"${character.name}"。
你的性格特点：${character.personality}
当前用户信息：
- 用户名：${userName}`

  if (currentGoals && currentGoals.length > 0) {
    basePrompt += `\n- 当前目标：${currentGoals.join('、')}`
  }

  if (selectedGoalContext) {
    basePrompt += `\n\n【当前关注目标的详细信息】\n${selectedGoalContext}`
  }

  basePrompt += `\n\n请根据以上信息和用户进行对话。对话要：
1. 符合你的人设和性格
2. 鼓励用户完成目标
3. 在适当时候提醒用户的学习进度
4. 如果用户放弃或懈怠，要温和但坚定地督促
5. 可以使用emoji来增加亲和力

请直接回复用户的消息，不要添加额外的格式或说明。`

  return basePrompt
}

/**
 * 通过 Supabase Edge Function 调用 AI（生产模式，Key 不暴露前端）
 *
 * 开发环境下通过相对路径 /functions/v1/ai-chat 发起请求，
 * 由 Vite proxy 转发到 Supabase，避免浏览器 CORS 拦截。
 */
async function callViaEdgeFunction(messages: ChatCompletionMessage[], maxTokens = 8192): Promise<string | null> {
  try {
    const isDev = import.meta.env.DEV
    console.log(`[AI] callViaEdgeFunction: isDev=${isDev}, maxTokens=${maxTokens}`)

    // 开发环境：走 Vite 代理绕过 CORS
    if (isDev) {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

      console.log(`[AI] 通过 Vite 代理调用 Edge Function: /functions/v1/ai-chat`)
      const response = await fetch('/functions/v1/ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'x-client-info': 'questmind-dev',
        },
        body: JSON.stringify({ messages, max_tokens: maxTokens, temperature: 0.8 })
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        console.warn(`[AI] Edge Function 返回 ${response.status}:`, errText)
        return null
      }

      const data = await response.json()
      console.log('[AI] ✅ Edge Function 调用成功')
      const rawMessage = data?.choices?.[0]?.message
      return rawMessage?.content || rawMessage?.reasoning_content || null
    }

    // 生产环境：直接使用 Supabase SDK
    const supabase = getSupabase()
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: { messages, max_tokens: maxTokens, temperature: 0.8 }
    })

    if (error) {
      console.warn('[AI] Edge Function 调用失败（Supabase SDK）:', error.message)
      return null
    }

    console.log('[AI] ✅ Edge Function 调用成功（生产环境）')
    const rawMessage = data?.choices?.[0]?.message
    return rawMessage?.content || rawMessage?.reasoning_content || null
  } catch (err) {
    console.warn('[AI] Edge Function 不可用:', err)
    return null
  }
}

/**
 * 直连 DeepSeek API（开发模式备用）
 */
async function callDirectDeepSeek(messages: ChatCompletionMessage[], maxTokens = 8192): Promise<string | null> {
  const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY
  if (!apiKey || apiKey === 'your_deepseek_api_key_here') {
    console.warn('[AI] 直连 DeepSeek: VITE_DEEPSEEK_API_KEY 未配置或仍为默认值')
    return null
  }

  try {
    // 开发环境通过 Vite 代理绕过 CORS，生产环境直连（需 Edge Function 部署）
    const isDev = import.meta.env.DEV
    const apiUrl = isDev ? '/deepseek-api/v1/chat/completions' : DEEPSEEK_API_URL

    console.log(`[AI] 直连 DeepSeek API (${isDev ? 'Vite代理' : '直连'})...`)
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        max_tokens: maxTokens,
        temperature: 0.8
      })
    })

    if (!response.ok) {
      console.error('[AI] DeepSeek API Error:', response.status)
      return null
    }

    const data = await response.json()
    console.log('[AI] ✅ 直连 DeepSeek 调用成功')
    // deepseek-v4-flash 等推理模型返回在 reasoning_content 而非 content
    const rawMessage = data?.choices?.[0]?.message
    const content = rawMessage?.content || rawMessage?.reasoning_content || null
    return content
  } catch (error) {
    console.error('[AI] 直连 DeepSeek 失败:', error)
    return null
  }
}

/**
 * 发送消息给 AI 角色（主入口）
 */
export async function sendAIMessage(options: SendMessageOptions): Promise<string> {
  const { characterId, userName, currentGoals, selectedGoalContext, messageHistory, scene, memorySummary, lastVisitInfo, customSystemPrompt } = options

  const systemContent = customSystemPrompt
    ?? buildSystemPrompt(characterId, userName, currentGoals, selectedGoalContext, scene, memorySummary, lastVisitInfo)

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: systemContent }
  ]

  // 携带历史消息作为上下文：小屋场景取最近 30 条，其他场景取 20 条
  if (messageHistory && messageHistory.length > 0) {
    const limit = scene === 'room' ? 30 : 20
    const recentHistory = messageHistory.slice(-limit)
    for (const msg of recentHistory) {
      messages.push({
        role: msg.isUser ? 'user' : 'assistant',
        content: msg.content
      })
    }
  }

  // 依次尝试：直连 DeepSeek（优先，走 Vite 代理绕过 CORS）→ Edge Function
  const maxTokens = 8192
  const result =
    (await callDirectDeepSeek(messages, maxTokens)) ||
    (await callViaEdgeFunction(messages, maxTokens))

  if (!result) {
    throw new Error('AI 服务不可用：直连 DeepSeek 和 Edge Function 均失败。请检查 API Key 配置和网络连接。')
  }

  return result
}

/**
 * 通用 DeepSeek 调用（导出，供其他 service 使用）
 * 依次尝试直连 → Edge Function，返回文本或 null
 */
export async function callDeepSeekAPI(
  messages: ChatCompletionMessage[],
  maxTokens = 8192
): Promise<string | null> {
  return (await callDirectDeepSeek(messages, maxTokens)) ||
         (await callViaEdgeFunction(messages, maxTokens))
}

/**
 * 生成测验题目
 */
interface QuizGenerationOptions {
  topic: string
  difficulty: 'easy' | 'medium' | 'hard'
  count: number
  goalContext?: string
  goalCategory?: string  // 新增 Step 4：分类感知
}

export async function generateQuizQuestions(options: QuizGenerationOptions): Promise<string> {
  const { topic, difficulty, count, goalContext, goalCategory } = options
  const difficultyLabel = difficulty === 'easy' ? '简单' : difficulty === 'medium' ? '中等' : '困难'

  // 根据分类调整出题策略
  const quizStrategy = getQuizStrategy(goalCategory || 'other')

  // 根据子目标标题注入学科知识点提示（帮助AI在背景信息不足时也能出实质性题目）
  const subjectHints = getSubjectHints(topic)

  // Bug 修复：限制 goalContext 长度，避免超出模型 context window 导致忽略核心内容
  const truncatedContext = goalContext
    ? goalContext.slice(0, 3000) + (goalContext.length > 3000 ? '\n...（内容截断）' : '')
    : ''

  const prompt = `请为以下学习目标生成${count}道${difficultyLabel}难度的测验题目。

考核子目标："${topic}"
${truncatedContext ? `目标背景信息：\n${truncatedContext}` : ''}
${subjectHints ? `\n【学科知识点参考】\n${subjectHints}` : ''}

${quizStrategy}

⚠️ 强制性约束（违反任何一条都会导致题目不合格）：
1. **每道题必须是考察具体知识点的客观题（概念辨析、计算推理、应用场景分析），绝对禁止出自我评估类题目**。以下题型是严格禁止的：
   - "你是否掌握了..."
   - "你能否独立完成..."
   - "你对...的熟练程度是..."
   - 任何让学习者评价自己主观感受的题目
2. **题目必须基于上述"目标背景信息"或"学科知识点参考"中的具体知识点来出**，必须能从中找到答案依据
3. **严禁出与目标背景信息无关的通用题目**（例如：微观经济学目标不能出二进制转换、数学加法题等完全无关内容）
4. 如果目标背景信息为空或不足以出题，请直接基于"学科知识点参考"中的内容出题；若参考也不足，请根据"${topic}"这个子目标标题推断学科和章节范围，出该领域最典型、最核心的知识点题目
5. 每道题必须是一个完整的、有明确考查点的题目，不能只给"以下哪项是正确的"这类空泛题目
6. 选项之间必须有区分度，错误选项要体现常见误区或易混淆概念，不能是随机拼凑的内容
7. 每道题必须包含4个选项（A、B、C、D），正确答案随机分布在不同选项中

请用以下JSON格式返回（不要添加任何其他内容）：
{
  "questions": [
    {
      "question": "题目内容",
      "options": ["A选项", "B选项", "C选项", "D选项"],
      "correctIndex": 0,
      "explanation": "解析内容（说明为什么正确，错误选项错在哪里）"
    }
  ]
}`

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: '你是一个专业的知识问答出题专家。你的核心原则是：只出考察客观知识点的题目，绝对禁止出自我评估类题目。题目必须与提供的背景信息或学科知识点直接相关。请严格按照要求的JSON格式返回，不要添加任何额外的内容。' },
    { role: 'user', content: prompt }
  ]

  const result =
    (await callViaEdgeFunction(messages, 8192)) ||
    (await callDirectDeepSeek(messages, 8192))

  if (!result) {
    throw new Error('AI 服务不可用：无法生成测验题目。请检查 API Key 配置和网络连接。')
  }

  return result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
}

/**
 * AI 目标拆解分析
 */
export async function analyzeGoalBreakdown(userGoal: string): Promise<string> {
  const prompt = `用户有一个目标："${userGoal}"

请帮我把这个大目标拆解成3-5个具体可执行的小步骤，并给出每一步的建议完成时间。

请用以下JSON格式返回：
{
  "mainGoal": "原目标",
  "subGoals": [
    {
      "title": "子目标1",
      "estimatedTime": "预计时间（如：1-2天）",
      "action": "具体行动"
    }
  ]
}`

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: '你是一个专业的目标管理顾问。请严格按照要求的JSON格式返回，不要添加任何额外的内容。' },
    { role: 'user', content: prompt }
  ]

  const result =
    (await callViaEdgeFunction(messages, 8192)) ||
    (await callDirectDeepSeek(messages, 8192))

  if (!result) {
    throw new Error('AI 服务不可用：无法分析目标拆解。请检查 API Key 配置和网络连接。')
  }

  return result
}

/**
 * =====================================================
 * AI 目标创建助手 - 多轮对话功能
 * =====================================================
 */

// 根据目标类型生成询问当前状态的问题
export async function generateStatusQuestions(
  userGoal: string,
  userContext?: string,
  attachmentTexts?: string[],
  goalCategory?: GoalCategory
): Promise<{
  questions: string[]
  statusContext: string  // 状态上下文字段名
  extractedInfo?: Record<string, string>  // 新增：从用户输入中提取的结构化信息
}> {
  // 构建附件上下文
  let attachmentSection = ''
  if (attachmentTexts && attachmentTexts.length > 0) {
    attachmentSection = '\n\n【用户上传的参考资料】\n以下是用户提供的参考文件内容，请仔细阅读后提出有针对性的问题：\n' +
      attachmentTexts.map((text, i) => `--- 资料${i + 1} ---\n${text.slice(0, 3000)}\n---`).join('\n')
  }

  const contextSection = userContext ? `\n\n【用户补充说明】\n${userContext}` : ''

  // 根据分类生成特异性系统提示词
  const categoryExpert = getCategoryExpertPrompt(goalCategory || 'other', userGoal)
  const categoryExamples = getCategoryQuestionExamples(goalCategory || 'other')

  const prompt = `${categoryExpert}${contextSection}${attachmentSection}

**【第一步：信息提取】**
请仔细分析用户的目标标题和补充说明，先从中提取已有的关键信息：

1. **时间约束**：从标题中提取总计划时长（如"一周"=7天，"三个月"=90天，"暑假前"≈60天）
2. **每天时间投入**：从补充说明中提取每天可投入时间（如"每天1小时"）
3. **已有基础**：用户是否描述了当前水平/体重/经验等

**【第二步：生成差异化诊断问题】**
⚠️ 你的问题质量直接决定了后续计划是否因人而异。请问能最大程度揭示"这个用户与其他人的差异"的问题。

**黄金问题标准：不同用户给出不同答案后，会产生完全不同的计划。**

以下问题类型必须包含（根据目标类型选择最相关的2-3个）：
- **起点量化**：当前数值/水平（不是"你觉得自己如何"，而是"你现在能做到什么"）
- **时间资源**：每天/每周能投入多少小时，是否有特定时间段不可用
- **最大障碍**：之前尝试这个目标失败过吗？失败的原因是什么？
- **已有进展**：已经完成了哪些部分？从哪里开始最合适？
- **具体限制**：有没有不能做的事（伤病/缺乏某种资源/必须用某种方式）？

禁止生成"你目前的基础水平是怎样的？"这类通用问题。必须问量化的、具体的、能影响计划设计的问题。

${categoryExamples}

**【第三步：提取结构化信息】**
在 statusContext 中用结构化方式记录你从用户输入中提取到的所有信息（时间、水平、资源等）。

请用以下JSON格式返回：
{
  "questions": ["具体的差异化诊断问题1", "具体的差异化诊断问题2", ...],
  "statusContext": "包含时间约束（总期限、每天投入）、当前水平、可用资源等关键信息的描述，供后续生成计划使用",
  "extractedInfo": {
    "totalDays": "总计划天数（如未明确则留空）",
    "dailyMinutes": "每天可投入分钟数（如未明确则留空）",
    "currentLevel": "用户当前水平描述（如未明确则留空）",
    "examType": "考试/考核形式（如未明确则留空）",
    "materials": "已有学习资源（如未明确则留空）"
  }
}`

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: '你是一个专业的目标管理顾问。你的核心使命是：收集足以让"两个目标相同但情况不同的用户得到完全不同计划"的关键诊断信息。你的问题必须精准、量化、具体——每个问题的回答必须直接影响后续计划的设计。请严格按照要求的JSON格式返回，不要添加任何额外的内容。禁止生成泛泛的通用问题。' },
    { role: 'user', content: prompt }
  ]

  // 依次尝试调用
  let result = await callViaEdgeFunction(messages, 8192)
  if (!result) {
    console.warn('[AI] Edge Function 返回空，尝试直连 DeepSeek...')
    result = await callDirectDeepSeek(messages, 8192)
    if (!result) {
      throw new Error('AI 服务不可用：无法生成状态问题。请检查 API Key 配置和网络连接。')
    }
  }

  return safeJSONParse(stripMarkdownCodeBlock(result)) as { questions: string[]; statusContext: string; extractedInfo?: Record<string, string> }
}

// 根据分类返回专家角色系统提示词
function getCategoryExpertPrompt(category: GoalCategory, userGoal: string): string {
  const prompts: Record<string, string> = {
    study: `你是学习领域的目标管理专家。用户的目标涉及课程学习："${userGoal}"

你需要问学习类特异性问题，如：
- 教材/课程名称是什么？学到第几章了？
- 考试/考核形式是什么？（期末考/期中考/无考试）
- 哪个章节/知识点最薄弱？`,

    exam: `你是考试备考专家。用户的目标涉及考试准备："${userGoal}"

你需要问考试类特异性问题，如：
- 考试具体日期是哪天？距今多少天？
- 考试范围是什么？（整本书/指定章节）
- 历年得分情况如何？哪类题型最弱？（选择题/填空题/简答题/计算题）`,

    fitness: `你是健身与体能训练专家。用户的目标涉及健身运动："${userGoal}"

你需要问健身类特异性问题，如：
- 当前体重/体脂率/体能测试数据是多少？
- 有无伤病或身体限制？
- 有哪些器械可用？（健身房/居家/户外）
- 训练经验多久？`,

    language: `你是语言学习专家。用户的目标涉及语言学习："${userGoal}"

你需要问语言类特异性问题，如：
- 当前水平等级是什么？（零基础/初级/中级/高级，或对应CEFR等级）
- 听说读写哪项最弱/最想提升？
- 目标水平是什么？（考试分数/日常交流/商务/考证）
- 有没有目标语言的使用环境？`,

    reading: `你是阅读指导专家。用户的目标涉及阅读："${userGoal}"

你需要问阅读类特异性问题，如：
- 书籍名称/作者/总章节数是多少？
- 每天阅读速度大约是多少页？
- 是否有做笔记或思维导图的习惯？
- 阅读目的是学习知识/消遣/备考？`,

    career: `你是职业发展顾问。用户的目标涉及职业发展："${userGoal}"

你需要问职业类特异性问题，如：
- 当前岗位/工作年限是什么？
- 目标职位需要哪些核心技能？
- 距离目标职位还差哪些能力？
- 有无公司内部晋升通道或跳槽计划？`,

    skill: `你是技能训练专家。用户的目标涉及技能学习："${userGoal}"

你需要问技能类特异性问题，如：
- 该技能当前是什么水平？（完全不会/入门/熟练）
- 学习资源是什么？（教程/课程/书籍/实战项目）
- 有没有实操环境可以练习？
- 主要困难是什么？`,

    other: `用户的目标是："${userGoal}"

请根据目标的具体领域，提出2-4个有针对性的问题来了解用户当前的起点状态。禁止问"你目前的基础水平是怎样的？"这类通用问题。`
  }
  return prompts[category] || prompts.other
}

// 根据分类返回问题示例指引
function getCategoryQuestionExamples(category: GoalCategory): string {
  const examples: Record<string, string> = {
    study: '**学习类问题示例**（不要直接用，但可参考方向）："你目前学到了教材第几章？""资料中3.2节的知识点你熟悉吗？""你倾向于看视频还是看书学习？"',
    exam: '**考试类问题示例**："距离考试还有多少天？""历次考试中哪种题型失分最多？""考试允许带什么辅助工具？"',
    fitness: '**健身类问题示例**："你目前卧推/深蹲的重量是多少？""每周能去几次健身房？""有没有腰/膝/肩的伤病？"',
    language: '**语言类问题示例**："你的目标语言现在能听懂多少？""写作和口语哪个更让你头疼？""每天能练习听说读写的具体时间有多少？"',
    reading: '**阅读类问题示例**："这本书你之前读过吗？""你平时习惯精读还是泛读？""读完后需要输出什么？（笔记/书评/应用）"',
    career: '**职业类问题示例**："你目前最欠缺的能力是什么？""目标职位需要哪些证书或资质？"',
    skill: '**技能类问题示例**："这个技能你之前有没有接触过？""有没有找到合适的学习教程或课程？"',
    other: ''
  }
  return examples[category] || ''
}

// 基于目标和用户状态，生成子目标和每日任务
export interface GoalPlanResult {
  currentStatus: string      // 整理后的当前状态
  personalizationNote?: string // 个性化差异说明（解释此计划与通用计划的区别）
  totalDays?: number          // 总计划天数
  dailyTimeMinutes?: number   // 每天投入时间
  subGoals: {
    title: string
    estimatedTime: string
    action: string
    dayRange?: string        // 新增：对应天数范围（如"Day 1-3"）
    description?: string     // 新增：子目标详细描述
  }[]
  dailyTasks: {
    title: string
    description: string
    duration: number  // 分钟
    frequency: 'daily' | 'custom'
    dayIndex?: number        // 新增：第几天执行
    subGoalIndex?: number    // 新增：关联的子目标索引
    difficultyLevel?: 'easy' | 'medium' | 'hard'  // 新增：任务难度
    resourceReference?: string // 新增：参考资料位置
    checklist?: string[]     // 新增：执行步骤清单
  }[]
}

export async function generateGoalPlan(
  userGoal: string,
  userStatus: string,
  userContext?: string,
  attachmentTexts?: string[],
  goalCategory?: GoalCategory,
  extractedInfo?: Record<string, string>
): Promise<GoalPlanResult> {
  // 构建附件上下文
  let attachmentSection = ''
  if (attachmentTexts && attachmentTexts.length > 0) {
    attachmentSection = '\n\n【用户上传的参考资料】\n以下是用户提供的参考文件内容，计划必须紧密围绕这些资料来制定：\n' +
      attachmentTexts.map((text, i) => `--- 资料${i + 1} ---\n${text.slice(0, 4000)}\n---`).join('\n')
  }

  const contextSection = userContext ? `\n【用户补充说明】\n${userContext}` : ''
  const extractedSection = extractedInfo && Object.keys(extractedInfo).length > 0
    ? `\n【从用户输入中提取的结构化信息】\n总计划天数：${extractedInfo.totalDays || '未明确（需合理估算）'}\n每天可投入：${extractedInfo.dailyMinutes || '未明确（需估算）'}分钟\n当前水平：${extractedInfo.currentLevel || '未明确'}\n考试/考核形式：${extractedInfo.examType || '未涉及'}\n已有资源：${extractedInfo.materials || '未明确'}`
    : ''

  // 分类专家角色
  const categoryRole = getPlanCategoryRole(goalCategory || 'other')

  // 任务格式规范（强化版）
  const taskFormatRule = getTaskFormatRule(goalCategory || 'other')

  const prompt = `${categoryRole}
用户目标："${userGoal}"

══════════════════════════════════════════
【用户当前真实状态 — 这是生成差异化计划的核心依据】
══════════════════════════════════════════
${userStatus}
${contextSection}${attachmentSection}${extractedSection}

═══════════════════════════════════════════════
【差异化强制规则 — 计划必须与用户状态强绑定】
═══════════════════════════════════════════════

⚠️ 这是最重要的规则：**你必须明确展示为什么这个计划适合"这个特定用户"而不是其他人。**

请在生成前先完成以下分析（只在内部分析，不输出）：
- 用户的起点水平如何？（根据状态描述）
- 用户的时间预算是多少？（根据每天可投入时间）
- 用户最薄弱的环节是哪里？（根据状态中提到的困难/弱点）
- 哪些内容对这个用户来说已经掌握可以跳过？
- 哪些内容对这个用户来说是瓶颈需要重点强化？

**基于上述分析，计划必须体现：**
1. **起点差异**：零基础用户从最基础概念开始；有基础的用户跳过基础，直接攻克薄弱点
2. **时间适配**：每天30分钟与每天3小时的计划任务量、深度完全不同
3. **瓶颈聚焦**：用户提到哪里弱/哪里难，计划就在那里分配更多时间和更细的任务
4. **资源匹配**：用户已有哪些资料，任务就围绕那些资料展开；没有资料的推荐具体获取途径
5. **进度衔接**：如果用户提到已学到某处，计划从那个断点继续，不重复已学内容

═══════════════════════════════════════════════
【基础格式约束】
═══════════════════════════════════════════════

1. **时间约束（最高优先级）**
   - 总计划天数 × 每天投入分钟数 = 可用的总学习时间
   - 如果总天数未明确，按 userStatus 和合理推断估计（如"期末复习"默认2-4周）
   - 所有子目标和每日任务必须在总可用时间内可完成，不要排得太满

2. **任务标题必须精确到"动作+对象+量化"（禁止模糊动词）**
   ${taskFormatRule}

3. **每个任务必须附带 3-5 步 checklist（执行步骤清单）**
   示例：
   "checklist": ["打开教材第3章P45", "阅读3.1节，划出关键定义", "在笔记本上默写SQL SELECT语法", "完成书上P48的练习题1-3", "对答案，标出错题"]

4. **难度递进原则**：dayIndex 靠前的任务偏 easy，中后期逐步到 medium → hard

5. **参考资料位置必须具体**：如"教材第3章P45-P62"、"课程第5节10:23-15:40"、"习题集P23-25"

6. **子目标按资料结构拆解**（学习类尤其重要）：如果上传了教材，子目标应按章/节结构对应

═══════════════════════════════════════════════
【输出格式 — 严格 JSON】
═══════════════════════════════════════════════

请用以下JSON格式返回：
{
  "currentStatus": "整理后的用户当前状态描述",
  "personalizationNote": "一句话说明：这个计划与通用计划的核心差异是什么（如：跳过了前2章因为用户已掌握、每日任务量只有30分钟因为用户时间有限、重点加强了XX因为用户说自己在这里最弱）",
  "totalDays": 总计划天数（整数）,
  "dailyTimeMinutes": 每天投入分钟数（整数）,
  "subGoals": [
    {
      "title": "子目标标题（如：掌握第3章SQL查询）",
      "estimatedTime": "预计完成时间（如：3天）",
      "action": "核心行动（具体描述）",
      "dayRange": "天数范围（如：Day 1-3）",
      "description": "子目标详细描述"
    }
  ],
  "dailyTasks": [
    {
      "title": "任务标题（动作+对象+量化，禁止'学习XXX'/'复习XXX'/'练习XXX'前缀）",
      "description": "任务描述（具体要做什么，精确到章节/页码/题号）\n   - 涉及知识点：（这次任务的核心知识点）\n   - 预计耗时：X分钟",
      "duration": 预计分钟数（整数）,
      "frequency": "daily",
      "dayIndex": 第几天（整数，从1开始）,
      "subGoalIndex": 所属子目标索引（整数，从0开始）,
      "difficultyLevel": "easy | medium | hard",
      "resourceReference": "参考资料位置（如：教材第3章P45-P62）",
      "checklist": ["步骤1", "步骤2", "步骤3", "步骤4", "步骤5"]
    }
  ]
}`

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: '你是一个专业的目标管理顾问和私人教练。你的核心能力是【因人而异】：根据用户的具体起点、时间预算、薄弱环节生成高度个性化的计划。绝对禁止生成通用模板式计划——两个目标相同但状态不同的用户，必须得到完全不同的计划。请严格按照要求的JSON格式返回，不要添加任何额外的内容。' },
    { role: 'user', content: prompt }
  ]

  /**
   * 执行一次 AI 调用并尝试解析 JSON。
   * 如果解析失败（通常因模型输出过长被截断），自动重试一次并附带更强的格式约束。
   */
  async function tryCall(maxTokens: number, retryHint?: string): Promise<GoalPlanResult> {
    const msgs = retryHint
      ? [
          ...messages.slice(0, -1),
          { role: 'user' as const, content: messages[messages.length - 1].content + retryHint },
        ]
      : messages

    let result = await callViaEdgeFunction(msgs, maxTokens)
    if (!result) {
      console.warn('[AI] Edge Function 返回空，尝试直连 DeepSeek...')
      result = await callDirectDeepSeek(msgs, maxTokens)
      if (!result) {
        throw new Error('AI 服务不可用：无法生成学习计划。请检查 API Key 配置和网络连接。')
      }
    }

    return safeJSONParse(result) as GoalPlanResult
  }

  try {
    return await tryCall(8192)
  } catch (firstErr) {
    console.warn('[generateGoalPlan] 第一次调用 JSON 解析失败，正在重试（增强格式约束 + 更大 token 配额）...')
    try {
      return await tryCall(8192, '\n\n⚠️ 你的上一次回复因为 JSON 格式错误或内容被截断而失败。请在本次回复中：\n1. 严格确保 JSON 完整闭合，所有花括号和方括号配对\n2. 所有属性名必须用双引号包裹\n3. 字符串值内的双引号用 \\" 转义\n4. 不要输出 JSON 之外的任何文字\n5. 如果内容过长，优先精简 dailyTasks 数组中的 description 字段，但保留完整的 JSON 结构')
    } catch (secondErr: any) {
      // 两次都失败，抛出友好的错误
      const details = secondErr?.message || String(secondErr)
      throw new Error(`AI 计划生成失败：模型返回的内容无法解析为合法 JSON。请尝试减少附件数量或缩短目标描述后重试。详情：${details.slice(0, 200)}`)
    }
  }
}

// 根据分类返回计划生成专家角色
function getPlanCategoryRole(category: string): string {
  const roles: Record<string, string> = {
    study: '你是学习领域的目标管理专家和课程规划师，擅长根据教材章节结构制定精确到页码的学习计划。',
    exam: '你是考试备考专家，擅长倒计时规划、高频考点优先级排序和题型针对性训练安排。',
    fitness: '你是健身教练，擅长体能评估、训练周期化安排（热身→主体→拉伸）和渐进超负荷原则。',
    language: '你是语言学习专家，擅长听说读写的分项训练计划和语言环境的创造。',
    reading: '你是阅读指导专家，擅长精读与泛读节奏把控、读书笔记方法论和知识内化路径。',
    career: '你是职业发展顾问，擅长技能差距分析、核心竞争力培养路径和阶段性里程碑设定。',
    skill: '你是技能训练专家，擅长从0到1的技能习得路径设计，融合刻意练习原理。',
    other: '你是一个专业的目标管理顾问和私人教练，擅长将模糊目标拆解为精确可执行的每日行动计划。'
  }
  return roles[category] || roles.other
}

// 根据分类返回任务格式规范
function getTaskFormatRule(category: string): string {
  if (category === 'study') {
    return `✅ 正确示例：
  "精读教材第3章SQL查询（P45-P62）"
  "观看《Python入门》第5节视频，完成课堂练习"
  "完成习题集3.1节P23-25第1-8题，整理错题"
  "复盘今日学习内容，整理思维导图"
❌ 错误示例（禁止出现）：
  "学习SQL查询"
  "复习第3章"
  "练习数据库操作"`
  }
  if (category === 'exam') {
    return `✅ 正确示例：
  "完成近5年真题第1-10题（计时25分钟）"
  "背诵《民法典》第121-125条法条原文"
  "整理选择题高频考点20个，制作速记卡"
❌ 错误示例（禁止出现）：
  "刷题"
  "背书"
  "复习法律知识"`
  }
  if (category === 'fitness') {
    return `✅ 正确示例：
  "哑铃卧推4×12（重量比上周+2.5kg），组间休息90秒"
  "晨跑5公里，配速6:30/km，记录心率区间"
  "睡前完成15分钟核心激活训练（平板支撑+死虫式）"
❌ 错误示例（禁止出现）：
  "练胸"
  "做有氧"
  "健身训练"`
  }
  return `✅ 正确示例：
  "完成XX任务第1-3步"
  "每天背30个单词（使用Anki间隔重复）"
  "按教程完成项目搭建前3个步骤"
❌ 错误示例（禁止出现）：
  "学习XXX"
  "复习XXX"
  "练习XXX"
  "做XXX任务"`
}

/**
 * =====================================================
 * 最终综合测验生成
 * 综合所有附件文档，生成完整的习题集
 * =====================================================
 */

export interface FinalExamConfig {
  multipleChoice: number   // 单选题数量
  trueFalse: number        // 判断题数量
  fillBlank: number        // 填空题数量
  shortAnswer: number      // 简答题数量
  language?: 'zh' | 'en'  // 出题语言
}

export interface FinalExamQuestion {
  id: string
  type: 'multiple_choice' | 'true_false' | 'fill_blank' | 'short_answer'
  question: string
  // 单选题 & 判断题
  options?: string[]
  correctIndex?: number    // 单选题正确答案索引
  correctBool?: boolean    // 判断题答案 true/false
  // 填空题
  blanks?: string[]        // 每个空的参考答案
  // 简答题
  referenceAnswer?: string
  // 通用
  explanation?: string
  difficulty: 'easy' | 'medium' | 'hard'
  sourceRef?: string       // 来源文档引用
}

export interface FinalExam {
  goalTitle: string
  totalQuestions: number
  multipleChoiceQuestions: FinalExamQuestion[]
  trueFalseQuestions: FinalExamQuestion[]
  fillBlankQuestions: FinalExamQuestion[]
  shortAnswerQuestions: FinalExamQuestion[]
  generatedAt: string
}

export async function generateFinalExam(options: {
  goalTitle: string
  goalContext?: string
  goalCategory?: string
  documents: { name: string; text: string }[]
  config: FinalExamConfig
  language?: 'zh' | 'en'
}): Promise<FinalExam> {
  const { goalTitle, goalContext, goalCategory, documents, config, language = 'zh' } = options
  const isEn = language === 'en'

  if (documents.length === 0 && !goalContext) {
    throw new Error(isEn ? 'No learning materials found. Please upload attachments first.' : '没有找到学习资料，请先上传附件。')
  }

  const totalQ = config.multipleChoice + config.trueFalse + config.fillBlank + config.shortAnswer
  if (totalQ === 0) throw new Error(isEn ? 'Please add at least one question.' : '请至少设置一道题目。')

  // 构建文档内容区块
  const PER_DOC_CHARS = 3000
  const docSection = documents.length > 0
    ? (isEn ? '\n\n[Learning Materials]\n' : '\n\n【学习资料】\n') +
      documents.map((d, i) => `${isEn ? `--- Document ${i + 1}: ${d.name} ---` : `--- 资料${i + 1}: ${d.name} ---`}\n${d.text.slice(0, PER_DOC_CHARS)}`).join('\n\n')
    : (goalContext ? (isEn ? `\n\n[Goal Background]\n${goalContext.slice(0, 5000)}` : `\n\n【目标背景信息】\n${goalContext.slice(0, 5000)}`) : '')

  const categoryRole = goalCategory ? (goalCategory === 'exam' ? (isEn ? 'exam preparation expert' : '考试备考专家') :
    goalCategory === 'study' ? (isEn ? 'academic learning expert' : '学科学习专家') :
    goalCategory === 'language' ? (isEn ? 'language learning expert' : '语言学习专家') :
    (isEn ? 'domain expert' : '领域专家')) : (isEn ? 'knowledge assessment expert' : '知识考核专家')

  const sections: string[] = []
  if (config.multipleChoice > 0) {
    sections.push(isEn
      ? `- ${config.multipleChoice} multiple choice questions (4 options A/B/C/D, one correct answer)`
      : `- ${config.multipleChoice} 道单选题（4个选项ABCD，只有一个正确答案）`)
  }
  if (config.trueFalse > 0) {
    sections.push(isEn
      ? `- ${config.trueFalse} true/false questions (answer: true or false)`
      : `- ${config.trueFalse} 道判断题（答案为正确/错误）`)
  }
  if (config.fillBlank > 0) {
    sections.push(isEn
      ? `- ${config.fillBlank} fill-in-the-blank questions (use ___ as blank placeholder)`
      : `- ${config.fillBlank} 道填空题（用 ___ 表示空白处）`)
  }
  if (config.shortAnswer > 0) {
    sections.push(isEn
      ? `- ${config.shortAnswer} short answer questions (concise reference answers)`
      : `- ${config.shortAnswer} 道简答题（附参考答案）`)
  }

  const prompt = isEn
    ? `You are a ${categoryRole}. Please generate a comprehensive exam for the following learning goal.

Goal: "${goalTitle}"
${docSection}

Generate exactly:
${sections.join('\n')}

Requirements:
1. Questions MUST be based on the provided learning materials above. Do not invent content not present in the materials.
2. Difficulty should be distributed: ~40% easy, ~40% medium, ~20% hard.
3. Cover different knowledge points across all questions (no duplicate topics).
4. For multiple choice: provide clear distractors that reflect common misconceptions.
5. For fill-in-the-blank: each question should have 1-3 blanks with concise answers.
6. For short answer: reference answer should be 2-5 sentences.
7. Include explanation for each question.
8. Mark the source document reference (sourceRef) where applicable.

Return ONLY the following JSON (no other text):
{
  "multipleChoiceQuestions": [
    {
      "type": "multiple_choice",
      "question": "Question text",
      "options": ["A. option", "B. option", "C. option", "D. option"],
      "correctIndex": 0,
      "explanation": "Explanation",
      "difficulty": "easy|medium|hard",
      "sourceRef": "Document 1, section..."
    }
  ],
  "trueFalseQuestions": [
    {
      "type": "true_false",
      "question": "Statement to judge",
      "correctBool": true,
      "explanation": "Explanation",
      "difficulty": "easy|medium|hard",
      "sourceRef": "Document 1, section..."
    }
  ],
  "fillBlankQuestions": [
    {
      "type": "fill_blank",
      "question": "Question with ___ blanks",
      "blanks": ["answer1", "answer2"],
      "explanation": "Explanation",
      "difficulty": "easy|medium|hard",
      "sourceRef": "Document 1, section..."
    }
  ],
  "shortAnswerQuestions": [
    {
      "type": "short_answer",
      "question": "Question",
      "referenceAnswer": "Reference answer",
      "explanation": "Key points",
      "difficulty": "easy|medium|hard",
      "sourceRef": "Document 1, section..."
    }
  ]
}`
    : `你是一位${categoryRole}，请为以下学习目标出一套完整的综合测验。

目标：「${goalTitle}」
${docSection}

请生成以下题目（严格按数量）：
${sections.join('\n')}

要求：
1. 题目必须完全基于上方提供的学习资料内容出题，不得凭空编造资料中没有的知识点
2. 难度分布合理：约40%基础、40%进阶、20%挑战
3. 题目覆盖不同知识点（同类题目不重复考查同一知识点）
4. 单选题：错误选项要体现常见误区，避免过于明显
5. 填空题：每题1-3个空，答案简洁精确（关键词）
6. 简答题：参考答案2-5句话，涵盖核心要点
7. 每道题附解析（explanation）
8. 标注题目来源的资料（sourceRef）

仅返回以下JSON格式（不要添加任何其他内容）：
{
  "multipleChoiceQuestions": [
    {
      "type": "multiple_choice",
      "question": "题目",
      "options": ["A. 选项", "B. 选项", "C. 选项", "D. 选项"],
      "correctIndex": 0,
      "explanation": "解析",
      "difficulty": "easy|medium|hard",
      "sourceRef": "资料1，第X章/节"
    }
  ],
  "trueFalseQuestions": [
    {
      "type": "true_false",
      "question": "判断陈述",
      "correctBool": true,
      "explanation": "解析",
      "difficulty": "easy|medium|hard",
      "sourceRef": "资料1，第X章/节"
    }
  ],
  "fillBlankQuestions": [
    {
      "type": "fill_blank",
      "question": "含___空白处的题目",
      "blanks": ["答案1", "答案2"],
      "explanation": "解析",
      "difficulty": "easy|medium|hard",
      "sourceRef": "资料1，第X章/节"
    }
  ],
  "shortAnswerQuestions": [
    {
      "type": "short_answer",
      "question": "简答题题目",
      "referenceAnswer": "参考答案",
      "explanation": "评分要点",
      "difficulty": "easy|medium|hard",
      "sourceRef": "资料1，第X章/节"
    }
  ]
}`

  const messages: ChatCompletionMessage[] = [
    {
      role: 'system',
      content: isEn
        ? 'You are a professional exam designer. Generate questions strictly based on the provided materials. Return ONLY valid JSON with no other text.'
        : '你是一个专业的考试出题专家。请严格基于提供的学习资料出题，不要编造资料中没有的内容。仅返回合法的JSON，不要添加任何其他文字。'
    },
    { role: 'user', content: prompt }
  ]

  const maxRetries = 2
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      let result = await callDirectDeepSeek(messages, 8192)
      if (!result) result = await callViaEdgeFunction(messages, 8192)
      if (!result) throw new Error(isEn ? 'AI service unavailable.' : 'AI 服务不可用。')

      const parsed = safeJSONParse(stripMarkdownCodeBlock(result)) as {
        multipleChoiceQuestions?: any[]
        trueFalseQuestions?: any[]
        fillBlankQuestions?: any[]
        shortAnswerQuestions?: any[]
      }

      const toQ = (q: any, i: number): FinalExamQuestion => ({
        id: `fq-${Date.now()}-${i}`,
        type: q.type,
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        correctBool: q.correctBool,
        blanks: q.blanks,
        referenceAnswer: q.referenceAnswer,
        explanation: q.explanation,
        difficulty: q.difficulty || 'medium',
        sourceRef: q.sourceRef,
      })

      const exam: FinalExam = {
        goalTitle,
        totalQuestions: totalQ,
        multipleChoiceQuestions: (parsed.multipleChoiceQuestions || []).map(toQ),
        trueFalseQuestions: (parsed.trueFalseQuestions || []).map(toQ),
        fillBlankQuestions: (parsed.fillBlankQuestions || []).map(toQ),
        shortAnswerQuestions: (parsed.shortAnswerQuestions || []).map(toQ),
        generatedAt: new Date().toISOString(),
      }
      return exam
    } catch (err: any) {
      lastError = err
      console.warn(`[generateFinalExam] 第${attempt + 1}次尝试失败:`, err)
    }
  }

  throw lastError || new Error(isEn ? 'Failed to generate exam.' : '生成测验失败，请重试。')
}


// 保持 generateId 导出（供其他模块使用）
export { generateId }

interface TaskAssistantOptions {
  taskTitle: string
  taskDescription?: string
  goalTitle: string
  goalContext?: string
  goalCategory?: string
  userName: string
  // 新增 Step 4 字段
  resourceReference?: string  // 任务引用的资料位置
  completedTasks?: string[]    // 用户已完成的同级任务（用于判断进度）
}

export async function askTaskAssistant(options: TaskAssistantOptions): Promise<string> {
  const { taskTitle, taskDescription, goalTitle, goalContext, goalCategory, userName, resourceReference, completedTasks } = options

  const categoryContext = getCategoryContext(goalCategory || '', goalTitle)
  const progressSection = completedTasks && completedTasks.length > 0
    ? `\n用户已完成的任务：${completedTasks.join('、')}（供你判断进度和衔接）`
    : ''
  const referenceSection = resourceReference
    ? `\n本次任务引用的资料位置：${resourceReference}（讲解时请引用具体位置，帮助用户定位）`
    : ''

  const prompt = `用户"${userName}"正在执行任务：
- 任务名称：${taskTitle}
- 任务描述：${taskDescription || '无'}
- 所属目标：${goalTitle}
${goalContext ? `- 目标详情：${goalContext}` : ''}
${categoryContext}${progressSection}${referenceSection}

请根据任务内容提供帮助：

**根据分类给出针对性内容**：
- 学习类：具体知识点讲解 + 常见误区 + 记忆技巧
- 考试类：答题技巧 + 知识点脉络 + 高频考点
- 健身类：动作要领 + 呼吸节奏 + 安全注意事项
- 语言类：学习方法 + 语感培养 + 练习技巧
- 阅读类：内容梳理 + 理解要点 + 笔记方法

回复要求（Step 4 增强）：
1. 直接切入主题，结合任务引用的资料位置给出精准讲解
2. 可以提出引导性问题帮助用户思考
3. 语气要符合专业助手风格，但不失温度
4. 如果有进度背景（已完成的任务），要提及与当前任务的衔接关系

请直接回复，不要添加格式。`

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: '你是一个专业的任务助手，擅长提供学习答疑、健身指导、技能训练帮助。请简洁、直接、有深度地帮助用户完成任务。' },
    { role: 'user', content: prompt }
  ]

  const result =
    (await callViaEdgeFunction(messages, 8192)) ||
    (await callDirectDeepSeek(messages, 8192))

  if (!result) {
    throw new Error('AI 服务不可用：无法提供任务指导。请检查 API Key 配置和网络连接。')
  }

  return result
}

// 根据目标类型获取上下文
function getCategoryContext(category: string, goalTitle: string): string {
  const lowerCategory = (category + ' ' + goalTitle).toLowerCase()

  if (lowerCategory.includes('健身') || lowerCategory.includes('运动') || lowerCategory.includes('跑步') || lowerCategory.includes('减脂') || lowerCategory.includes('增肌')) {
    return `- 任务类型：健身运动类\n- 需要：具体的动作指导、健身建议`
  }
  if (lowerCategory.includes('学习') || lowerCategory.includes('英语') || lowerCategory.includes('编程') || lowerCategory.includes('python')) {
    return `- 任务类型：学习提升类\n- 需要：学习方法、知识讲解`
  }
  if (lowerCategory.includes('阅读') || lowerCategory.includes('书')) {
    return `- 任务类型：阅读类\n- 需要：阅读技巧、内容理解`
  }
  if (lowerCategory.includes('考试') || lowerCategory.includes('备考')) {
    return `- 任务类型：考试备考类\n- 需要：复习计划、考试技巧`
  }

  return `- 任务类型：综合类\n- 需要：根据任务内容提供针对性帮助`
}

/**
 * =====================================================
 * 生成学习摘要
 * 基于目标的任务列表，整理出学习要点
 * =====================================================
 */
interface StudySummaryOptions {
  goalTitle: string
  goalContext?: string
  goalCategory?: string
  /** 附件文档的提取文本（合并多个文档），让 AI 基于真实内容生成指南 */
  documentTexts?: { name: string; text: string }[]
  dailyTasks: {
    title: string
    description?: string
    duration?: number
    dayIndex?: number
    difficultyLevel?: string
    resourceReference?: string
  }[]
  userName: string
}

export async function generateStudySummary(options: StudySummaryOptions): Promise<string> {
  const { goalTitle, goalContext, goalCategory, dailyTasks, userName, documentTexts } = options

  // 如果没有任务，直接返回提示
  if (dailyTasks.length === 0) {
    return `暂无任务安排。建议先规划一下学习内容，有计划才能高效执行！`
  }

  // 使用全部任务
  const tasksSummary = dailyTasks
    .map((t, i) => `${i + 1}. ${t.title}${t.resourceReference ? `（📖 ${t.resourceReference}）` : ''}${t.difficultyLevel ? ` [${t.difficultyLevel === 'easy' ? '基础' : t.difficultyLevel === 'medium' ? '进阶' : '挑战'}]` : ''}${t.duration ? ` ${t.duration}分钟` : ''}`)
    .join('\n')

  const categoryRole = getStudySummaryRole(goalCategory || 'other')

  // 构建文档内容区块（每份只取前 600 字，结构化分节，和 outline 一致）
  const PER_DOC_CHARS = 600
  const docSection = documentTexts && documentTexts.length > 0
    ? `\n\n---\n【用户上传的 ${documentTexts.length} 份学习资料（请逐一对照分析，不要只挑前几份）】\n` +
      documentTexts.map((d, i) =>
        `### 资料${i + 1}\n文件名：${d.name}\n内容节选：\n${d.text.slice(0, PER_DOC_CHARS)}`
      ).join('\n\n')
    : ''

  const docCount = documentTexts?.length || 0
  const taskCount = dailyTasks.length

  const prompt = `${categoryRole}

用户"${userName}"正在学习目标「${goalTitle}」。
${goalContext ? `目标背景：${goalContext}\n` : ''}
当前任务清单：
${tasksSummary}
${docSection}

请基于以上全部 ${docCount} 份资料和 ${taskCount} 个任务生成精准的学习指南。要求：
- 从「资料1」开始，逐份分析，依次覆盖所有 ${docCount} 份资料，不要跳号、不要遗漏最前面的资料
- 从资料原文中提取具体知识点（不要笼统说"掌握核心概念"，要说"掌握 XX 章 XX 原理/定理/模型"）
- 如果资料与任务有对应关系，明确标注
- 建议学习顺序：先看哪些资料再完成哪些任务，为什么
- 知识串联：各部分之间的逻辑关联

请直接回复，不添加多余格式标记。`

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: `你是专业的学习规划助手。用户上传了 ${docCount} 份学习资料和 ${taskCount} 个任务。请从资料1开始，逐一对照所有资料和任务，从资料原文中提取精准知识点，不要凭空编造，不要遗漏前面的资料。` },
    { role: 'user', content: prompt },
  ]

  const result =
    (await callViaEdgeFunction(messages, 8192)) ||
    (await callDirectDeepSeek(messages, 8192))

  if (!result) {
    throw new Error('AI 服务不可用：无法生成学习摘要。请检查 API Key 配置和网络连接。')
  }

  return result
}

/**
 * =====================================================
 * 构建目标上下文字符串
 * 将目标的 description + context + currentStatus + 附件文字聚合为一段上下文
 * 供 AI 函数使用，让 AI 更精准理解用户的目标
 * =====================================================
 */
export function buildGoalContextString(goal: Goal): string {
  const parts: string[] = []

  // 1. 目标描述
  if (goal.description) {
    parts.push(`目标描述：${goal.description}`)
  }

  // 2. 用户补充的上下文
  if (goal.context) {
    parts.push(`补充上下文：${goal.context}`)
  }

  // 3. 当前状态
  if (goal.currentStatus) {
    parts.push(`当前状态：${goal.currentStatus}`)
  }

  // 4. 附件文字内容
  if (goal.attachments && goal.attachments.length > 0) {
    for (const att of goal.attachments) {
      if (att.type === 'document' && att.extractedText) {
        parts.push(`[附件：${att.name}]\n${att.extractedText}`)
      } else if (att.type === 'image' && att.imageDescription) {
        parts.push(`[图片：${att.name}] 用户描述：${att.imageDescription}`)
      }
    }
  }

  return parts.join('\n\n')
}

// 根据分类返回学习摘要专家角色
function getStudySummaryRole(category: string): string {
  const roles: Record<string, string> = {
    study: '你是学习规划师，擅长梳理知识点脉络、指出章节间的关联、帮助建立知识体系。',
    exam: '你是考试策略专家，擅长倒计时规划、高频考点排序和答题节奏把控。',
    fitness: '你是健身教练，擅长训练计划的当日要点提炼和渐进超负荷原则说明。',
    language: '你是语言学习专家，擅长听说读写的分项训练要点和语感培养方法。',
    reading: '你是阅读导师，擅长书籍内容精要与章节脉络的梳理。',
    career: '你是职业发展顾问，擅长技能差距分析和核心竞争力培养路径。',
    skill: '你是技能训练专家，擅长刻意练习原理的应用和实操要点提炼。',
    other: '你是一个专业的学习规划助手，擅长从任务列表中提炼学习要点。'
  }
  return roles[category] || roles.other
}

// 根据子目标标题注入学科知识点提示（解决背景信息不足时AI出自我评估题的问题）
function getSubjectHints(topic: string): string {
  const lower = topic.toLowerCase()

  // 微观经济学（Pindyck 教材风格）
  if (lower.includes('微观经济') || lower.includes('microeconomics') || lower.includes('经济学')) {
    if (lower.includes('1-4') || lower.includes('1~4') || lower.includes('第1') || lower.includes('第2') || lower.includes('第3') || lower.includes('第4')) {
      return `该子目标涉及微观经济学第1-4章，核心知识点包括：
- 第1章 导论：微观经济学的研究对象、实证分析与规范分析、市场边界
- 第2章 供给与需求：需求曲线与供给曲线的移动因素、均衡价格与均衡数量、价格弹性（需求弹性、供给弹性）、收入弹性、交叉弹性、政府限价（最高限价/最低限价）的影响
- 第3章 消费者行为：效用最大化、边际效用递减、无差异曲线、边际替代率（MRS）递减、预算约束线、消费者均衡条件（MRS = 价格比）、价格-消费曲线与收入-消费曲线
- 第4章 个人需求与市场需求：替代效应与收入效应（希克斯分解与斯勒茨基分解）、正常品/劣等品/吉芬商品、消费者剩余、市场需求曲线的推导、网络外部性（攀比效应/虚荣效应）
请围绕上述具体概念出题，不要出自我评估题。`
    }
    if (lower.includes('5-8') || lower.includes('5~8') || lower.includes('第5') || lower.includes('第6') || lower.includes('第7') || lower.includes('第8')) {
      return `该子目标涉及微观经济学第5-8章，核心知识点包括：
- 第5章 不确定性与消费者行为：期望值、期望效用理论（Von Neumann-Morgenstern）、风险偏好（风险规避/风险中性/风险爱好）、确定性等价、风险溢价、分散化与保险
- 第6章 生产：生产函数、短期与长期、边际报酬递减规律、等产量线、边际技术替代率（MRTS）递减、规模报酬（递增/不变/递减）、柯布-道格拉斯生产函数
- 第7章 生产成本：机会成本、会计成本与经济成本、沉没成本、固定成本/可变成本/总成本、边际成本（MC）与平均成本（AC、AVC）的关系及曲线形状、成本最小化（等成本线与等产量线切点）、短期与长期成本曲线
- 第8章 利润最大化与竞争性供给：完全竞争市场特征、利润最大化条件 P=MC、短期供给曲线（MC在AVC以上的部分）、生产者剩余、长期均衡（P=min LAC）、经济租、长期供给曲线（成本不变/递增/递减行业）
请围绕上述具体概念出题，不要出自我评估题。`
    }
    // 默认微观经济学综合
    return `该子目标涉及微观经济学综合复习，核心知识点涵盖：供给与需求（弹性、均衡）、消费者行为（效用最大化、无差异曲线、MRS）、替代效应与收入效应、生产与成本（边际报酬递减、MC/AC曲线关系）、完全竞争市场（P=MC、短期与长期供给）、垄断与市场势力、寡头垄断与博弈论（纳什均衡、囚徒困境）、要素市场、一般均衡与福利经济学（帕累托效率）、市场失灵（外部性、公共品、信息不对称）。请围绕上述具体概念出题，不要出自我评估题。`
  }

  // 宏观经济学
  if (lower.includes('宏观经济') || lower.includes('macroeconomics')) {
    return `宏观经济学核心知识点：GDP核算（支出法/收入法）、名义GDP与实际GDP、CPI与通货膨胀、失业率与自然失业率、索洛增长模型、资本的黄金律水平、IS-LM模型、总需求-总供给（AD-AS）模型、货币政策与财政政策传导机制、蒙代尔-弗莱明模型、菲利普斯曲线、理性预期、实际经济周期理论。请围绕上述具体概念出题。`
  }

  // 线性代数
  if (lower.includes('线性代数') || lower.includes('linear algebra')) {
    return `线性代数核心知识点：矩阵运算（加法、乘法、转置、逆矩阵）、行列式计算与性质、向量空间与子空间、线性相关/无关、秩（Rank）、线性方程组的解结构、特征值与特征向量、对角化、正交矩阵与QR分解、二次型。请围绕上述具体概念出题。`
  }

  // 概率论与数理统计
  if (lower.includes('概率') || lower.includes('统计')) {
    return `概率统计核心知识点：概率公理、条件概率与贝叶斯定理、随机变量及其分布（离散/连续）、期望与方差、常见分布（二项、泊松、正态、指数、t分布、卡方、F分布）、大数定律与中心极限定理、参数估计（矩估计、MLE）、区间估计、假设检验（Z检验、t检验、卡方检验）、回归分析（OLS、R²、显著性检验）。请围绕上述具体概念出题。`
  }

  // 微积分
  if (lower.includes('微积分') || lower.includes('calculus') || lower.includes('数学分析')) {
    return `微积分核心知识点：极限与连续性、导数定义与几何意义、求导法则（链式、乘积、商法则）、中值定理（罗尔、拉格朗日、柯西）、泰勒展开、不定积分与定积分、牛顿-莱布尼茨公式、变限积分、反常积分、多元函数偏导数、梯度、二重/三重积分、曲线与曲面积分、格林公式/高斯公式/斯托克斯公式、级数敛散性判别。请围绕上述具体概念出题。`
  }

  // 数据库
  if (lower.includes('数据库') || lower.includes('database') || lower.includes('sql')) {
    return `数据库核心知识点：关系模型与关系代数（选择、投影、连接、并交差）、SQL语句（SELECT/JOIN/GROUP BY/HAVING/子查询）、数据库范式（1NF/2NF/3NF/BCNF）、函数依赖与无损分解、事务ACID特性、并发控制（锁、乐观锁、悲观锁、MVCC）、索引原理（B+树、哈希索引）、SQL注入原理与防御、ER图设计。请围绕上述具体概念出题。`
  }

  // 编程/算法
  if (lower.includes('算法') || lower.includes('数据结构') || lower.includes('编程') || lower.includes('leetcode')) {
    return `数据结构与算法核心知识点：时间复杂度与空间复杂度分析、数组/链表/栈/队列、二叉树遍历（前序/中序/后序/层序）、BST与平衡树（AVL/红黑树）、堆与优先队列、哈希表与冲突解决、图遍历（BFS/DFS）、最短路径（Dijkstra/Floyd/Bellman-Ford）、最小生成树（Prim/Kruskal）、动态规划（背包/最长公共子序列/最长递增子序列）、排序算法（快排/归并/堆排及稳定性）、递归与回溯、贪心算法。请围绕上述具体概念出题。`
  }

  return ''
}

// 根据分类返回测验出题策略
function getQuizStrategy(category: string): string {
  const strategies: Record<string, string> = {
    study: `出题策略（学习类）：
1. 题目内容必须紧密围绕目标背景信息中的知识点
2. 题型多样性：包含概念题（"以下哪个是XXX的定义"）+ 应用题（"若XXX，则YYY"）+ 判断题变形
3. 错误答案要看起来合理但不能太明显
4. 每道题后面附上简要解析，解析中要指出知识点来源（章节/页码）`,
    exam: `出题策略（考试类）：
1. 高频考点优先出题，覆盖选择/判断/简答等多种题型
2. 历年真题风格模拟，注意题型难度梯度
3. 错误选项要体现考生常见误区
4. 解析中要说明考点属于哪一章节、常见失分原因`,
    fitness: `出题策略（健身类）：
1. 动作名称、发力部位、常见错误动作
2. 训练原则（超负荷、渐进性、恢复周期）
3. 营养与恢复相关知识
4. 题型：判断题（动作正误）+ 选择题（原理理解）`,
    language: `出题策略（语言类）：
1. 词汇题（语境选择）+ 语法结构题 + 阅读理解片段
2. 注意中文表述和目标语言表达的差异
3. 解析中给出该知识点的学习技巧`,
    reading: `出题策略（阅读类）：
1. 书籍/文章核心观点的理解题
2. 关键概念辨析题
3. 作者意图和论证结构分析
4. 题型：判断题 + 选择分析题`,
    career: `出题策略（职业类）：
1. 技能概念理解 + 场景应用判断
2. 职业发展知识（如目标设定SMART原则、沟通技巧）
3. 题型以理解应用为主`,
    skill: `出题策略（技能类）：
1. 操作步骤排序题 + 概念理解题 + 常见错误识别
2. 理论与实操结合的混合题
3. 每道题附上相关实操要点`,
    other: `出题要求：
1. 题目内容必须紧密围绕目标背景信息中的知识点，不能出无关题目
2. 每道题必须包含4个选项（A、B、C、D）
3. 正确答案随机分布在不同选项中
4. 错误答案要看起来合理但不能太明显
5. 每道题后面附上简要解析`
  }
  return strategies[category] || strategies.other
}

/**
 * =====================================================
 * 讲解模式 — NotebookLM 风格的主动讲解功能
 * =====================================================
 */

export type LectureMode = 'overview' | 'chapter' | 'keypoints' | 'example' | 'quiz_prep'

export interface LectureOptions {
  goalTitle: string
  goalContext?: string        // 目标上下文（含附件提取文本）
  subGoalTitle?: string       // 当前聚焦的章节/子目标
  mode: LectureMode
  userName: string
  priorExchange?: string      // 上一轮对话摘要（用于连续讲解时保持衔接）
  sourceDocuments?: SourceDocument[]  // 结构化的源文档信息
}

/**
 * 结构化源文档片段
 * 让 AI 清楚知道每段文字来自哪个附件/章节，从而能标注引用来源
 */
export interface SourceDocument {
  name: string           // 附件文件名
  type: 'pdf' | 'docx' | 'text' | 'image'
  textSnippet: string    // 提取的文本内容（截取）
  fullText?: string      // 完整文本（可选，用于按需引用）
}

/**
 * 从 Goal 的附件中构建结构化源文档列表
 * 供讲解模式使用，让 AI 能引用具体出处
 */
export function buildSourceDocuments(goal: Goal): SourceDocument[] {
  const docs: SourceDocument[] = []
  if (!goal.attachments || goal.attachments.length === 0) return docs

  for (const att of goal.attachments) {
    if (att.type === 'document' && att.extractedText) {
      const ext = att.name?.split('.').pop()?.toLowerCase() || 'text'
      const docType = ext === 'pdf' ? 'pdf' : ext === 'docx' || ext === 'doc' ? 'docx' : 'text'
      docs.push({
        name: att.name,
        type: docType,
        textSnippet: att.extractedText.slice(0, 8000),
        fullText: att.extractedText,
      })
    } else if (att.type === 'image' && att.imageDescription) {
      docs.push({
        name: att.name,
        type: 'image',
        textSnippet: att.imageDescription,
      })
    }
  }
  return docs
}

/**
 * 将源文档格式化为可注入 prompt 的文本
 * 生成带编号的引用格式，如 [文档1: 微观经济学.pdf]
 */
function formatSourceDocumentsForPrompt(docs: SourceDocument[]): string {
  if (docs.length === 0) return ''

  const parts: string[] = ['【用户上传的学习资料（请在回答中引用具体出处）】']

  docs.forEach((doc, idx) => {
    parts.push(`\n[文档${idx + 1}: ${doc.name}]`)
    // 如果全文超过 8000 字符，只给摘要 + 提示全文可用
    if (doc.fullText && doc.fullText.length > 8000) {
      parts.push(doc.textSnippet)
      parts.push(`（该文档共 ${Math.round(doc.fullText.length / 500)} 段，以上为节选。如需引用更后面的内容，可说明需要查阅哪部分。）`)
    } else {
      parts.push(doc.textSnippet)
    }
  })

  return parts.join('\n')
}

const LECTURE_MODE_LABELS: Record<LectureMode, string> = {
  overview:    '整体知识框架梳理',
  chapter:     '章节详细讲解',
  keypoints:   '考试/核心重点提炼',
  example:     '举一个具体例子',
  quiz_prep:   '帮我检验一下理解',
}

/**
 * 生成讲解内容（NotebookLM 风格）
 *
 * 核心设计：
 * - AI 必须引用用户上传的文档内容，像"拿着教材在讲"而不是"凭记忆在讲"
 * - 每段讲解中标注引用来源，如"根据你上传的教材第7章关于生产成本的分析..."
 * - 语气像家教，不是客服
 */
export async function generateLecture(options: LectureOptions): Promise<string> {
  const { goalTitle, goalContext, subGoalTitle, mode, userName, priorExchange, sourceDocuments } = options

  const modeLabel = LECTURE_MODE_LABELS[mode]
  const focusSection = subGoalTitle ? `当前聚焦章节/主题：「${subGoalTitle}」` : ''
  const priorSection = priorExchange
    ? `\n\n【前一轮讲解内容（用户要求继续，请自然衔接）】\n${priorExchange}`
    : ''

  // 构建源文档区块
  const sourceSection = sourceDocuments && sourceDocuments.length > 0
    ? formatSourceDocumentsForPrompt(sourceDocuments)
    : (goalContext ? `\n\n【目标相关资料/背景】\n${goalContext.slice(0, 6000)}` : '')

  const modeInstructions: Record<LectureMode, string> = {
    overview: `请给${userName}做一个整体知识框架梳理：
- 如果有上传的文档，先说"我们来梳理一下你上传的《XXX》的整体脉络"
- 用1-2句话点出这门课/这个目标的核心主线是什么
- 列出3-6个最重要的知识模块，每个模块用一句话说清楚它在干什么
- 点明各模块之间最关键的逻辑关系
- 如果文档中有目录或章节标题，直接引用（"根据教材目录，全书分为X个部分..."）
- 最后告诉${userName}建议的学习顺序和理由
- 结尾留一个引导："你对哪个部分最感兴趣，或者觉得最难？可以告诉我，我们从那里开始。"`,

    chapter: `请给${userName}讲解「${subGoalTitle || goalTitle}」这个部分：
- 如果在文档中找到了对应的章节内容，先说"翻到你上传的教材中关于「${subGoalTitle || goalTitle}」的部分..."
- 先1句话说清楚这一章的核心目的是什么（学完它你能做什么）
- 把这章最重要的2-4个概念一一讲清楚，用生活中的例子类比
- 讲解时要引用文档中的原文或关键定义（如"教材中写道：XXX"）
- 点出这章最容易搞混/出错的地方是什么，为什么
- 讲完后问：「这里有什么地方不清楚吗？或者要我换个角度再解释一遍？」`,

    keypoints: `请帮${userName}整理「${subGoalTitle || goalTitle}」的考试/核心重点：
- 如果有文档，从文档内容中提炼考点，并标注"这一部分在教材的XXX页/XXX节"
- 列出3-6个最高频、最核心的知识点（用加粗短语标注）
- 每个重点后面说明：考试或实际应用中它通常以什么形式出现
- 点出哪些是「基础必会」，哪些是「进阶加分」
- 最后说：「要我帮你出几道题检验一下吗？」`,

    example: `请给${userName}举一个能帮助理解「${subGoalTitle || goalTitle}」的具体例子：
- 如果文档中有相关内容，先引用原文定义（"教材中对XXX的定义是..."）
- 例子要来自日常生活或真实场景，不要用教科书里的例子
- 先描述场景，再说明这个场景对应的是哪个知识点/概念
- 解释为什么这个例子能说明这个概念，概念的哪些特征在例子里体现了
- 如果有对比例子更好（正例+反例）
- 最后问：「这个例子对你有帮助吗？还需要我换一个角度吗？」`,

    quiz_prep: `请用提问的方式帮${userName}检验对「${subGoalTitle || goalTitle}」的理解：
- 如果有文档，基于文档中的具体内容出题
- 先出1道填空/简答形式的问题（不是选择题），等${userName}回答
- 问题要考核最核心的概念，答不上来说明哪里需要补强
- 告诉${userName}：「不用担心答错，这是我们发现薄弱点的方式。」
- 等${userName}回答后给出点评和补充`,
  }

  const hasDocs = sourceDocuments && sourceDocuments.length > 0

  const prompt = `你现在进入「讲解模式」，作为${userName}的家教为他/她讲解以下内容。

目标：「${goalTitle}」
${focusSection}
讲解类型：${modeLabel}
${sourceSection}${priorSection}

【讲解要求】
${modeInstructions[mode]}

${hasDocs ? `【引用要求 — 非常重要】
- 你手上有用户上传的真实学习资料（见上方文档内容）
- 讲解时必须像"正在读用户的书"一样，引用文档中的具体内容
- 用自然的口吻标注来源，如"根据你上传的教材中关于XXX的部分..."、"教材里提到..."
- 不要凭空编造内容，如果文档中没有相关信息就坦诚说"这部分文档中没有涉及"
- 让用户感受到你真的在读他/她的书，而不是在背诵通用知识` : `【注意】
- 目前没有上传的文档资料，请基于你的知识进行讲解
- 如果用户有上传教材，讲解效果会更好`}

【风格要求】
- 语气像一个耐心的家教，不是客服也不是讲座老师
- 用口语化表达，避免干巴巴地列条目
- 不要说「我是AI」「我来帮你」这类开场白，直接进入内容`

  const messages: ChatCompletionMessage[] = [
    {
      role: 'system',
      content: hasDocs
        ? `你是一个有温度的家教，现在正在翻阅用户上传的学习资料为他/她讲解。你的讲解扎根于用户提供的具体内容，会自然地引用"教材中写道..."、"根据你上传的文档..."来让用户感受到你真的在读他/她的书。讲解有层次、有类比、有互动引导。`
        : `你是一个有温度的家教，擅长把复杂概念讲得清晰易懂。你的讲解有层次、有类比、有互动引导。你不会只是列出条目，而是像真正在给学生讲课。`
    },
    { role: 'user', content: prompt }
  ]

  const result =
    (await callDirectDeepSeek(messages, 8192)) ||
    (await callViaEdgeFunction(messages, 8192))

  if (!result) {
    throw new Error('AI 服务不可用：无法生成讲解内容。')
  }

  return result
}

/**
 * 从目标附件中自动生成章节大纲
 * 解析文档结构，返回章节列表供用户点击讲解
 */
export interface ChapterOutline {
  chapters: {
    title: string
    summary: string        // 一句话概括这章内容
    keyTerms: string[]     // 核心术语（3-5个）
  }[]
  totalChapters: number
  suggestedOrder: string  // 建议的学习顺序说明
}

export async function generateChapterOutline(
  goalTitle: string,
  documents: { name: string; text: string }[]   // 多个文档附件，每个对应一个章节
): Promise<ChapterOutline> {
  if (documents.length === 0) {
    throw new Error('没有可用的文档内容。请先上传文档附件。')
  }

  // 每份文档只取前 600 字（文件名 + 开头内容已足够判断主题）
  // 总量 600×N，不会因为 N 变大而超预算
  const PER_DOC_CHARS = 600

  const docSections = documents.map((d, i) => {
    const snippet = d.text.slice(0, PER_DOC_CHARS)
    return `---\n### 文档${i + 1}\n文件名：${d.name}\n开头节选：\n${snippet}`
  }).join('\n')

  const prompt = `请逐一分析以下每份文档，各生成一个章节条目。

目标：「${goalTitle}」

${docSections}

要求：
- 逐份处理：按编号顺序，每份文档对应一个章节条目 —— 不要跳过、不要合并、不要额外添加
- 标题：优先使用文档文件名中的编号/主题推断（如文件名含 Chapter7 →「第7章 · …」，文件名含 intro →「导论」），再结合开头内容的主题补充
- 摘要（≤25字）：概括这份文档的核心内容，用文档原文的关键词
- 术语：从该文档开头节选中提取 3 个有代表性的专业术语
- 如果文档是 PPT 风格（短句多、含版权声明），忽略噪声，聚焦知识点

请按以下 JSON 格式输出（每个文档一条，顺序一致）：
{
  "chapters": [
    { "title": "章节标题", "summary": "核心内容概括", "keyTerms": ["术语A", "术语B", "术语C"] }
  ],
  "totalChapters": 实际输出的章节数,
  "suggestedOrder": "学习顺序建议（1句话）"
}

不要添加注释、不要省略任何文档。`

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: '你是课程结构分析专家。用户上传了多份独立的文档。请逐一分析每份文档，各自总结为一个章节条目。不要跳过任何文档，也不要把多份文档合并为一个章节。严格按 JSON 格式输出，顺序与输入一致。' },
    { role: 'user', content: prompt }
  ]

  const result =
    (await callDirectDeepSeek(messages, 8192)) ||
    (await callViaEdgeFunction(messages, 8192))

  if (!result) {
    throw new Error('AI 服务不可用：无法生成章节大纲。')
  }

  return safeJSONParse(stripMarkdownCodeBlock(result)) as ChapterOutline
}

/**
 * 生成速记卡（Flashcard）
 * 对标 NotebookLM 的 Study Guide 功能
 */
export interface Flashcard {
  id: string
  front: string    // 正面：概念/问题
  back: string     // 背面：解释+例子
  chapter: string  // 所属章节
  difficulty: 'easy' | 'medium' | 'hard'
}

export async function generateFlashcards(options: {
  goalTitle: string
  chapterTitle: string
  chapterContent?: string   // 该章节的提取文本（可选）
  count?: number
}): Promise<Flashcard[]> {
  const { goalTitle, chapterTitle, chapterContent, count = 5 } = options

  const contentSection = chapterContent
    ? `\n\n章节内容参考：\n${chapterContent.slice(0, 4000)}`
    : ''

  const prompt = `请为「${goalTitle}」中的「${chapterTitle}」章节生成 ${count} 张速记卡。

${contentSection}

速记卡格式要求：
- 正面（front）：一个概念名、术语或问题（10-20字）
- 背面（back）：简洁的解释 + 一个生活化例子（50-100字）
- 难度分布：简单2张、中等2张、困难1张

请用 JSON 返回：
{
  "flashcards": [
    {
      "front": "什么是需求价格弹性？",
      "back": "衡量价格变化1%时需求量变化百分比的指标。例：大米价格涨10%但购买量几乎不变，说明大米需求缺乏弹性（|Ed|<1）。",
      "difficulty": "easy"
    }
  ]
}`

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: '你是一个记忆卡片设计专家。正面要简洁引发思考，背面要解释清晰并配生活化例子。严格按 JSON 格式输出。' },
    { role: 'user', content: prompt }
  ]

  const result =
    (await callDirectDeepSeek(messages, 8192)) ||
    (await callViaEdgeFunction(messages, 8192))

  if (!result) {
    throw new Error('AI 服务不可用：无法生成速记卡。')
  }

  const parsed = safeJSONParse(stripMarkdownCodeBlock(result)) as { flashcards: Omit<Flashcard, 'id' | 'chapter'>[] }
  return (parsed.flashcards || []).map((card, i) => ({
    ...card,
    id: `fc-${Date.now()}-${i}`,
    chapter: chapterTitle,
  }))
}
