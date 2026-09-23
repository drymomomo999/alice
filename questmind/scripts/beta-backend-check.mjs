import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('..', import.meta.url))
const env = Object.fromEntries(
  readFileSync(`${cwd}\\.env`, 'utf8')
    .split(/\r?\n/)
    .map(line => line.match(/^([^#=]+)=(.*)$/))
    .filter(Boolean)
    .map(match => [match[1].trim(), match[2].trim()]),
)

const base = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY
if (!base || !key || key.includes('your_')) throw new Error('Supabase 环境变量未正确配置')

async function status(path, init = {}) {
  const response = await fetch(`${base}${path}`, init)
  return response.status
}

const settingsResponse = await fetch(`${base}/auth/v1/settings`, { headers: { apikey: key } })
if (!settingsResponse.ok) throw new Error(`Auth settings HTTP ${settingsResponse.status}`)
const settings = await settingsResponse.json()
console.log(`AUTH_EMAIL_ENABLED=${Boolean(settings.external?.email)}`)
console.log(`AUTH_EMAIL_AUTOCONFIRM=${Boolean(settings.mailer_autoconfirm)}`)

const headers = { apikey: key, Authorization: `Bearer ${key}` }
const tables = [
  'users', 'goals', 'daily_tasks', 'relationship_preferences', 'relationship_state',
  'alice_diary_entries', 'alice_share_preferences', 'alice_shared_stories',
  'plan_revisions', 'course_learning_events',
]
let failed = false

for (const table of tables) {
  const code = await status(`/rest/v1/${table}?select=*&limit=0`, { headers })
  console.log(`TABLE ${table} STATUS=${code}`)
  if (code !== 200) failed = true
}

const requiredColumnChecks = [
  ['goals', 'category'],
  ['sub_goals', 'description,day_range,canonical_title,lifecycle_status,node_ids_json,source_version'],
  ['daily_tasks', 'day_index,sub_goal_index,difficulty_level,resource_reference,checklist,lifecycle_status,node_ids_json,due_at,estimated_minutes,generation_reason,source_revision_id,supersedes_task_id,completion_signal,unlock_condition'],
  ['courses', 'snapshot,snapshot_updated_at,current_stage,active_goal_id,continuity_version'],
]

for (const [table, columns] of requiredColumnChecks) {
  const code = await status(`/rest/v1/${table}?select=${columns}&limit=0`, { headers })
  console.log(`COLUMNS ${table} STATUS=${code}`)
  if (code !== 200) failed = true
}

for (const functionName of ['ai-chat', 'alice-voice', 'alice-share']) {
  const code = await status(`/functions/v1/${functionName}`, { method: 'OPTIONS' })
  console.log(`FUNCTION ${functionName} OPTIONS_STATUS=${code}`)
  if (code < 200 || code >= 400) failed = true
}

if (failed) throw new Error('后端存在未部署或不可访问的资源')
console.log('Beta backend check passed.')
