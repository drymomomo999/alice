import assert from 'node:assert/strict'
import { belongsToAccount, mergeUserProfile } from '../src/services/profileRecovery'

const cached = { id: 'profile-id', authId: 'auth-id', email: 'me@example.com', nickname: '原昵称', avatar: '🌸', timePreference: 'night' as const, goalPreferences: ['study' as const], onboardingCompleted: true, createdAt: '2026-01-01' }
assert.equal(belongsToAccount(cached, 'auth-id', 'me@example.com'), true)
assert.equal(belongsToAccount(cached, 'other-id', 'other@example.com'), false)
const merged = mergeUserProfile({ ...cached, nickname: '', avatar: undefined, timePreference: undefined, goalPreferences: [], onboardingCompleted: false }, cached, { city: '上海' })
assert.equal(merged.nickname, '原昵称')
assert.equal(merged.avatar, '🌸')
assert.equal(merged.onboardingCompleted, true)
assert.equal(merged.city, '上海')
const migrated = mergeUserProfile({ ...cached, id: 'database-profile-id' }, { ...cached, id: 'auth-id', authId: undefined })
assert.equal(migrated.nickname, '原昵称', '旧版以 auth id 缓存的资料必须迁移到数据库 profile id')
assert.equal(migrated.id, 'database-profile-id')
console.log('profile recovery acceptance: ok')
