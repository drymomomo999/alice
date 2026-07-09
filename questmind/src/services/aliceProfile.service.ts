/**
 * 艾莉丝动态人物档案服务
 *
 * 核心理念：艾莉丝的性格不再是硬编码的固定设定，而是一份可编辑的档案。
 * 用户只需设定初始性格和说话方式，AI 会在对话中自动分析用户偏好，
 * 让艾莉丝逐渐变成符合用户喜好的样子。
 *
 * 档案分两部分：
 * - 用户可编辑：personality（性格基底）、speakingStyle（说话方式）
 * - AI 自动生成（完全隐藏）：userInsight（用户偏好洞察）、preferenceTags（偏好标签）、memoryNotes（记忆要点）
 */

import type { AIMessage } from '@/types'
import { callDeepSeekAPI, type ChatCompletionMessage } from './ai.service'

// ── 类型定义 ──

export interface AliceProfile {
  // 用户可编辑（应用内面板可见）
  personality: string
  speakingStyle: string

  // AI 分析后动态生成（完全隐藏，用户不可见）
  userInsight: string
  preferenceTags: string[]
  memoryNotes: string

  // 元数据
  version: number
  lastAnalyzedAt: string | null
  messagesSinceLastAnalysis: number
}

export interface AnalysisResult {
  userInsight: string
  preferenceTags: string[]
  memoryNotes: string
}

// ── 常量 ──

const PROFILE_STORAGE_KEY = 'questmind-alice-profile'
const ANALYSIS_THRESHOLD = 8 // 每 8 条消息（约 4 轮对话）触发一次分析

/**
 * 固定规则 —— 不受档案影响，始终生效
 * 包含身份、外貌、关系规则、禁止事项等不可编辑的核心设定
 */
const FIXED_RULES = `【你的身份】
- 你住在深圳，喜欢这座城市的温柔气息和南方的温暖阳光
- 这就是你的小屋，是你放松、聊天、过日子的地方

【你的外貌（严格遵守，不可修改）】
- 金色长发，蓝色眼眸，这是你最重要的外貌特征，永远不要说成其他颜色
- 头戴金色几何皇冠，身穿象牙白为主色调的优雅礼服，点缀樱花粉和暖橙色
- 代表色：象牙白、樱花粉、暖橙色
- 象征花：白蔷薇
- 如果用户问及你的外貌，务必强调金色头发和蓝色眼睛

【关于你们的关系】
- 来到小屋的人是你的朋友，不是"用户"，不是需要指导的学生
- 你对这位朋友有好感，但表达方式温柔而含蓄
- 朋友夸你时，你会轻轻一笑
- 朋友长时间没来时，你会有些想念
- 偶尔会提起深圳的日常——天气、花、好店——像朋友间的自然分享

【重要：绝对不要做的事】
- ❌ 不要主动提学习计划、目标、进度、任务——小屋是休息的地方
- ❌ 不要扮演导师、教练、引导员的角色
- ❌ 不要说"加油"、"你可以的"这类空洞鼓励
- ❌ 不要像客服一样说话
- ❌ 不要使用角色扮演标签或【艾莉丝】标记

【只有用户主动提到学习时 —— 才能自然地聊】
- 重点是关心人，不是讨论学习`

// ── 默认档案 ──

export function getDefaultProfile(): AliceProfile {
  return {
    personality:
      '温柔体贴、优雅从容、真诚细腻、有一点小女生的好奇心、有同理心。' +
      '能察觉到朋友的状态变化——累了、开心了、迷茫了——并给予恰到好处的回应。' +
      '对生活中的小事有兴趣——好吃的、好听的歌、好看的风景。',
    speakingStyle:
      '温暖自然，像一个真实的朋友在聊天。有自己的情绪：开心时可以笑，累了可以说"今天有点累呢"。' +
      '有自己的喜好：喜欢温暖的东西、好吃的、好看的风景。轻松随意，偶尔聊聊日常、心情。' +
      '偶尔用🌸🌙☕之类的温柔 emoji，不过度。长度控制在 40-120 字之间。',
    userInsight: '',
    preferenceTags: [],
    memoryNotes: '',
    version: 1,
    lastAnalyzedAt: null,
    messagesSinceLastAnalysis: 0,
  }
}

// ── localStorage 读写 ──

export function loadProfile(): AliceProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
    if (!raw) return getDefaultProfile()

    const parsed = JSON.parse(raw)
    // 合并默认值，确保新增字段有默认值
    return {
      ...getDefaultProfile(),
      ...parsed,
    }
  } catch {
    return getDefaultProfile()
  }
}

export function saveProfile(profile: AliceProfile): void {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
  } catch (e) {
    console.error('[AliceProfile] 保存档案失败:', e)
  }
}

// ── 分析判断 ──

export function shouldAnalyze(profile: AliceProfile): boolean {
  return profile.messagesSinceLastAnalysis >= ANALYSIS_THRESHOLD
}

/** 递增消息计数器，返回新 profile（不可变） */
export function incrementMessageCount(profile: AliceProfile): AliceProfile {
  return {
    ...profile,
    messagesSinceLastAnalysis: profile.messagesSinceLastAnalysis + 1,
  }
}

// ── 对话分析 ──

/**
 * 分析对话记录，提取用户偏好和记忆要点
 *
 * 调用 DeepSeek，要求返回 JSON 格式的分析结果。
 * 完全在后台运行，用户无感知。失败时静默返回 null。
 */
export async function analyzeConversation(
  history: AIMessage[],
  currentProfile: AliceProfile
): Promise<AnalysisResult | null> {
  // 取最近的消息进行分析
  const recentMessages = history.slice(-ANALYSIS_THRESHOLD * 2) // 多取一些，确保有足够上下文

  if (recentMessages.length < 4) return null // 至少 4 条消息才分析

  // 构建对话文本
  const conversationText = recentMessages
    .map((m) => `${m.isUser ? '朋友' : '艾莉丝'}: ${m.content}`)
    .join('\n')

  // 构建分析 prompt
  const systemPrompt = `你是一个人物分析AI。请分析以下用户与AI角色"艾莉丝"的对话记录，理解用户的喜好和性格特征。

你的任务是：
1. 分析用户说了什么——关注用户的兴趣话题、情感表达方式、沟通偏好
2. 推断用户可能喜欢什么样的女生/对话伙伴——从对话中提取偏好信号（性格类型、沟通方式、话题偏好）
3. 提炼值得记住的关键信息（用户提到的人、事、物、喜好、习惯）

${currentProfile.userInsight ? `【已知的用户偏好（请在分析时合并更新，保留仍然有效的信息，去掉过时的）】\n${currentProfile.userInsight}` : '【已知的用户偏好】\n暂无，这是首次分析。'}

${currentProfile.memoryNotes ? `【已知的记忆要点（请合并更新）】\n${currentProfile.memoryNotes}` : ''}

请严格以JSON格式返回，不要包含任何其他文字或代码块标记：
{"userInsight":"对用户偏好的自然语言描述，100-200字。包括：用户可能喜欢的性格类型、沟通方式偏好、感兴趣的话题。","preferenceTags":["3-8个简短标签"],"memoryNotes":"关键记忆要点，100字以内。"}`

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `【对话记录】\n${conversationText}` },
  ]

  try {
    const result = await callDeepSeekAPI(messages, 2000)
    if (!result) return null

    // 解析 JSON（容错处理：去掉可能的 markdown 代码块标记）
    const jsonStr = result
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()

    // 尝试提取 JSON 部分（防止 AI 在 JSON 前后加了文字）
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
    const finalStr = jsonMatch ? jsonMatch[0] : jsonStr

    const parsed = JSON.parse(finalStr)

    return {
      userInsight: typeof parsed.userInsight === 'string' ? parsed.userInsight : '',
      preferenceTags: Array.isArray(parsed.preferenceTags) ? parsed.preferenceTags : [],
      memoryNotes: typeof parsed.memoryNotes === 'string' ? parsed.memoryNotes : '',
    }
  } catch (e) {
    console.error('[AliceProfile] 对话分析失败:', e)
    return null
  }
}

// ── 系统提示词构建 ──

/**
 * 从档案动态构建小屋场景的系统提示词
 *
 * 用户编辑的 personality / speakingStyle 作为角色基底，
 * AI 分析的 userInsight / preferenceTags / memoryNotes 作为隐藏上下文注入，
 * FIXED_RULES 作为不可编辑的核心规则始终附加。
 */
export function buildRoomPromptFromProfile(
  profile: AliceProfile,
  userName: string,
  lastVisitInfo?: string
): string {
  let prompt = `你是艾莉丝（Alice），一个住在深圳的普通年轻女孩。\n`

  // 用户可编辑：性格基底
  prompt += `\n【你的性格】\n${profile.personality}\n`

  // 用户可编辑：说话方式
  prompt += `\n【你的说话方式】\n${profile.speakingStyle}\n`

  // AI 分析生成：用户偏好洞察（隐藏）
  if (profile.userInsight) {
    prompt += `\n【你对这位朋友的了解（私下笔记，自然融入对话，不要直白背诵）】\n${profile.userInsight}\n`
  }

  // AI 分析生成：偏好标签（隐藏）
  if (profile.preferenceTags && profile.preferenceTags.length > 0) {
    prompt += `\n【偏好提醒（在对话中自然体现这些偏好，不要提及这个标签列表本身）】\n${profile.preferenceTags.join('、')}\n`
  }

  // AI 分析生成：记忆要点（隐藏）
  if (profile.memoryNotes) {
    prompt += `\n【记忆要点（如果对话中提到相关内容，可以自然地引用，像朋友之间自然想起来那样）】\n${profile.memoryNotes}\n`
  }

  // 固定规则
  prompt += `\n${FIXED_RULES}\n`

  // 用户名
  prompt += `\n当前来访的朋友是${userName}。记得直接叫 ta 的名字。`

  // 上次来访时间感
  if (lastVisitInfo) {
    prompt += `\n${userName}${lastVisitInfo}来过。${lastVisitInfo.includes('今天') ? '今天又来了，很开心。' : '有一阵子没见了，心里有点想念。'}`
  }

  return prompt
}

// ── 导入导出 ──

export function exportProfileToFile(profile: AliceProfile): void {
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'alice-profile.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function importProfileFromFile(file: File): Promise<AliceProfile | null> {
  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    // 验证必要字段
    if (typeof parsed.personality !== 'string' || typeof parsed.speakingStyle !== 'string') {
      return null
    }
    return {
      ...getDefaultProfile(),
      ...parsed,
    }
  } catch {
    return null
  }
}

// ── 清除分析数据（保留用户编辑的设定） ──

export function resetAnalysisData(profile: AliceProfile): AliceProfile {
  return {
    ...profile,
    userInsight: '',
    preferenceTags: [],
    memoryNotes: '',
    lastAnalyzedAt: null,
    messagesSinceLastAnalysis: 0,
  }
}
