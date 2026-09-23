import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('..', import.meta.url))

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`)
  if (process.platform === 'win32') {
    // Node 24 在部分 Windows 环境直接 spawnSync npm.cmd 会返回 EINVAL。
    // 这里的命令与参数全部是本文件内的固定值，不接收外部输入。
    execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', [command, ...args].join(' ')], {
      cwd,
      stdio: 'inherit',
    })
    return
  }
  execFileSync(command, args, { cwd, stdio: 'inherit' })
}

function walk(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

const packageJson = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
const tauriConfig = JSON.parse(readFileSync(join(cwd, 'src-tauri', 'tauri.conf.json'), 'utf8'))

if (packageJson.version !== tauriConfig.version) {
  throw new Error(`版本不一致：package.json=${packageJson.version}, tauri.conf.json=${tauriConfig.version}`)
}

run('npm', ['run', 'test:course-engine'])
run('npm', ['run', 'test:goals'])
run('npm', ['run', 'test:relationship'])
run('npm', ['run', 'test:alice-life'])
run('npm', ['run', 'build'])
run('cargo', ['check', '--manifest-path', 'src-tauri\\Cargo.toml'])

const textAssets = walk(join(cwd, 'dist')).filter(path => /\.(?:js|css|html|map|json|txt)$/i.test(path))
const leakedSecretPatterns = [
  /(?:^|[^\w])sk-[A-Za-z0-9_-]{20,}/,
  /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["']?[^\s"']+/i,
  /MINIMAX_API_KEY\s*[:=]\s*["']?[^\s"']+/i,
]

for (const path of textAssets) {
  const content = readFileSync(path, 'utf8')
  if (leakedSecretPatterns.some(pattern => pattern.test(content))) {
    throw new Error(`生产资源疑似包含服务端密钥：${path}`)
  }
}

console.log(`\nBeta release check passed (QuestMind ${packageJson.version}).`)
console.log('下一步：npm run tauri:build:beta，然后按 docs/BETA_TEST_GUIDE.md 做实机验收。')
