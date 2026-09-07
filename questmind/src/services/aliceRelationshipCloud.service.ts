import { isSupabaseConfigured, supabase } from './supabase'
import {
  loadRelationshipStore,
  saveRelationshipStore,
  type RelationshipFollowUp,
  type RelationshipInteractionEvent,
  type RelationshipMoment,
  type RelationshipPreference,
  type RelationshipStore,
} from './aliceRelationship.service'

function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const merged = new Map(local.map(item => [item.id, item]))
  for (const item of remote) merged.set(item.id, item)
  return [...merged.values()]
}

export async function hydrateRelationshipStoreFromCloud(userId: string): Promise<RelationshipStore> {
  const local = loadRelationshipStore(userId)
  if (!isSupabaseConfigured()) return local
  const [preferences, moments, followups, events] = await Promise.all([
    supabase.from('relationship_preferences').select('*').eq('user_id', userId),
    supabase.from('relationship_moments').select('*').eq('user_id', userId),
    supabase.from('relationship_followups').select('*').eq('user_id', userId),
    supabase.from('relationship_interaction_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(160),
  ])
  if (preferences.error || moments.error || followups.error || events.error) return local

  const remotePreferences: RelationshipPreference[] = (preferences.data || []).map(row => ({
    id: row.id, scope: row.scope, key: row.key,
    value: typeof row.value_json === 'string' ? row.value_json : row.value_json?.value || '',
    confidence: row.confidence, source: row.source, active: row.active,
    createdAt: row.created_at, updatedAt: row.updated_at, expiresAt: row.expires_at || undefined,
  }))
  const remoteMoments: RelationshipMoment[] = (moments.data || []).map(row => ({
    id: row.id, title: row.title, summary: row.summary, scope: row.scope,
    tone: row.tone || 'calm', significance: row.significance, createdAt: row.created_at,
    lastRecalledAt: row.last_recalled_at || undefined, recallCount: row.recall_count,
    active: row.active,
  }))
  const remoteFollowups: RelationshipFollowUp[] = (followups.data || []).map(row => ({
    id: row.id, topic: row.topic, summary: row.summary, scope: row.scope,
    earliestAt: row.earliest_at, expiresAt: row.expires_at, priority: row.priority,
    askOnce: row.ask_once, askedAt: row.asked_at || undefined, dismissedAt: row.dismissed_at || undefined,
  }))
  const remoteEvents: RelationshipInteractionEvent[] = (events.data || []).map(row => ({
    id: row.id, sessionId: row.session_id, eventType: row.event_type,
    payload: row.payload_json || {}, createdAt: row.created_at,
  }))
  const hydrated: RelationshipStore = {
    ...local,
    preferences: mergeById(local.preferences, remotePreferences),
    moments: mergeById(local.moments, remoteMoments),
    followups: mergeById(local.followups, remoteFollowups),
    events: mergeById(local.events, remoteEvents).slice(-160),
  }
  saveRelationshipStore(hydrated)
  return hydrated
}

export async function syncRelationshipStoreToCloud(store: RelationshipStore): Promise<void> {
  if (!isSupabaseConfigured() || store.userId === 'demo') return
  const preferences = store.preferences.map(item => ({
    id: item.id, user_id: store.userId, scope: item.scope, key: item.key,
    value_json: { value: item.value }, confidence: item.confidence, source: item.source,
    active: item.active, expires_at: item.expiresAt || null,
    created_at: item.createdAt, updated_at: item.updatedAt,
  }))
  const moments = store.moments.map(item => ({
    id: item.id, user_id: store.userId, title: item.title, summary: item.summary,
    scope: item.scope, tone: item.tone, significance: item.significance,
    last_recalled_at: item.lastRecalledAt || null, recall_count: item.recallCount,
    active: item.active, created_at: item.createdAt,
  }))
  const followups = store.followups.map(item => ({
    id: item.id, user_id: store.userId, topic: item.topic, summary: item.summary,
    scope: item.scope, earliest_at: item.earliestAt, expires_at: item.expiresAt,
    priority: item.priority, ask_once: item.askOnce, asked_at: item.askedAt || null,
    dismissed_at: item.dismissedAt || null,
  }))
  const events = store.events.slice(-40).map(item => ({
    id: item.id, user_id: store.userId, session_id: item.sessionId,
    event_type: item.eventType, payload_json: item.payload, created_at: item.createdAt,
  }))
  const confirmedSignals = store.preferences.filter(item => item.active && item.confidence >= 0.9).length
    + store.moments.filter(item => item.active).length
  const stage = store.interactionDates.length >= 21 && confirmedSignals >= 8 ? 'S3'
    : store.interactionDates.length >= 7 && confirmedSignals >= 4 ? 'S2'
      : store.interactionDates.length >= 2 || confirmedSignals >= 1 ? 'S1' : 'S0'
  await Promise.all([
    preferences.length ? supabase.from('relationship_preferences').upsert(preferences) : Promise.resolve(),
    moments.length ? supabase.from('relationship_moments').upsert(moments) : Promise.resolve(),
    followups.length ? supabase.from('relationship_followups').upsert(followups) : Promise.resolve(),
    events.length ? supabase.from('relationship_interaction_events').upsert(events) : Promise.resolve(),
    supabase.from('relationship_state').upsert({
      user_id: store.userId, stage,
      banter_level: stage === 'S3' ? 0.58 : stage === 'S2' ? 0.44 : stage === 'S1' ? 0.22 : 0.08,
      curiosity_level: stage === 'S3' ? 0.62 : stage === 'S2' ? 0.68 : stage === 'S1' ? 0.62 : 0.48,
      warmth_level: stage === 'S3' ? 0.78 : stage === 'S2' ? 0.76 : stage === 'S1' ? 0.7 : 0.62,
      self_pride_level: stage === 'S3' ? 0.04 : stage === 'S2' ? 0.035 : stage === 'S1' ? 0.025 : 0.015,
      updated_at: new Date().toISOString(),
    }),
  ])
}

export async function deleteRelationshipMemoryFromCloud(
  userId: string,
  kind: 'preference' | 'moment' | 'followup',
  id: string,
): Promise<void> {
  if (!isSupabaseConfigured() || userId === 'demo') return
  const table = kind === 'preference' ? 'relationship_preferences'
    : kind === 'moment' ? 'relationship_moments' : 'relationship_followups'
  await supabase.from(table).delete().eq('user_id', userId).eq('id', id)
}

export async function clearRelationshipMemoriesFromCloud(userId: string): Promise<void> {
  if (!isSupabaseConfigured() || userId === 'demo') return
  await Promise.all([
    supabase.from('relationship_preferences').delete().eq('user_id', userId),
    supabase.from('relationship_moments').delete().eq('user_id', userId),
    supabase.from('relationship_followups').delete().eq('user_id', userId),
  ])
}
