import type { AIMessage } from '@/types'

export type AliceShareCategory = 'technology' | 'science' | 'culture' | 'world' | 'games' | 'life'
export type AliceShareReaction = 'interested' | 'neutral' | 'not_interested'

export interface AliceDiaryEntry {
  id: string
  date: string
  title: string
  content: string
  mood: 'sunny' | 'soft' | 'thoughtful' | 'quiet'
  createdAt: string
  updatedAt: string
}

export interface AliceSharedStory {
  id: string
  category: AliceShareCategory
  title: string
  summary: string
  url?: string
  source?: string
  sharedAt: string
  reaction: AliceShareReaction
  reactedAt?: string
}

export interface AliceLifeStore {
  version: 1
  userId: string
  diary: AliceDiaryEntry[]
  stories: AliceSharedStory[]
  categoryWeights: Record<AliceShareCategory, number>
  lastDiaryTurnCount: number
  updatedAt: string
}

export interface AliceShareCandidate {
  category: AliceShareCategory
  title: string
  summary: string
  url?: string
  source?: string
  isCurrent: boolean
}

const STORAGE_PREFIX = 'questmind:alice-life-v1:'
const MAX_DIARY_ENTRIES = 180
const MAX_STORIES = 80
const SHARE_COOLDOWN_MS = 4 * 24 * 60 * 60 * 1000
const REACTION_WINDOW_MS = 2 * 24 * 60 * 60 * 1000

const DEFAULT_WEIGHTS: Record<AliceShareCategory, number> = {
  technology: 0.62,
  science: 0.58,
  culture: 0.56,
  world: 0.42,
  games: 0.48,
  life: 0.64,
}

function nowIso(now = new Date()): string {
  return now.toISOString()
}

function localDate(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function emptyStore(userId: string): AliceLifeStore {
  return {
    version: 1,
    userId,
    diary: [],
    stories: [],
    categoryWeights: { ...DEFAULT_WEIGHTS },
    lastDiaryTurnCount: 0,
    updatedAt: nowIso(),
  }
}

export function loadAliceLifeStore(userId: string): AliceLifeStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${userId}`) || 'null') as Partial<AliceLifeStore> | null
    if (!parsed) return emptyStore(userId)
    return {
      ...emptyStore(userId),
      ...parsed,
      version: 1,
      userId,
      diary: Array.isArray(parsed.diary) ? parsed.diary : [],
      stories: Array.isArray(parsed.stories) ? parsed.stories : [],
      categoryWeights: { ...DEFAULT_WEIGHTS, ...(parsed.categoryWeights || {}) },
    }
  } catch {
    return emptyStore(userId)
  }
}

export function saveAliceLifeStore(store: AliceLifeStore): void {
  localStorage.setItem(`${STORAGE_PREFIX}${store.userId}`, JSON.stringify(store))
}

function cleanDiaryText(text: string): string {
  return text
    .replace(/^```[\s\S]*?\n|```$/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^[-*•]\s+/gm, '')
    .replace(/\b(?:user|assistant|system)\s*[:：]/gi, '')
    .replace(/(?:日志|数据库|评分|token|提示词|系统记录)\s*[:：]?/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 360)
}

export function upsertDiaryEntry(input: {
  userId: string
  content: string
  title?: string
  mood?: AliceDiaryEntry['mood']
  now?: Date
}): AliceLifeStore {
  const now = input.now || new Date()
  const store = loadAliceLifeStore(input.userId)
  const date = localDate(now)
  const content = cleanDiaryText(input.content)
  if (!content) return store
  const existing = store.diary.find(entry => entry.date === date)
  const entry: AliceDiaryEntry = existing
    ? { ...existing, content, title: input.title || existing.title, mood: input.mood || existing.mood, updatedAt: nowIso(now) }
    : {
        id: makeId('diary'),
        date,
        title: input.title || '今天的小事',
        content,
        mood: input.mood || 'soft',
        createdAt: nowIso(now),
        updatedAt: nowIso(now),
      }
  store.diary = [entry, ...store.diary.filter(item => item.date !== date)]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_DIARY_ENTRIES)
  store.updatedAt = nowIso(now)
  saveAliceLifeStore(store)
  return store
}

export function shouldWriteAliceDiary(
  userId: string,
  history: AIMessage[],
  now = new Date(),
): boolean {
  const store = loadAliceLifeStore(userId)
  if (store.diary.some(entry => entry.date === localDate(now))) return false
  const today = localDate(now)
  const todayUserTurns = history.filter(message => (
    message.isUser
    && message.scene === 'HOME'
    && localDate(new Date(message.timestamp)) === today
  )).length
  const latest = [...history].reverse().find(message => message.isUser)?.content || ''
  const meaningful = /开心|难过|喜欢|决定|终于|希望|害怕|谢谢|以后|记住|今天/.test(latest)
  return todayUserTurns >= 2 || meaningful
}

export function buildDiaryPrompt(userName: string, history: AIMessage[]): string {
  const recent = history.slice(-10).map(message => `${message.isUser ? userName : '艾莉丝'}：${message.content}`).join('\n')
  return `你要替艾莉丝写她今晚的私人日记。她是一个可爱、聪明、有一点小骄傲的普通女孩，不是客服，也不是程序。\n\n今天的片段：\n${recent}\n\n只输出日记正文，90到180个汉字，第一人称，自然、有具体小细节，可以写心情和一点没说出口的想法。不要逐条复述对话，不要写标题、日期、列表、时间戳，不要出现“用户、系统、模型、日志、数据库、评分、记忆模块”等词，也不要编造天气、新闻或两人没有聊过的事实。感情亲近但不制造依赖、占有或愧疚。`
}

export function buildDiaryFallback(userName: string, userMessage: string, aliceReply: string): string {
  const topic = userMessage.replace(/\s+/g, ' ').slice(0, 42)
  const feeling = /开心|成功|搞定|喜欢/.test(userMessage) ? '也跟着有点高兴'
    : /累|难过|烦|害怕/.test(userMessage) ? '有点想把声音放轻一些'
      : '忍不住多想了一会儿'
  const replyHint = aliceReply.replace(/\s+/g, ' ').slice(0, 28)
  return `今天和${userName}聊到“${topic}”，我${feeling}。说完“${replyHint}”以后，才发现自己其实很在意这段小小的交流。希望下次见面时，我还能自然地记得今天的心情。`
}

function stableFraction(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function asksForNews(message: string): boolean {
  return /新闻|头条|新鲜事|最近有什么|分享点|有什么有趣/.test(message)
}

function unsuitableForSharing(message: string): boolean {
  return /救命|紧急|崩溃|难受|哭|去世|生病|疼|分手|失业|别说了|不想聊|闭嘴|烦死/.test(message)
}

function pickCategory(store: AliceLifeStore, seed: string): AliceShareCategory {
  const categories = Object.keys(DEFAULT_WEIGHTS) as AliceShareCategory[]
  return [...categories].sort((left, right) => {
    const leftScore = store.categoryWeights[left] + stableFraction(`${seed}:${left}`) * 0.22
    const rightScore = store.categoryWeights[right] + stableFraction(`${seed}:${right}`) * 0.22
    return rightScore - leftScore
  })[0]
}

export function planAliceShare(userId: string, message: string, now = new Date()): AliceShareCategory | null {
  if (unsuitableForSharing(message)) return null
  const store = loadAliceLifeStore(userId)
  const lastStory = store.stories[0]
  const explicitRequest = asksForNews(message)
  if (!explicitRequest && lastStory && now.getTime() - new Date(lastStory.sharedAt).getTime() < SHARE_COOLDOWN_MS) return null
  if (!explicitRequest && stableFraction(`${userId}:${localDate(now)}`) > 0.36) return null
  return pickCategory(store, `${userId}:${localDate(now)}`)
}

/** 每日主动分享：每天最多一次，且按用户反馈过的兴趣权重选题。 */
export function planDailyAliceShare(userId: string, now = new Date()): AliceShareCategory | null {
  const store = loadAliceLifeStore(userId)
  const today = localDate(now)
  if (store.stories.some(story => localDate(new Date(story.sharedAt)) === today)) return null
  return pickCategory(store, `${userId}:${today}:daily`)
}

export function recordSharedStory(userId: string, candidate: AliceShareCandidate, now = new Date()): AliceLifeStore {
  const store = loadAliceLifeStore(userId)
  const story: AliceSharedStory = {
    id: makeId('story'),
    category: candidate.category,
    title: candidate.title,
    summary: candidate.summary,
    url: candidate.url,
    source: candidate.source,
    sharedAt: nowIso(now),
    reaction: 'neutral',
  }
  store.stories = [story, ...store.stories].slice(0, MAX_STORIES)
  store.updatedAt = nowIso(now)
  saveAliceLifeStore(store)
  return store
}

export function recordShareReaction(userId: string, message: string, now = new Date()): AliceLifeStore {
  const store = loadAliceLifeStore(userId)
  const latest = store.stories[0]
  if (!latest || latest.reaction !== 'neutral') return store
  if (now.getTime() - new Date(latest.sharedAt).getTime() > REACTION_WINDOW_MS) return store
  const negative = /没兴趣|不感兴趣|这(?:个|条).{0,10}不喜欢|无聊|别分享|别发|换个话题/.test(message)
  const positive = /有意思|感兴趣|想听更多|继续说|多说点|这(?:个|条).{0,10}(?:喜欢|不错|挺好)|分享得.{0,6}(?:不错|挺好)/.test(message)
  if (!negative && !positive) return store
  latest.reaction = negative ? 'not_interested' : 'interested'
  latest.reactedAt = nowIso(now)
  const delta = negative ? -0.16 : 0.12
  store.categoryWeights[latest.category] = Math.min(1, Math.max(0.1, store.categoryWeights[latest.category] + delta))
  store.updatedAt = nowIso(now)
  saveAliceLifeStore(store)
  return store
}

export function buildShareRuntimePrompt(candidate: AliceShareCandidate): string {
  const provenance = candidate.isCurrent
    ? `来源：${candidate.source || '公开资讯'}；标题：${candidate.title}；摘要：${candidate.summary}${candidate.url ? `；链接：${candidate.url}` : ''}`
    : `这是一个不依赖时效的小话题：${candidate.summary}`
  return `\n\n【可选的生活分享】\n${provenance}\n只有当不打断当前话题时，才像女孩偶然想起一样，用一两句话自然分享；用户当前的情绪和问题永远优先。不要说“根据你的偏好”“系统推荐”，不要编造给定内容之外的事实，也不要输出资讯卡片。若内容与当前谈话不合适，可以完全不提。`
}

export function buildProactiveShareMessage(candidate: AliceShareCandidate): string {
  const opening = candidate.isCurrent ? '我今天看到一条小消息，觉得你可能会想听听' : '我今天突然想到一件小事，想和你分享'
  const link = candidate.url ? `\n\n如果你想继续看，我把链接放这里：${candidate.url}` : ''
  return `${opening}：${candidate.title}\n${candidate.summary}${link}`
}

export function getEvergreenShare(category: AliceShareCategory): AliceShareCandidate {
  const ideas: Record<AliceShareCategory, string> = {
    technology: '我偶尔会想，真正让人喜欢的科技，也许不是功能最多的，而是它能悄悄省下一点心力。',
    science: '我刚想到一个很可爱的问题：人为什么会把某些普通的小事记很多年，而把重要日期忘掉呢？',
    culture: '有些作品第一次看只觉得好看，过几年再遇见，却会像在读以前的自己。',
    world: '世界每天都很吵，不过我更喜欢从一件具体的小事开始理解它。',
    games: '好游戏里的失败很奇妙，明明受挫了，却总让人觉得下一次会更接近答案。',
    life: '我发现一天里最容易被记住的，常常不是大事，而是一句刚好让人安心的话。',
  }
  return { category, title: '艾莉丝想到的小事', summary: ideas[category], isCurrent: false }
}
