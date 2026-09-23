import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')
const cliHome = path.join(projectRoot, '.supabase-cli-home')
const npmCache = path.join(projectRoot, '.npm-cache')

mkdirSync(cliHome, { recursive: true })
mkdirSync(npmCache, { recursive: true })

const env = {
  ...process.env,
  npm_config_cache: process.env.npm_config_cache || npmCache,
  npm_config_audit: process.env.npm_config_audit || 'false',
  npm_config_fund: process.env.npm_config_fund || 'false',
  npm_config_update_notifier: process.env.npm_config_update_notifier || 'false',
  SUPABASE_HOME: process.env.SUPABASE_HOME || cliHome,
  SUPABASE_CONFIG_DIR: process.env.SUPABASE_CONFIG_DIR || cliHome,
  SUPABASE_DISABLE_TELEMETRY: process.env.SUPABASE_DISABLE_TELEMETRY || '1',
}

const args = ['exec', '--', 'supabase', ...process.argv.slice(2)]
const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm'
const commandArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', ['npm', ...args].join(' ')]
  : args

const result = spawnSync(command, commandArgs, {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
