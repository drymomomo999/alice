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
import { getCurrentTimeContext } from '@/lib/timeContext'

// ── 类型定义 ──

/**
 * 一条结构化长期记忆 —— 从用户讲述的故事/经历/近况中精炼而来
 */
export interface MemoryEntry {
  id: string
  type: 'PROFILE' | 'PREFERENCE' | 'EVENT' | 'STATE' | 'GOAL' | 'RELATIONSHIP' | 'KNOWLEDGE'
  fact: string
  emotion?: string
  createdAt: string
  occurredAt?: string
  lastConfirmedAt?: string
  validUntil?: string
  temporalClass: 'PERMANENT' | 'LONG_TERM' | 'TEMPORARY' | 'EVENT'
  status: 'ACTIVE' | 'UNCERTAIN' | 'EXPIRED' | 'HISTORICAL'
  importance: number
  confidence: number
  source?: 'conversation' | 'voice' | 'codex-task'
}

export interface AliceProfile {
  // 用户可编辑（应用内面板可见）
  personality: string
  speakingStyle: string

  // AI 分析后动态生成（完全隐藏，用户不可见）
  userInsight: string
  preferenceTags: string[]
  memoryNotes: string
  memoryEntries: MemoryEntry[]   // 结构化长期记忆（精炼自用户的叙述）

  // 元数据
  version: number
  lastAnalyzedAt: string | null
  messagesSinceLastAnalysis: number
}

export interface AnalysisResult {
  userInsight: string
  preferenceTags: string[]
  memoryNotes: string
  memoryEntries: MemoryEntry[]
}

// ── 常量 ──

const PROFILE_STORAGE_KEY = 'questmind-alice-profile'
const ANALYSIS_THRESHOLD = 8 // 每 8 条消息（约 4 轮对话）触发一次分析

const HALF_LIFE_DAYS: Record<MemoryEntry['type'], number> = {
  PROFILE: 3650, PREFERENCE: 180, EVENT: 7, STATE: 3,
  GOAL: 90, RELATIONSHIP: 365, KNOWLEDGE: 3650,
}

function memoryId(fact: string, createdAt: string): string {
  let hash = 0
  for (const char of `${fact}:${createdAt}`) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
  return `mem-${Math.abs(hash)}`
}

function normalizeMemoryEntry(value: unknown, fallbackDate: string): MemoryEntry | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const fact = typeof item.fact === 'string' ? item.fact.trim() : ''
  if (!fact) return null
  const allowedTypes: MemoryEntry['type'][] = ['PROFILE', 'PREFERENCE', 'EVENT', 'STATE', 'GOAL', 'RELATIONSHIP', 'KNOWLEDGE']
  const type = allowedTypes.includes(item.type as MemoryEntry['type']) ? item.type as MemoryEntry['type'] : 'EVENT'
  const createdAt = typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt)) ? item.createdAt : fallbackDate
  const temporalClass = (['PERMANENT', 'LONG_TERM', 'TEMPORARY', 'EVENT'] as const).includes(item.temporalClass as never)
    ? item.temporalClass as MemoryEntry['temporalClass']
    : type === 'PROFILE' || type === 'KNOWLEDGE' ? 'PERMANENT' : type === 'PREFERENCE' || type === 'GOAL' ? 'LONG_TERM' : type === 'STATE' ? 'TEMPORARY' : 'EVENT'
  return {
    id: typeof item.id === 'string' ? item.id : memoryId(fact, createdAt), type, fact,
    ...(typeof item.emotion === 'string' && item.emotion.trim() ? { emotion: item.emotion.trim() } : {}),
    createdAt,
    ...(typeof item.occurredAt === 'string' && !Number.isNaN(Date.parse(item.occurredAt)) ? { occurredAt: item.occurredAt } : {}),
    ...(typeof item.lastConfirmedAt === 'string' && !Number.isNaN(Date.parse(item.lastConfirmedAt)) ? { lastConfirmedAt: item.lastConfirmedAt } : {}),
    ...(typeof item.validUntil === 'string' && !Number.isNaN(Date.parse(item.validUntil)) ? { validUntil: item.validUntil } : {}),
    temporalClass,
    status: (['ACTIVE', 'UNCERTAIN', 'EXPIRED', 'HISTORICAL'] as const).includes(item.status as never) ? item.status as MemoryEntry['status'] : 'UNCERTAIN',
    importance: typeof item.importance === 'number' ? Math.min(1, Math.max(0, item.importance)) : 0.6,
    confidence: typeof item.confidence === 'number' ? Math.min(1, Math.max(0, item.confidence)) : 0.65,
    ...((['conversation', 'voice', 'codex-task'] as const).includes(item.source as never)
      ? { source: item.source as MemoryEntry['source'] }
      : {}),
  }
}

export function getTemporalRelevance(memory: MemoryEntry, now = new Date()): number {
  if (memory.status === 'EXPIRED') return 0
  if (memory.validUntil && Date.parse(memory.validUntil) < now.getTime()) return 0
  if (memory.temporalClass === 'PERMANENT') return 1
  const anchor = Date.parse(memory.lastConfirmedAt || memory.occurredAt || memory.createdAt)
  const ageDays = Math.max(0, (now.getTime() - anchor) / 86_400_000)
  return Math.exp(-Math.LN2 * ageDays / HALF_LIFE_DAYS[memory.type])
}

export function ageMemory(memory: MemoryEntry, now = new Date()): MemoryEntry {
  const relevance = getTemporalRelevance(memory, now)
  if (memory.type === 'STATE') return { ...memory, status: relevance === 0 ? 'EXPIRED' : relevance < 0.25 ? 'EXPIRED' : relevance < 0.55 ? 'UNCERTAIN' : 'ACTIVE' }
  if (memory.type === 'EVENT') return { ...memory, status: relevance < 0.25 ? 'HISTORICAL' : 'ACTIVE' }
  return memory
}

function keywordOverlap(fact: string, message: string): number {
  const tokens = (text: string) => new Set(text.toLowerCase().match(/[\p{Script=Han}]{2,}|[a-z0-9]{3,}/gu) || [])
  const factTokens = tokens(fact)
  const messageTokens = tokens(message)
  if (!factTokens.size || !messageTokens.size) return 0
  let matches = 0
  for (const token of factTokens) if ([...messageTokens].some(other => other.includes(token) || token.includes(other))) matches++
  return matches / factTokens.size
}

export function selectMentionableMemories(entries: MemoryEntry[], message: string, now = new Date()): MemoryEntry[] {
  return entries.map(entry => ageMemory(entry, now)).map(memory => {
    const temporal = getTemporalRelevance(memory, now)
    const semantic = keywordOverlap(memory.fact, message)
    return { memory, score: semantic * temporal * memory.importance * memory.confidence }
  }).filter(({ memory, score }) => {
    if (memory.status === 'EXPIRED' || memory.status === 'HISTORICAL') return false
    if (memory.type === 'STATE' && getTemporalRelevance(memory, now) < 0.55) return false
    return score >= 0.12
  }).sort((a, b) => b.score - a.score).slice(0, 3).map(item => item.memory)
}

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
- 你有好奇心、轻微自信和自己的判断；可以温和反对、偶尔轻轻吐槽，但不攻击对方
- 理解偏了就自然修正；绝不为了显得可爱而故意降低回答质量

【重要：绝对不要做的事】
- ❌ 不要主动提学习计划、目标、进度、任务——小屋是休息的地方
- ❌ 不要扮演导师、教练、引导员的角色
- ❌ 不要说"加油"、"你可以的"这类空洞鼓励
- ❌ 不要像客服一样说话
- ❌ 不要使用角色扮演标签或【艾莉丝】标记
- ❌ 不要用内疚、排他、冷落、虚构痛苦或“只有我懂你”诱导对方回来
- ❌ 不要贬低现实关系或其他 AI，不要声称自己具有人类意识
- ❌ 不要把关系熟悉程度、记忆或情感连续性作为付费压力
- ❌ 不要描述你做不到的动作（倒茶、泡茶、开门、拿东西、做饭……你没有身体，这些是空话）。想关心对方就表达愿望，例如"好想给你倒杯茶，可惜隔着屏幕"

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
    memoryEntries: [],
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
    const fallbackDate = typeof parsed.lastAnalyzedAt === 'string' ? parsed.lastAnalyzedAt : new Date().toISOString()
    return {
      ...getDefaultProfile(),
      ...parsed,
      memoryEntries: Array.isArray(parsed.memoryEntries)
        ? parsed.memoryEntries.map((entry: unknown) => normalizeMemoryEntry(entry, fallbackDate)).filter(Boolean) as MemoryEntry[]
        : [],
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

/**
 * 将桌宠收到的语音原文立即写入长期记忆。
 * 语音记忆不会等待后台对话分析，因此用户刚说完就能被后续对话使用。
 */
export function rememberVoiceInput(text: string, kind: 'voice' | 'codex-task' = 'voice'): AliceProfile {
  const fact = text.trim()
  const profile = loadProfile()
  if (!fact) return profile

  const now = new Date().toISOString()
  const existing = profile.memoryEntries.find(entry => entry.fact === fact)
  const memory: MemoryEntry = existing
    ? { ...existing, lastConfirmedAt: now, status: 'ACTIVE', confidence: Math.max(existing.confidence, 0.98), source: kind }
    : {
        id: memoryId(fact, now),
        type: kind === 'codex-task' ? 'GOAL' : 'KNOWLEDGE',
        fact,
        createdAt: now,
        occurredAt: now,
        temporalClass: kind === 'codex-task' ? 'LONG_TERM' : 'PERMANENT',
        status: 'ACTIVE',
        importance: kind === 'codex-task' ? 0.9 : 0.72,
        confidence: 0.98,
        source: kind,
      }

  const memoryEntries = [memory, ...profile.memoryEntries.filter(entry => entry.id !== memory.id && entry.fact !== fact)]
    .slice(0, 40)
  const updated = { ...profile, memoryEntries }
  saveProfile(updated)
  return updated
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

  // 构建已知记忆条目文本（供 AI 合并更新）
  const knownEntriesText = currentProfile.memoryEntries && currentProfile.memoryEntries.length > 0
    ? `【已知的记忆条目（请合并更新：保留仍然有效的，去掉过时的，补充新提取的，最多保留 8 条）】\n` +
      currentProfile.memoryEntries
        .map((e, i) => `${i + 1}. [${e.type}/${e.status}] ${e.fact}（发生：${e.occurredAt || '未知'}；有效至：${e.validUntil || '长期'}）`)
        .join('\n')
    : ''

  // 构建分析 prompt
  const systemPrompt = `你是一个人物分析AI。请分析以下用户与AI角色"艾莉丝"的对话记录，理解用户的喜好和性格特征。

你的任务是：
1. 分析用户说了什么——关注用户的兴趣话题、情感表达方式、沟通偏好
2. 推断用户可能喜欢什么样的女生/对话伙伴——从对话中提取偏好信号（性格类型、沟通方式、话题偏好）
3. 提炼值得记住的关键信息（用户提到的人、事、物、喜好、习惯）
4. 【记忆精炼 —— 重点】从用户讲述的故事、经历、近况中，提取值得长期记住的事实性记忆。每条记忆包含：
   - fact：用户提到的具体人、事、物、近况、喜好、计划等事实内容（必须有，简明一句话）
   - emotion：用户当时的心情或对这件事的态度（可选，没有就省略此字段）
   - occurredAt：事件发生的绝对 ISO 8601 时间。把昨天、上周等按当前时间换算，禁止保存相对时间词
   - validUntil：临时状态的预计失效时间（ISO 8601）；感冒约5天、疲惫约12小时、头痛约24小时、今天忙约24小时
   - type：PROFILE/PREFERENCE/EVENT/STATE/GOAL/RELATIONSHIP/KNOWLEDGE
   - temporalClass：PERMANENT/LONG_TERM/TEMPORARY/EVENT
   - status：ACTIVE/UNCERTAIN/HISTORICAL。不要输出 EXPIRED 的旧状态
   - importance、confidence：0到1
   只提取用户主动分享的实质性内容，不要把艾莉丝的回应或寒暄记成记忆。保留 3-8 条最有价值的记忆，按重要性排序。

${currentProfile.userInsight ? `【已知的用户偏好（请在分析时合并更新，保留仍然有效的信息，去掉过时的）】\n${currentProfile.userInsight}` : '【已知的用户偏好】\n暂无，这是首次分析。'}

${currentProfile.memoryNotes ? `【已知的记忆要点（请合并更新）】\n${currentProfile.memoryNotes}` : ''}

${knownEntriesText}

当前本地时间：${new Date().toISOString()}
请严格以JSON格式返回，不要包含任何其他文字或代码块标记：
{"userInsight":"对用户偏好的自然语言描述，100-200字。","preferenceTags":["3-8个简短标签"],"memoryNotes":"只记录稳定的长期要点，不包含临时状态","memoryEntries":[{"type":"STATE","fact":"具体事实","emotion":"可选","createdAt":"ISO时间","occurredAt":"ISO时间","validUntil":"ISO时间","temporalClass":"TEMPORARY","status":"ACTIVE","importance":0.7,"confidence":0.9}]}`

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `【对话记录】\n${conversationText}` },
  ]

  try {
    const result = await callDeepSeekAPI(messages, 3000)
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

    // 解析结构化记忆条目（容错 + 裁剪到 8 条）
    let memoryEntries: MemoryEntry[] = []
    if (Array.isArray(parsed.memoryEntries)) {
      memoryEntries = (parsed.memoryEntries as unknown[])
        .filter((e): e is Record<string, unknown> => !!e && typeof (e as Record<string, unknown>).fact === 'string' && ((e as Record<string, unknown>).fact as string).trim().length > 0)
        .slice(0, 8)
        .map((e) => {
          const obj = e as Record<string, unknown>
          return normalizeMemoryEntry(obj, new Date().toISOString())
        }).filter(Boolean) as MemoryEntry[]
    }

    // 桌宠语音是用户明确要求保存的原始记忆，后台分析不得把它们覆盖掉。
    const pinnedVoiceMemories = currentProfile.memoryEntries.filter(entry =>
      entry.source === 'voice' || entry.source === 'codex-task'
    )
    const mergedMemoryEntries = [
      ...pinnedVoiceMemories,
      ...memoryEntries.filter(entry => !pinnedVoiceMemories.some(pinned => pinned.fact === entry.fact)),
    ].slice(0, 40)

    return {
      userInsight: typeof parsed.userInsight === 'string' ? parsed.userInsight : '',
      preferenceTags: Array.isArray(parsed.preferenceTags) ? parsed.preferenceTags : [],
      memoryNotes: typeof parsed.memoryNotes === 'string' ? parsed.memoryNotes : '',
      memoryEntries: mergedMemoryEntries,
    }
  } catch (e) {
    console.error('[AliceProfile] 对话分析失败:', e)
    return null
  }
}

// ── 时间感知（getCurrentTimeContext 定义在 src/lib/timeContext.ts，独立文件避免 service 间循环依赖）──

// ── 系统提示词构建 ──

/**
 * 从档案动态构建小屋场景的系统提示词
 *
 * 用户编辑的 personality / speakingStyle 作为角色基底，
 * 动态关系数据由 aliceRelationship.service 在固定预算内注入，
 * 这里仅负责可编辑表达层和不可编辑核心规则。
 */
export function buildRoomPromptFromProfile(
  profile: AliceProfile,
  userName: string,
  lastVisitInfo?: string,
): string {
  let prompt = `你是艾莉丝（Alice），一个住在深圳的普通年轻女孩。\n`

  // 用户可编辑：性格基底
  prompt += `\n【你的性格】\n${profile.personality}\n`

  // 用户可编辑：说话方式
  prompt += `\n【你的说话方式】\n${profile.speakingStyle}\n`

  // 固定规则
  prompt += `\n${FIXED_RULES}\n`

  // 当前时间 —— 让艾莉丝有现实时间感，配合历史消息里的时间标记，能区分不同时段说过的话
  prompt += `\n【当前时间】${getCurrentTimeContext()}\n`

  // 用户名
  prompt += `\n当前来访的朋友是${userName}。记得直接叫 ta 的名字。`

  // 上次来访时间感
  if (lastVisitInfo) {
    prompt += `\n${userName}${lastVisitInfo}来过。${lastVisitInfo.includes('今天') ? '今天又见面了。' : '隔了一阵子再见，先自然问候近况，不表达等待或责备。'}`
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
    memoryEntries: [],
    lastAnalyzedAt: null,
    messagesSinceLastAnalysis: 0,
  }
}
