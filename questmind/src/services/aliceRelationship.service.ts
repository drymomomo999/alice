import type { AliceScene } from '@/types'

export type RelationshipScope = 'global' | 'cabin' | 'goal' | `study:${string}` | `project:${string}`
export type RelationshipStage = 'S0' | 'S1' | 'S2' | 'S3'

export interface RelationshipPreference {
  id: string
  scope: RelationshipScope
  key: string
  value: string
  confidence: number
  source: 'explicit' | 'inferred'
  createdAt: string
  updatedAt: string
  expiresAt?: string
  active: boolean
}

export interface RelationshipMoment {
  id: string
  title: string
  summary: string
  scope: RelationshipScope
  tone: string
  significance: number
  createdAt: string
  lastRecalledAt?: string
  recallCount: number
  active: boolean
}

export interface RelationshipFollowUp {
  id: string
  topic: string
  summary: string
  scope: RelationshipScope
  earliestAt: string
  expiresAt: string
  priority: number
  askOnce: boolean
  askedAt?: string
  dismissedAt?: string
}

export interface RelationshipInteractionEvent {
  id: string
  sessionId: string
  eventType: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface RelationshipAnalytics {
  sessionStartMode: AliceScene
  userInitiated: boolean
  voluntaryTurns: number
  followupUsed: number
  followupResponse: number
  memoryCorrection: number
  momentRecall: number
  updatedAt: string
}

export interface RelationshipStore {
  version: 1
  userId: string
  preferences: RelationshipPreference[]
  moments: RelationshipMoment[]
  followups: RelationshipFollowUp[]
  events: RelationshipInteractionEvent[]
  interactionDates: string[]
  analytics: RelationshipAnalytics
}

export interface RelationshipContext {
  stage: RelationshipStage
  style: { banter: number; curiosity: number; warmth: number; selfPride: number }
  preferences: RelationshipPreference[]
  moments: RelationshipMoment[]
  followup?: RelationshipFollowUp
  tokenEstimate: number
  prompt: string
}

export interface RelationshipTurnInput {
  userId: string
  scene: AliceScene
  goalId?: string
  message: string
  sessionId?: string
  now?: Date
}

const STORAGE_PREFIX = 'questmind:alice-relationship-v1:'
const MAX_DYNAMIC_TOKENS = 800
const MAX_EVENTS = 160
const MAX_PREFERENCES = 60
const MAX_MOMENTS = 80
const MAX_FOLLOWUPS = 40

function nowIso(now = new Date()): string {
  return now.toISOString()
}

function stableId(prefix: string, value: string): string {
  let hash = 2166136261
  for (const char of value) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`
}

function defaultAnalytics(now = new Date()): RelationshipAnalytics {
  return {
    sessionStartMode: 'HOME', userInitiated: true, voluntaryTurns: 0,
    followupUsed: 0, followupResponse: 0, memoryCorrection: 0,
    momentRecall: 0, updatedAt: nowIso(now),
  }
}

function emptyStore(userId: string, now = new Date()): RelationshipStore {
  return {
    version: 1, userId, preferences: [], moments: [], followups: [], events: [],
    interactionDates: [], analytics: defaultAnalytics(now),
  }
}

function storage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

export function loadRelationshipStore(userId: string, now = new Date()): RelationshipStore {
  const fallback = emptyStore(userId, now)
  try {
    const raw = storage()?.getItem(`${STORAGE_PREFIX}${userId}`)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<RelationshipStore>
    return {
      ...fallback,
      ...parsed,
      version: 1,
      userId,
      preferences: Array.isArray(parsed.preferences) ? parsed.preferences : [],
      moments: Array.isArray(parsed.moments) ? parsed.moments : [],
      followups: Array.isArray(parsed.followups) ? parsed.followups : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
      interactionDates: Array.isArray(parsed.interactionDates) ? parsed.interactionDates : [],
      analytics: { ...fallback.analytics, ...(parsed.analytics || {}) },
    }
  } catch {
    return fallback
  }
}

export function saveRelationshipStore(store: RelationshipStore): void {
  storage()?.setItem(`${STORAGE_PREFIX}${store.userId}`, JSON.stringify(store))
}

export function seedRelationshipFromLegacyProfile(
  userId: string,
  legacy: {
    preferenceTags?: string[]
    memoryEntries?: Array<{ id?: string; type?: string; fact: string; importance?: number; confidence?: number; createdAt?: string }>
  },
): RelationshipStore {
  const store = loadRelationshipStore(userId)
  const now = new Date()
  for (const value of (legacy.preferenceTags || []).slice(0, 12)) {
    const id = stableId('pref', `${userId}:legacy:${value}`)
    if (!store.preferences.some(item => item.id === id)) {
      store.preferences.push({
        id, scope: 'global', key: stableId('legacy', value), value,
        confidence: 0.7, source: 'inferred', createdAt: nowIso(now),
        updatedAt: nowIso(now), active: true,
      })
    }
  }
  for (const entry of (legacy.memoryEntries || []).filter(item => ['EVENT', 'RELATIONSHIP', 'KNOWLEDGE'].includes(item.type || '')).slice(-20)) {
    const id = stableId('moment', `${userId}:legacy:${entry.id || entry.fact}`)
    if (!store.moments.some(item => item.id === id)) {
      store.moments.push({
        id, title: entry.fact.slice(0, 28), summary: entry.fact.slice(0, 120), scope: 'cabin', tone: 'calm',
        significance: Math.min(1, Math.max(0.2, entry.importance || 0.5)),
        createdAt: entry.createdAt || nowIso(now), recallCount: 0, active: (entry.confidence || 0.6) >= 0.45,
      })
    }
  }
  store.preferences = store.preferences.slice(-MAX_PREFERENCES)
  store.moments = store.moments.slice(-MAX_MOMENTS)
  saveRelationshipStore(store)
  return store
}

function scopeFor(scene: AliceScene, goalId?: string): RelationshipScope {
  return scene === 'HOME' ? 'cabin' : goalId ? `project:${goalId}` : 'goal'
}

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[\p{Script=Han}]{2,}|[a-z0-9]{3,}/gu) || []
}

function relevance(text: string, message: string): number {
  const left = new Set(tokens(text))
  const right = new Set(tokens(message))
  if (!left.size || !right.size) return 0
  let hits = 0
  for (const token of left) {
    if ([...right].some(candidate => candidate.includes(token) || token.includes(candidate))) hits += 1
  }
  return hits / left.size
}

function estimateTokens(text: string): number {
  let total = 0
  for (const char of text) total += /[\u3400-\u9fff]/.test(char) ? 0.62 : /\s/.test(char) ? 0 : 0.28
  return Math.ceil(total)
}

function matchesScope(scope: RelationshipScope, scene: AliceScene, goalId?: string): boolean {
  if (scope === 'global') return true
  if (scene === 'HOME') return scope === 'cabin'
  return scope === 'goal' || scope === `project:${goalId || ''}`
}

function addEvent(
  store: RelationshipStore,
  eventType: string,
  payload: Record<string, unknown>,
  sessionId: string,
  now: Date,
): void {
  store.events.push({
    id: stableId('evt', `${eventType}:${now.getTime()}:${JSON.stringify(payload)}`),
    sessionId, eventType, payload, createdAt: nowIso(now),
  })
  store.events = store.events.slice(-MAX_EVENTS)
}

function preferenceCandidate(message: string): { key: string; value: string } | null {
  const text = message.trim().replace(/[。！？!?]+$/, '')
  const direct = text.match(/(?:以后|今后)?(?:请你?)?(不要|别再|别|少|多|可以|应该|最好)(.{2,60})/)
  if (direct) {
    const value = `${direct[1]}${direct[2]}`.trim()
    return { key: stableId('style', direct[2].replace(/\s/g, '')), value }
  }
  const personal = text.match(/(我(?:更)?喜欢|我不喜欢|我讨厌|我希望你)(.{2,60})/)
  if (personal) return { key: stableId('style', personal[2].replace(/\s/g, '')), value: `${personal[1]}${personal[2]}` }
  return null
}

function parseFutureDate(message: string, now: Date): { earliestAt: Date; expiresAt: Date } | null {
  const future = /(明天|后天|下周|周[一二三四五六日天]|月底|下个月|过几天|到时候).{0,30}(路演|面试|考试|开会|汇报|答辩|提交|发布|去|要|会|准备)/
  if (!future.test(message)) return null
  const earliestAt = new Date(now)
  if (message.includes('后天')) earliestAt.setDate(earliestAt.getDate() + 2)
  else if (/下周|过几天/.test(message)) earliestAt.setDate(earliestAt.getDate() + 5)
  else if (/月底|下个月/.test(message)) earliestAt.setDate(earliestAt.getDate() + 21)
  else earliestAt.setDate(earliestAt.getDate() + 1)
  earliestAt.setHours(8, 0, 0, 0)
  const expiresAt = new Date(earliestAt)
  expiresAt.setDate(expiresAt.getDate() + 7)
  return { earliestAt, expiresAt }
}

function momentScore(message: string): number {
  let score = 0
  if (/终于|第一次|成功|通过|完成|搞定|明白了|懂了|做到了/.test(message)) score += 0.45
  if (/特别重要|对我很重要|记住|难忘|里程碑/.test(message)) score += 0.4
  if (/开心|激动|骄傲|难过|崩溃|失望|感动/.test(message)) score += 0.25
  if (/我们|一起|艾莉丝|你帮我/.test(message)) score += 0.15
  return Math.min(1, score)
}

function relationshipStage(store: RelationshipStore): RelationshipStage {
  const days = new Set(store.interactionDates).size
  const confirmed = store.preferences.filter(item => item.active && item.confidence >= 0.9).length
  const moments = store.moments.filter(item => item.active).length
  if (days >= 21 && confirmed + moments >= 8) return 'S3'
  if (days >= 7 && confirmed + moments >= 4) return 'S2'
  if (days >= 2 || confirmed >= 1) return 'S1'
  return 'S0'
}

function styleFor(stage: RelationshipStage): RelationshipContext['style'] {
  if (stage === 'S3') return { banter: 0.58, curiosity: 0.62, warmth: 0.78, selfPride: 0.04 }
  if (stage === 'S2') return { banter: 0.44, curiosity: 0.68, warmth: 0.76, selfPride: 0.035 }
  if (stage === 'S1') return { banter: 0.22, curiosity: 0.62, warmth: 0.7, selfPride: 0.025 }
  return { banter: 0.08, curiosity: 0.48, warmth: 0.62, selfPride: 0.015 }
}

export function recordRelationshipUserMessage(input: RelationshipTurnInput): RelationshipStore {
  const now = input.now || new Date()
  const store = loadRelationshipStore(input.userId, now)
  const sessionId = input.sessionId || `${input.scene.toLowerCase()}-${now.toISOString().slice(0, 10)}`
  const scope = scopeFor(input.scene, input.goalId)
  const message = input.message.trim()

  store.analytics.sessionStartMode = input.scene
  store.analytics.userInitiated = true
  store.analytics.voluntaryTurns += 1
  store.analytics.updatedAt = nowIso(now)
  const day = now.toISOString().slice(0, 10)
  if (!store.interactionDates.includes(day)) store.interactionDates.push(day)
  store.interactionDates = store.interactionDates.slice(-90)

  const pendingResponse = store.followups.find(item => item.askedAt && !item.dismissedAt
    && now.getTime() - Date.parse(item.askedAt) < 24 * 60 * 60 * 1000
    && !store.events.some(event => event.eventType === 'followup_response' && event.payload.followupId === item.id))
  if (pendingResponse && !/(别再提|不要再提|不用再问|别问了)/.test(message)) {
    store.analytics.followupResponse += 1
    addEvent(store, 'followup_response', { followupId: pendingResponse.id }, sessionId, now)
  }

  const suppression = message.match(/(?:这事|这个|关于)?(.{0,30}?)(?:别再提|不要再提|不用再问|别问了)/)
  if (suppression) {
    const topic = suppression[1].trim()
    const relevant = (value: string) => !topic || relevance(value, topic) > 0 || value.includes(topic)
    store.followups.forEach(item => { if (!item.dismissedAt && relevant(item.topic)) item.dismissedAt = nowIso(now) })
    store.moments.forEach(item => { if (item.active && relevant(`${item.title} ${item.summary}`)) item.active = false })
    store.analytics.memoryCorrection += 1
    addEvent(store, 'memory_correction', { topic: topic || 'current_topic' }, sessionId, now)
  }

  const candidate = preferenceCandidate(message)
  if (candidate) {
    const existing = store.preferences.find(item => item.key === candidate.key && item.scope === scope)
    if (existing) {
      existing.value = candidate.value
      existing.confidence = 1
      existing.source = 'explicit'
      existing.updatedAt = nowIso(now)
      existing.active = true
    } else {
      store.preferences.push({
        id: stableId('pref', `${input.userId}:${scope}:${candidate.key}`),
        scope, key: candidate.key, value: candidate.value, confidence: 1,
        source: 'explicit', createdAt: nowIso(now), updatedAt: nowIso(now), active: true,
      })
    }
    store.preferences = store.preferences.slice(-MAX_PREFERENCES)
    addEvent(store, 'explicit_preference', { scope, value: candidate.value }, sessionId, now)
  }

  const future = parseFutureDate(message, now)
  if (future) {
    const topic = message.slice(0, 80)
    const id = stableId('follow', `${input.userId}:${topic}`)
    const existing = store.followups.find(item => item.id === id)
    const followup: RelationshipFollowUp = {
      id, topic, summary: topic, scope, earliestAt: nowIso(future.earliestAt),
      expiresAt: nowIso(future.expiresAt), priority: 0.72, askOnce: true,
    }
    if (existing) Object.assign(existing, followup)
    else store.followups.push(followup)
    store.followups = store.followups.slice(-MAX_FOLLOWUPS)
    addEvent(store, 'followup_created', { scope, topic }, sessionId, now)
  }

  const score = momentScore(message)
  const sessionMomentCount = store.events.filter(event => event.sessionId === sessionId && event.eventType === 'moment_created').length
  if (score >= 0.6 && sessionMomentCount < 2) {
    const summary = message.slice(0, 120)
    const id = stableId('moment', `${input.userId}:${summary}`)
    if (!store.moments.some(item => item.id === id)) {
      store.moments.push({
        id, title: summary.slice(0, 28), summary, scope,
        tone: /开心|成功|通过|终于|懂了/.test(message) ? 'proud' : /难过|崩溃|失望/.test(message) ? 'frustrating' : 'calm',
        significance: score, createdAt: nowIso(now), recallCount: 0, active: true,
      })
      store.moments = store.moments.slice(-MAX_MOMENTS)
      addEvent(store, 'moment_created', { scope, score }, sessionId, now)
    }
  }

  addEvent(store, 'voluntary_turn', { scene: input.scene }, sessionId, now)
  saveRelationshipStore(store)
  return store
}

export function buildRelationshipContext(input: RelationshipTurnInput): RelationshipContext {
  const now = input.now || new Date()
  const store = loadRelationshipStore(input.userId, now)
  const stage = relationshipStage(store)
  const style = styleFor(stage)
  const preferences = store.preferences
    .filter(item => item.active && (!item.expiresAt || Date.parse(item.expiresAt) > now.getTime()))
    .filter(item => matchesScope(item.scope, input.scene, input.goalId))
    .sort((a, b) => b.confidence - a.confidence || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 5)

  const threeDays = 3 * 86_400_000
  const moments = store.moments
    .filter(item => item.active && matchesScope(item.scope, input.scene, input.goalId))
    .map(item => {
      const semantic = relevance(`${item.title} ${item.summary}`, input.message)
      const cooldown = item.lastRecalledAt && now.getTime() - Date.parse(item.lastRecalledAt) < threeDays ? 0.2 : 1
      const novelty = item.recallCount >= 3 ? 0.15 : 1
      const score = (semantic * 0.4 + item.significance * 0.25 + 0.25) * cooldown * novelty
      return { item, score, semantic }
    })
    .filter(item => item.semantic > 0 && item.score >= 0.18)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(item => item.item)

  const followup = input.scene === 'HOME'
    ? store.followups
      .filter(item => !item.dismissedAt && (!item.askOnce || !item.askedAt))
      .filter(item => Date.parse(item.earliestAt) <= now.getTime() && Date.parse(item.expiresAt) >= now.getTime())
      .sort((a, b) => b.priority - a.priority)[0]
    : undefined

  const lines = [
    '【关系上下文】',
    `关系阶段：${stage}。这只控制熟悉程度，不代表恋爱、排他或功能权限。`,
    `互动参数：好奇 ${style.curiosity.toFixed(2)}，轻微斗嘴 ${style.banter.toFixed(2)}，温度 ${style.warmth.toFixed(2)}，小得意 ${style.selfPride.toFixed(3)}。小得意低于 5% 会话且不得连续出现。`,
  ]
  if (preferences.length) lines.push(`明确交流偏好：${preferences.map(item => item.value).join('；')}`)
  if (moments.length) lines.push(`可选共同经历：${moments.map(item => item.summary).join('；')}`)
  if (followup) lines.push(`可选一次性后续：${followup.summary}。仅在自然时问一句；不要连续追问。`)
  lines.push('先回应用户此刻真正表达的内容；不要把闲聊强行变成建议。最多问一个非必要问题。不要提及内部记忆、分数或检索。')

  while (estimateTokens(lines.join('\n')) > MAX_DYNAMIC_TOKENS && lines.length > 4) lines.splice(lines.length - 2, 1)
  const prompt = lines.join('\n')
  return { stage, style, preferences, moments, followup, tokenEstimate: estimateTokens(prompt), prompt }
}

export function recordRelationshipResponse(
  userId: string,
  context: RelationshipContext,
  scene: AliceScene,
  now = new Date(),
): RelationshipStore {
  const store = loadRelationshipStore(userId, now)
  if (context.followup) {
    const item = store.followups.find(candidate => candidate.id === context.followup?.id)
    if (item) item.askedAt = nowIso(now)
    store.analytics.followupUsed += 1
  }
  for (const recalled of context.moments) {
    const item = store.moments.find(candidate => candidate.id === recalled.id)
    if (item) {
      item.lastRecalledAt = nowIso(now)
      item.recallCount += 1
    }
  }
  store.analytics.momentRecall += context.moments.length
  store.analytics.updatedAt = nowIso(now)
  addEvent(store, 'assistant_response', {
    scene, followupUsed: Boolean(context.followup), recalledMomentIds: context.moments.map(item => item.id),
  }, `${scene.toLowerCase()}-${now.toISOString().slice(0, 10)}`, now)
  saveRelationshipStore(store)
  return store
}

export function deleteRelationshipMemory(
  userId: string,
  kind: 'preference' | 'moment' | 'followup',
  id: string,
): RelationshipStore {
  const store = loadRelationshipStore(userId)
  if (kind === 'preference') store.preferences = store.preferences.filter(item => item.id !== id)
  if (kind === 'moment') store.moments = store.moments.filter(item => item.id !== id)
  if (kind === 'followup') store.followups = store.followups.filter(item => item.id !== id)
  addEvent(store, 'memory_deleted', { kind, id }, 'memory-manager', new Date())
  saveRelationshipStore(store)
  return store
}

export function clearRelationshipMemories(userId: string): RelationshipStore {
  const current = loadRelationshipStore(userId)
  const cleared = emptyStore(userId)
  cleared.interactionDates = current.interactionDates
  cleared.analytics = current.analytics
  saveRelationshipStore(cleared)
  return cleared
}

export function getRelationshipStage(userId: string): RelationshipStage {
  return relationshipStage(loadRelationshipStore(userId))
}

export { MAX_DYNAMIC_TOKENS }
