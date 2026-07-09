/**
 * 静默启动 Vite 开发服务器（Windows 下不弹出额外 PowerShell/cmd 窗口）
 *
 * Tauri 的 beforeDevCommand 默认通过系统 shell 执行 "npm run dev"，
 * 在 Windows 上会弹出一个额外的控制台窗口。此脚本用 child_process.spawn
 * 并设置 windowsHide: true 来避免这个问题。
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

const child = spawn('npx', ['vite'], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: true,
  windowsHide: true,
})

// 转发退出信号，确保 Tauri 退出时 Vite 也被终止
const kill = (signal) => {
  try {
    if (process.platform === 'win32') {
      // Windows 下用 taskkill 确保子进程树全部终止
      spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore', windowsHide: true })
    } else {
      child.kill(signal)
    }
  } catch { /* ignore */ }
  process.exit(0)
}

process.on('SIGINT', () => kill('SIGINT'))
process.on('SIGTERM', () => kill('SIGTERM'))
process.on('exit', () => kill())

child.on('exit', (code) => process.exit(code ?? 0))
