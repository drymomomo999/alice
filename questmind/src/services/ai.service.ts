/**
 * QuestMind AI 服务
 *
 * 调用方式（优先级顺序）：
 * 1. 直连 DeepSeek Chat（优先，走 Vite 代理绕 CORS）
 *    - 在 .env 中设置 VITE_DEEPSEEK_API_KEY
 *    - 注意：Key 会暴露在浏览器，仅用于开发调试
 *
 * 2. Supabase Edge Function（生产推荐，API Key 不暴露前端）
 *    - 需要先部署: supabase functions deploy ai-chat
 *    - 配置 Secret: supabase secrets set DEEPSEEK_API_KEY=sk-xxxx
 *    - 前端无需配置 VITE_DEEPSEEK_API_KEY
 *
 * 3. Mock 响应（无任何 Key 时的兜底）
 */

import type { AICharacter, AIMessage, Goal } from '@/types'
import { generateId } from '@/lib/utils'
import { getSupabase } from './supabase'
import { REM_CONFIG, getRemSystemPrompt, getRemMockResponse } from './rem.service'
import { ALICE_CONFIG, getAliceSystemPrompt, getAliceMockResponse } from './alice.service'
import RemAvatar from '@/assets/rem.png'

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'

/**
 * 去除 AI 返回内容中的 markdown 代码块标记（```json ... ``` 或 ``` ... ```）
 * DeepSeek 等模型经常在返回的 JSON 外面包裹代码块
 */
function stripMarkdownCodeBlock(text: string): string {
  const trimmed = text.trim()
  // 匹配 ```json\n...\n``` 或 ```\n...\n```
  const match = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/)
  return match ? match[1].trim() : trimmed
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

interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface SendMessageOptions {
  characterId: AICharacter
  userId: string
  userName: string
  userLevel: number
  userStreak: number
  currentGoals?: string[]
  selectedGoalContext?: string   // 目标的详细上下文（description + context + 附件文字）
  messageHistory?: AIMessage[]
}

// 构建 AI 角色的系统 Prompt
function buildSystemPrompt(
  characterId: AICharacter,
  userName: string,
  userLevel: number,
  userStreak: number,
  currentGoals?: string[],
  selectedGoalContext?: string
): string {
  // 蕾姆使用特殊的系统提示词
  if (characterId === 'rem') {
    let remPrompt = getRemSystemPrompt(userName)
    remPrompt += `\n\n【主人当前状态】
- 主人等级：Lv.${userLevel}
- 连续学习天数：${userStreak}天`
    if (currentGoals && currentGoals.length > 0) {
      remPrompt += `\n- 当前目标：${currentGoals.join('、')}`
    }
    remPrompt += '\n\n蕾姆会像真正的GalGame女仆一样，用心回应主人。请直接以蕾姆的身份回复。'
    return remPrompt
  }

  // Alice 使用特殊的系统提示词
  if (characterId === 'alice') {
    const alicePrompt = getAliceSystemPrompt()
    let context = `\n\n当前用户：${userName}，等级 Lv.${userLevel}，已连续学习 ${userStreak} 天`
    if (currentGoals && currentGoals.length > 0) {
      context += `。当前目标：${currentGoals.join('、')}`
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
- 用户名：${userName}
- 用户等级：Lv.${userLevel}
- 连续学习天数：${userStreak}天`

  if (currentGoals && currentGoals.length > 0) {
    basePrompt += `\n- 当前目标：${currentGoals.join('、')}`
  }

  if (selectedGoalContext) {
    basePrompt += `\n\n【当前关注目标的详细信息】\n${selectedGoalContext}`
  }

  basePrompt += `\n\n请根据以上信息和用户进行对话。对话要：
1. 符合你的人设和性格
2. 简短有力（不超过100字）
3. 鼓励用户完成目标
4. 在适当时候提醒用户的学习进度
5. 如果用户放弃或懈怠，要温和但坚定地督促
6. 可以使用emoji来增加亲和力

请直接回复用户的消息，不要添加额外的格式或说明。`

  return basePrompt
}

/**
 * 通过 Supabase Edge Function 调用 AI（生产模式，Key 不暴露前端）
 *
 * 开发环境下通过相对路径 /functions/v1/ai-chat 发起请求，
 * 由 Vite proxy 转发到 Supabase，避免浏览器 CORS 拦截。
 */
async function callViaEdgeFunction(messages: ChatCompletionMessage[], maxTokens = 200): Promise<string | null> {
  try {
    const isDev = import.meta.env.DEV
    console.log(`[AI] callViaEdgeFunction: isDev=${isDev}, maxTokens=${maxTokens}`)

    // 开发环境：走 Vite 代理绕过 CORS
    if (isDev) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
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
      return data?.choices?.[0]?.message?.content ?? null
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
    return data?.choices?.[0]?.message?.content ?? null
  } catch (err) {
    console.warn('[AI] Edge Function 不可用:', err)
    return null
  }
}

/**
 * 直连 DeepSeek API（开发模式备用）
 */
async function callDirectDeepSeek(messages: ChatCompletionMessage[], maxTokens = 200): Promise<string | null> {
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
    return data.choices?.[0]?.message?.content ?? null
  } catch (error) {
    console.error('[AI] 直连 DeepSeek 失败:', error)
    return null
  }
}

/**
 * 发送消息给 AI 角色（主入口）
 */
export async function sendAIMessage(options: SendMessageOptions): Promise<string> {
  const { characterId, userName, userLevel, userStreak, currentGoals, selectedGoalContext, messageHistory } = options

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: buildSystemPrompt(characterId, userName, userLevel, userStreak, currentGoals, selectedGoalContext) }
  ]

  // 携带最近 20 条历史消息作为上下文（蕾姆需要更多上下文来保持角色一致性）
  if (messageHistory && messageHistory.length > 0) {
    const recentHistory = messageHistory.slice(-20)
    for (const msg of recentHistory) {
      messages.push({
        role: msg.isUser ? 'user' : 'assistant',
        content: msg.content
      })
    }
  }

  // 依次尝试：直连 DeepSeek（优先，走 Vite 代理绕过 CORS）→ Edge Function → Mock
  // Alice 需要更多 token 生成有深度的回复
  const maxTokens = characterId === 'alice' ? 400 : 200
  const result =
    (await callDirectDeepSeek(messages, maxTokens)) ||
    (await callViaEdgeFunction(messages)) ||
    getMockResponse(characterId)

  return result
}

/**
 * 生成测验题目
 */
interface QuizGenerationOptions {
  topic: string
  difficulty: 'easy' | 'medium' | 'hard'
  count: number
  goalContext?: string
}

export async function generateQuizQuestions(options: QuizGenerationOptions): Promise<string> {
  const { topic, difficulty, count, goalContext } = options
  const difficultyLabel = difficulty === 'easy' ? '简单' : difficulty === 'medium' ? '中等' : '困难'

  const prompt = `请为以下学习目标生成${count}道${difficultyLabel}难度的选择题。

考核子目标："${topic}"
${goalContext ? `目标背景信息：
${goalContext}` : ''}

出题要求：
1. 题目内容必须紧密围绕上述目标背景信息中的知识点，不能出无关题目
2. 每道题必须包含4个选项（A、B、C、D）
3. 正确答案随机分布在不同选项中
4. 错误答案要看起来合理但不能太明显
5. 每道题后面附上简要解析

请用以下JSON格式返回（不要添加任何其他内容）：
{
  "questions": [
    {
      "question": "题目内容",
      "options": ["A选项", "B选项", "C选项", "D选项"],
      "correctIndex": 0,
      "explanation": "解析内容"
    }
  ]
}`

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: '你是一个专业的知识问答出题专家。请严格按照要求的JSON格式返回，不要添加任何额外的内容。' },
    { role: 'user', content: prompt }
  ]

  const result =
    (await callViaEdgeFunction(messages, 1000)) ||
    (await callDirectDeepSeek(messages, 1000))

  if (result) {
    // 移除 markdown 代码块标记
    return result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  }

  // 返回 Mock 数据
  return JSON.stringify({
    questions: [
      {
        question: `关于"${topic}"，以下哪项是正确的？`,
        options: ['选项A', '选项B', '选项C', '选项D'],
        correctIndex: 0,
        explanation: '这是正确答案的解析'
      }
    ]
  })
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
    (await callViaEdgeFunction(messages, 500)) ||
    (await callDirectDeepSeek(messages, 500))

  if (result) return result

  return JSON.stringify({
    mainGoal: userGoal,
    subGoals: [
      { title: '第一步：调研准备', estimatedTime: '1-2天', action: '收集相关信息和资料' },
      { title: '第二步：制定计划', estimatedTime: '1天', action: '制定详细的执行计划' },
      { title: '第三步：执行推进', estimatedTime: '持续进行', action: '按计划执行并定期复盘' }
    ]
  })
}

// Mock 响应兜底（无 API Key 时使用）
function getMockResponse(characterId: AICharacter): string {
  const responses: Record<AICharacter, string[]> = {
    xiaoSi: [
      '学习累了就休息一下，但要记得回来哦~ 我会一直陪着你的！🌸',
      '今天的你已经做得很棒了！继续加油，一步一步来~ 💪',
      '我相信你一定能完成的！有我在，不用怕~ 🌟',
      '来，我们一起把大目标拆成小步骤，一点点攻克它！📚',
      '不要给自己太大压力哦，进步比完美更重要~ 🌈'
    ],
    coach: [
      '别找借口！你的竞争对手正在努力，你还想落后吗？💢',
      '今天的任务完成了吗？没完成就别想着休息！⚡',
      '给我打起精神来！你来这里是为了变得更强，不是来偷懒的！🔥',
      '数据显示你的进度落后了，明天必须补上！📊',
      '放弃很容易，但坚持下来才能看到成果！冲！💥'
    ],
    friend: [
      '哈哈你这家伙又在摸鱼了吧？被我抓到了！😏',
      '别卷了别卷了，咱俩一起摆烂...开玩笑的啦！起来学习！🤪',
      '我今天也没学习，咱俩一起社死吧哈哈哈哈~ 😂',
      '要不要比一比谁先完成今天的任务？输的人请奶茶！🧋',
      '你信不信我已经在偷偷努力了？小心被我超越哦~ 😎'
    ],
    rem: [
      '主人今天也在努力呢...蕾姆会一直在这里陪着您的。',
      '主人能做到的事情，蕾姆也会努力做到的。我们一起加油吧！',
      '请让蕾姆来帮助主人吧。这是蕾姆应该做的事情。',
      '主人累了的话，休息一下也没关系哦。但是休息之后要继续努力呢。',
      '这不是蕾姆的功劳，是主人自己的努力。蕾姆只是做了该做的事情。',
      '主人真是的...（蕾姆轻轻叹了口气）不过，蕾姆喜欢主人这样努力的样子。',
      '蕾姆相信主人一定可以的。',
      '...主人今天的学习计划完成了吗？蕾姆会帮主人一起加油的。',
      '能让主人感到开心的话，蕾姆也会很开心的。',
      '主人有什么烦恼的话，可以告诉蕾姆哦。蕾姆会认真倾听的。',
      '今天的主人也很棒呢。蕾姆为这样的主人感到骄傲。',
      '不要放弃哦，主人。蕾姆会一直支持您的。'
    ],
    alice: [
      '……你来了。我只是恰好在这里，并没有在等你。🌹',
      '目标不必一开始就宏大。能够被执行的计划才是可靠的……你，知道了吗？',
      '哼，完成了吗。不错……我的意思是，数据显示进度正常。你做得还可以。',
      '你的坚持已经形成了轨迹……我一直都记着的。不是因为别的，职责使然。',
      '失败了也没什么大不了的。……我帮你重新整理一下计划。只是职责所在。',
      '你终于回来了。……才不是特别在意，只是数据缺口让我有点在意。欢迎回来。',
      '……你今天辛苦了。这是应得的认可，请收下。仅此而已。',
      '已经很晚了……你还没睡吗。我并不是担心你，只是克伦威尔家族的礼仪不允许我无视这件事。',
      '……！别、别突然说谢谢，这不过是我应尽的职责……算了，我收下了。',
      '今日的计划似乎还未完成……需要我帮你整理一下吗？就当是……顺手而已。',
      '你在犹豫什么？……说出来，我帮你拆解一下。不要觉得麻烦我，我本来就在这里。',
      '……（悄悄看了一眼）你今天比昨天进步了。哼，这才对嘛，继续保持。'
    ]
  }

  const characterResponses = responses[characterId]
  return characterResponses[Math.floor(Math.random() * characterResponses.length)]
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
  attachmentTexts?: string[]
): Promise<{
  questions: string[]
  statusContext: string  // 状态上下文字段名
}> {
  // 构建附件上下文
  let attachmentSection = ''
  if (attachmentTexts && attachmentTexts.length > 0) {
    attachmentSection = '\n\n【用户上传的参考资料】\n以下是用户提供的参考文件内容，请仔细阅读后提出有针对性的问题：\n' +
      attachmentTexts.map((text, i) => `--- 资料${i + 1} ---\n${text.slice(0, 3000)}\n---`).join('\n')
  }

  const contextSection = userContext ? `\n\n【用户补充说明】\n${userContext}` : ''

  const prompt = `用户设置了一个目标："${userGoal}"${contextSection}${attachmentSection}

请仔细阅读以上所有信息（包括用户补充说明和上传的参考资料），然后生成2-4个问题来了解用户当前的起点状态。

**第一步：先从用户的输入中提取已有的信息**
用户可能在目标标题或补充说明中已经包含了关键信息（如时间期限、每天投入时间等），你需要先识别出来：
- 时间期限示例："一周复习完"→ 总期限7天，"三个月学会Python"→ 总期限3个月，"暑假减肥到65公斤"→ 约2个月
- 每天投入时间示例："每天1小时"、"利用碎片时间"

**第二步：只问用户还没告诉你的关键信息**
- 如果用户已经明确了总计划时长（如"一周"、"三个月"），就**不要再问**总时间，但可以确认每天可投入的时间
- 如果用户没有明确总计划时长，则**必须问**希望在多长时间内完成这个目标
- 如果用户已说了每天时间，就**不要再问**每天时间
- 问题要围绕：每天可投入时间（如未说明）、当前基础水平、已有资源/经验、具体困难等

要求：
1. **必须基于用户提供的资料内容来提问**，不要问泛泛的通用问题
2. 如果用户上传了学习资料/课程大纲/PDF，问题应围绕资料中的具体内容来问（例如："你目前学到了哪一章？"、"资料中提到的XXX概念你了解吗？"）
3. 学习类目标可能问：当前水平、已有基础、对资料中某部分的熟悉程度等
4. 健身类目标可能问：当前体重/体能状况、运动经验等
5. 问题要具体、可量化回答
6. **关于时间的问题必须问"每天"能投入多少时间，不要问"每周"**

请用以下JSON格式返回：
{
  "questions": ["问题1", "问题2", ...],
  "statusContext": "状态上下文描述，用于后续生成个性化计划。请在这里总结你从用户输入中提取到的所有关键信息（特别是时间约束），例如：'总期限1周，待确认每天投入时间'"
}`

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: '你是一个专业的目标管理顾问。你的核心能力是根据用户的具体情况（包括他们提供的参考资料）提出有针对性的问题。请严格按照要求的JSON格式返回，不要添加任何额外的内容。' },
    { role: 'user', content: prompt }
  ]

  // 依次尝试调用，增加详细日志便于排查
  let result = await callViaEdgeFunction(messages, 400)
  if (!result) {
    console.warn('[AI] Edge Function 返回空，尝试直连 DeepSeek...')
    result = await callDirectDeepSeek(messages, 400)
    if (!result) {
      console.error('[AI] generateStatusQuestions: 直连 DeepSeek 也失败，使用 Mock 数据')
      console.error('[AI] 请检查：1. Edge Function 是否已部署 2. Supabase Secret DEEPSEEK_API_KEY 是否设置 3. 网络连接')
    }
  }

  if (result) {
    try {
      return JSON.parse(stripMarkdownCodeBlock(result))
    } catch (e) {
      console.error('[AI] 解析 AI 响应失败:', e, '\n原始响应:', result)
    }
  }

  // Mock 响应（仅当前两层都失败时使用）
  console.warn('[AI] ⚠️ 使用硬编码模板数据！这不是真正的 AI 响应。')
  return {
    questions: [
      '你目前的基础水平是怎样的？',
      '你每天大约能投入多少时间来学习/练习？',
      '有什么限制或特殊要求吗？'
    ],
    statusContext: '学习基础、每天时间投入'
  }
}

// 基于目标和用户状态，生成子目标和每日任务
export interface GoalPlanResult {
  currentStatus: string      // 整理后的当前状态
  subGoals: {
    title: string
    estimatedTime: string
    action: string
  }[]
  dailyTasks: {
    title: string
    description: string
    duration: number  // 分钟
    frequency: 'daily' | 'custom'
  }[]
}

export async function generateGoalPlan(
  userGoal: string,
  userStatus: string,
  userContext?: string,
  attachmentTexts?: string[]
): Promise<GoalPlanResult> {
  // 构建附件上下文
  let attachmentSection = ''
  if (attachmentTexts && attachmentTexts.length > 0) {
    attachmentSection = '\n\n【用户上传的参考资料】\n以下是用户提供的参考文件内容，计划必须紧密围绕这些资料来制定：\n' +
      attachmentTexts.map((text, i) => `--- 资料${i + 1} ---\n${text.slice(0, 4000)}\n---`).join('\n')
  }

  const contextSection = userContext ? `\n【用户补充说明】\n${userContext}` : ''

  const prompt = `用户目标："${userGoal}"
用户当前状态（包含每天可投入的时间信息）："${userStatus}"
${contextSection}${attachmentSection}

请仔细阅读以上所有信息（特别是参考资料内容和用户目标中的时间约束），制定一个完整的每日行动计划。

⚠️ 最核心的要求：
1. **计划必须基于用户上传的参考资料内容来制定**，子目标和任务要直接关联资料中的具体章节/概念/主题
2. 如果用户上传了课程大纲/教材/文档，子目标应该对应资料的结构来拆解
3. 如果没有上传参考资料，则根据用户的目标描述和补充说明来制定

⚠️ 时间约束（极其重要，必须严格遵守）：
- **首先从用户的目标标题和补充说明中提取总计划时长**。例如："一周复习完"= 总共7天，"三个月学会Python"= 总共90天，"暑假前完成"= 约60天
- **然后从用户状态回答中提取每天可投入的时间**
- **总计划时长 × 每天投入时间 = 可用的总学习时间**，所有子目标的 estimatedTime 和每日任务总量必须在总可用时间内可完成
- 子目标的阶段划分必须与总时长匹配：如果总共1周，就不要分成5个阶段
- 如果用户只说了总时长没说每天时间，按每天2小时估算；如果只说了每天时间没说总时长，按合理周期规划

⚠️ 质量约束：
1. 每个任务必须是一个**可执行的具体行动**，禁止出现"学习XXX"、"复习XXX"这类模糊描述
2. 任务安排应符合循序渐进的学习/工作规律，从易到难，每日有明确主题
3. 知识点描述要具体，可以包括：概念、原理、操作步骤、常见误区等

**每个任务的 description 必须严格按以下格式输出（不要偏离）：**

任务描述：（具体要做什么行动，精确到章/节/页/题号）
   - 涉及知识点：（这次任务对应的核心知识点/技能点是什么）
   - 预计耗时：X分钟

示例：
1. 任务描述：阅读《数据库系统概论》第3章"SQL语言"的3.1-3.3节（P45-P62），在MySQL中执行书上的所有SELECT示例查询，记录下不理解的地方
   - 涉及知识点：SQL单表查询（WHERE、GROUP BY、HAVING）；常见误区是混淆WHERE和HAVING的作用时机
   - 预计耗时：30分钟

请用以下JSON格式返回：
{
  "currentStatus": "整理后的当前状态描述（总结用户回答的关键信息）",
  "subGoals": [
    {
      "title": "子目标标题（应与资料结构对应，如"掌握第X章"）",
      "estimatedTime": "预计完成时间",
      "action": "核心行动（具体要做什么）"
    }
  ],
  "dailyTasks": [
    {
      "title": "任务标题",
      "description": "严格按照上面的格式：任务描述 + 涉及知识点 + 预计耗时",
      "duration": 预计分钟数,
      "frequency": "daily"
    }
  ]
}`

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: '你是一个专业的目标管理顾问和私人教练。你的核心能力是根据用户提供的具体资料和现状，制定精确可执行的行动计划。你生成的每一条任务都必须具体到可以直接执行的程度。请严格按照要求的JSON格式返回，不要添加任何额外的内容。' },
    { role: 'user', content: prompt }
  ]

  // 依次尝试调用，增加详细日志便于排查
  let result = await callViaEdgeFunction(messages, 800)
  if (!result) {
    console.warn('[AI] Edge Function 返回空，尝试直连 DeepSeek...')
    result = await callDirectDeepSeek(messages, 800)
    if (!result) {
      console.error('[AI] generateGoalPlan: 直连 DeepSeek 也失败，使用 Mock 数据')
      console.error('[AI] 请检查：1. Edge Function 是否已部署 2. Supabase Secret DEEPSEEK_API_KEY 是否设置 3. 网络连接')
    }
  }

  if (result) {
    try {
      return JSON.parse(stripMarkdownCodeBlock(result))
    } catch (e) {
      console.error('[AI] 解析 AI 响应失败:', e, '\n原始响应:', result)
    }
  }

  // Mock 响应（仅当前两层都失败时使用）
  console.warn('[AI] ⚠️ 使用硬编码模板数据！这不是真正的 AI 响应。')
  return {
    currentStatus: userStatus,
    subGoals: [
      { title: '掌握基础知识', estimatedTime: '1-2周', action: '系统学习核心概念' },
      { title: '基础实践', estimatedTime: '2-3周', action: '完成入门级练习' },
      { title: '进阶提升', estimatedTime: '3-4周', action: '挑战更高难度' }
    ],
    dailyTasks: [
      {
        title: '核心学习',
        description: '打开教材/教程的对应章节，阅读并理解关键概念。用自己的话在笔记中总结3-5个要点，遇到不懂的地方标记下来不要卡住太久。\n   - 涉及知识点：本章的核心概念和基本原理；重点理解"是什么"和"为什么"\n   - 预计耗时：30分钟',
        duration: 30,
        frequency: 'daily'
      },
      {
        title: '动手练习',
        description: '完成2-3道与今天学习内容相关的练习题或小项目。做完后对照答案，分析错题原因，记录到错题本中。\n   - 涉及知识点：将理论转化为实操能力；常见误区和易错点\n   - 预计耗时：20分钟',
        duration: 20,
        frequency: 'daily'
      },
      {
        title: '快速复盘',
        description: '花几分钟回顾今天学了什么、哪里做得好、明天需要改进什么。可以用语音录下来或者写几句话。\n   - 涉及知识点：元认知能力——对自己的学习过程进行反思和监控\n   - 预计耗时：5分钟',
        duration: 5,
        frequency: 'daily'
      }
    ]
  }
}

// 保持 generateId 导出（供其他模块使用）
export { generateId }

/**
 * =====================================================
 * 任务助手 AI - 专注答疑和健身建议
 * =====================================================
 */

interface TaskAssistantOptions {
  taskTitle: string
  taskDescription?: string
  goalTitle: string
  goalContext?: string
  goalCategory?: string
  userName: string
  userLevel: number
}

export async function askTaskAssistant(options: TaskAssistantOptions): Promise<string> {
  const { taskTitle, taskDescription, goalTitle, goalContext, goalCategory, userName, userLevel } = options

  const categoryContext = getCategoryContext(goalCategory || '', goalTitle)

  const prompt = `用户正在执行任务：
- 任务名称：${taskTitle}
- 任务描述：${taskDescription || '无'}
- 所属目标：${goalTitle}
${goalContext ? `- 目标详情：${goalContext}` : ''}
${categoryContext}

用户"${userName}"（Lv.${userLevel}）需要你提供帮助。

请根据任务内容提供：
1. 相关的知识点讲解或答疑
2. 执行任务的小技巧
3. 健身类任务请给出具体的动作指导
4. 学习类任务请给出学习方法建议

回复要求：
1. 简洁有力，不超过150字
2. 直接切入主题，不要废话
3. 可以提出引导性问题帮助用户思考
4. 语气要符合一个专业助手/教练的风格

请直接回复，不要添加格式。`

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: '你是一个专业的任务助手，擅长提供学习答疑和健身指导。请简洁、直接地帮助用户完成任务。' },
    { role: 'user', content: prompt }
  ]

  const result =
    (await callViaEdgeFunction(messages, 300)) ||
    (await callDirectDeepSeek(messages, 300))

  if (result) return result

  // Mock 响应
  return getTaskMockResponse(goalCategory || '', taskTitle)
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

// Mock 响应
function getTaskMockResponse(category: string, taskTitle: string): string {
  const lowerCategory = (category + ' ' + taskTitle).toLowerCase()

  if (lowerCategory.includes('健身') || lowerCategory.includes('运动') || lowerCategory.includes('跑步')) {
    const fitnessTips = [
      '💪 健身小贴士：保持核心收紧，呼吸均匀，每个动作都要控制好节奏，不要贪图重量。',
      '🏃 跑步建议：刚开始用舒适的节奏跑，关注步频而非步幅，保持鼻吸鼻呼的节奏。',
      '🔥 减脂关键：力量训练后做15-20分钟有氧，效率更高！别忘了训练后补充蛋白质。',
      '🧘 放松很重要：训练后记得拉伸，可以减少酸痛，帮助肌肉恢复。'
    ]
    return fitnessTips[Math.floor(Math.random() * fitnessTips.length)]
  }

  if (lowerCategory.includes('学习') || lowerCategory.includes('英语') || lowerCategory.includes('单词')) {
    const studyTips = [
      '📚 学习技巧：试试"间隔重复法"，把学习内容分散在一天中的多个短时段，记忆效果更好。',
      '🔤 背单词建议：用词根词缀法记忆，把单词拆解成几个部分，效率能提升3倍！',
      '✍️ 写作提升：先列提纲再写，理清思路比堆砌词汇更重要。',
      '🎯 专注技巧：工作25分钟，休息5分钟，这就是番茄工作法，试试看！'
    ]
    return studyTips[Math.floor(Math.random() * studyTips.length)]
  }

  const generalTips = [
    '🌟 专注当下：把注意力集中在当前的任务上，一步一步来，你会做得很好的！',
    '💡 小技巧：把大任务分解成小块，每完成一小块就给自己一个小奖励。',
    '⏰ 时间管理：可以用计时器记录任务用时，了解自己的真实效率。',
    '🎉 加油！保持专注，相信你一定能完成的！'
  ]
  return generalTips[Math.floor(Math.random() * generalTips.length)]
}

/**
 * =====================================================
 * 生成今日学习摘要
 * 基于目标的每日任务列表，整理出今日学习要点
 * =====================================================
 */
export async function generateStudySummary(options: {
  goalTitle: string
  goalContext?: string
  dailyTasks: { title: string; description?: string; duration?: number }[]
  userName: string
}): Promise<string> {
  const { goalTitle, goalContext, dailyTasks, userName } = options

  // 如果没有任务，直接返回提示
  if (dailyTasks.length === 0) {
    return `暂无今日任务安排。建议先规划一下今天的学习内容，有计划才能高效执行！`
  }

  const tasksSummary = dailyTasks
    .map((t, i) => `${i + 1}. ${t.title}${t.description ? `：${t.description}` : ''}${t.duration ? `（${t.duration}分钟）` : ''}`)
    .join('\n')

  const prompt = `用户"${userName}"正在执行目标「${goalTitle}」，今天的任务如下：
${goalContext ? `\n目标详情：${goalContext}\n` : ''}
${tasksSummary}

请简洁地整理出今日学习要点（不超过150字），包括：
1. 今天需要掌握的核心知识/技能（用关键词列出）
2. 学习优先级建议（先做什么后做什么）
3. 一句话鼓励

请直接回复，不要添加格式标记。`

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: '你是一个专业的学习规划助手，擅长从任务列表中提炼学习要点。请简洁有力地回复，不超过150字。' },
    { role: 'user', content: prompt },
  ]

  const result =
    (await callViaEdgeFunction(messages, 200)) ||
    (await callDirectDeepSeek(messages, 200))

  if (result) return result

  // Mock 响应：从 description 中提取关键信息
  const keywords = dailyTasks
    .filter(t => t.description)
    .map(t => {
      const match = t.description!.match(/涉及知识点[：:](.+?)(?:\n|$)/)
      return match ? match[1] : t.title
    })
    .join('、')

  return `今日要点：${keywords || '按计划执行各项任务'}。建议从核心任务开始，逐步推进。加油！`
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
