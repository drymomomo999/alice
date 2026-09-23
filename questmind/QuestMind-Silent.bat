@echo off
:: ============================================
:: QuestMind 静默启动器
:: 只启动已经编译好的 GUI，不再启动 Vite / Cargo 开发环境
:: ============================================

set "QUESTMIND_EXE=%~dp0src-tauri\target\release\questmind.exe"

if not exist "%QUESTMIND_EXE%" (
    msg * "QuestMind 正式程序尚未构建，请先运行 build-app.bat。"
    exit /b 1
)

start "" "%QUESTMIND_EXE%"
exit /b 0
