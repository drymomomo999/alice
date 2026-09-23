import { isSupabaseConfigured, supabase } from './supabase'
import {
  getEvergreenShare,
  loadAliceLifeStore,
  planDailyAliceShare,
  planAliceShare,
  saveAliceLifeStore,
  type AliceDiaryEntry,
  type AliceLifeStore,
  type AliceShareCandidate,
  type AliceShareCategory,
  type AliceSharedStory,
} from './aliceLife.service'

function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const merged = new Map(local.map(item => [item.id, item]))
  for (const item of remote) merged.set(item.id, item)
  return [...merged.values()]
}

export async function hydrateAliceLifeFromCloud(userId: string): Promise<AliceLifeStore> {
  const local = loadAliceLifeStore(userId)
  if (!isSupabaseConfigured() || userId === 'demo') return local
  const [diaryResult, preferencesResult, storiesResult] = await Promise.all([
    supabase.from('alice_diary_entries').select('*').eq('user_id', userId).order('entry_date', { ascending: false }).limit(180),
    supabase.from('alice_share_preferences').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('alice_shared_stories').select('*').eq('user_id', userId).order('shared_at', { ascending: false }).limit(80),
  ])
  // 新迁移尚未部署时保持本地能力，不让聊天失败。
  if (diaryResult.error || preferencesResult.error || storiesResult.error) return local
  const remoteDiary: AliceDiaryEntry[] = (diaryResult.data || []).map(row => ({
    id: row.id,
    date: row.entry_date,
    title: row.title,
    content: row.content,
    mood: row.mood,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
  const remoteStories: AliceSharedStory[] = (storiesResult.data || []).map(row => ({
    id: row.id,
    category: row.category,
    title: row.title,
    summary: row.summary,
    url: row.url || undefined,
    source: row.source || undefined,
    sharedAt: row.shared_at,
    reaction: row.reaction,
    reactedAt: row.reacted_at || undefined,
  }))
  const hydrated: AliceLifeStore = {
    ...local,
    diary: mergeById(local.diary, remoteDiary).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 180),
    stories: mergeById(local.stories, remoteStories).sort((a, b) => b.sharedAt.localeCompare(a.sharedAt)).slice(0, 80),
    categoryWeights: {
      ...local.categoryWeights,
      ...(preferencesResult.data?.category_weights || {}),
    },
    updatedAt: new Date().toISOString(),
  }
  saveAliceLifeStore(hydrated)
  return hydrated
}

export async function syncAliceLifeToCloud(store: AliceLifeStore): Promise<void> {
  if (!isSupabaseConfigured() || store.userId === 'demo') return
  const diaryRows = store.diary.map(entry => ({
    id: entry.id,
    user_id: store.userId,
    entry_date: entry.date,
    title: entry.title,
    content: entry.content,
    mood: entry.mood,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  }))
  const storyRows = store.stories.map(story => ({
    id: story.id,
    user_id: store.userId,
    category: story.category,
    title: story.title,
    summary: story.summary,
    url: story.url || null,
    source: story.source || null,
    shared_at: story.sharedAt,
    reaction: story.reaction,
    reacted_at: story.reactedAt || null,
  }))
  await Promise.all([
    diaryRows.length ? supabase.from('alice_diary_entries').upsert(diaryRows) : Promise.resolve(),
    storyRows.length ? supabase.from('alice_shared_stories').upsert(storyRows) : Promise.resolve(),
    supabase.from('alice_share_preferences').upsert({
      user_id: store.userId,
      category_weights: store.categoryWeights,
      updated_at: store.updatedAt,
    }),
  ])
}

export async function prepareAliceShare(
  userId: string,
  message: string,
  now = new Date(),
): Promise<AliceShareCandidate | null> {
  const category = planAliceShare(userId, message, now)
  if (!category) return null
  if (!isSupabaseConfigured() || userId === 'demo') return getEvergreenShare(category)
  try {
    const excludedUrls = loadAliceLifeStore(userId).stories.map(story => story.url).filter(Boolean).slice(0, 12)
    const { data, error } = await supabase.functions.invoke('alice-share', {
      body: { category, excludedUrls },
      signal: AbortSignal.timeout(6000),
    })
    if (error || !data?.story) return getEvergreenShare(category)
    const story = data.story as Partial<AliceShareCandidate>
    if (!story.title || !story.summary) return getEvergreenShare(category)
    return {
      category: (story.category || category) as AliceShareCategory,
      title: story.title,
      summary: story.summary,
      url: story.url,
      source: story.source,
      isCurrent: true,
    }
  } catch {
    return getEvergreenShare(category)
  }
}

export async function prepareDailyAliceShare(
  userId: string,
  now = new Date(),
): Promise<AliceShareCandidate | null> {
  const category = planDailyAliceShare(userId, now)
  if (!category) return null
  if (!isSupabaseConfigured() || userId === 'demo') return getEvergreenShare(category)
  try {
    const excludedUrls = loadAliceLifeStore(userId).stories.map(story => story.url).filter(Boolean).slice(0, 12)
    const { data, error } = await supabase.functions.invoke('alice-share', {
      body: { category, excludedUrls },
      signal: AbortSignal.timeout(6000),
    })
    if (error || !data?.story) return getEvergreenShare(category)
    const story = data.story as Partial<AliceShareCandidate>
    if (!story.title || !story.summary) return getEvergreenShare(category)
    return {
      category: (story.category || category) as AliceShareCategory,
      title: story.title,
      summary: story.summary,
      url: story.url,
      source: story.source,
      isCurrent: true,
    }
  } catch {
    return getEvergreenShare(category)
  }
}
