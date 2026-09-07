// 一键"包装"启动：直接 spawn release 二进制，detached 后脱离父进程，
// 不弹任何终端窗口（在 lib.rs 加了 windows_subsystem 后，窗口本身也不显示 cmd）。
// 如果二进制还没构建，会给出明确提示。
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const exe = path.join(__dirname, '..', 'src-tauri', 'target', 'release', 'questmind.exe')

if (!fs.existsSync(exe)) {
  console.error('[launch] 找不到 release 二进制：', exe)
  console.error('[launch] 请先运行 `npm run tauri:build:release` 编译一次。')
  process.exit(1)
}

const child = spawn(exe, { detached: true, stdio: 'ignore', windowsHide: true })
child.unref()

console.log('[launch] QuestMind 已启动，PID:', child.pid)
console.log('[launch] exe:', exe)
