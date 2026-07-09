@echo off
:: ============================================
:: QuestMind 静默启动器
:: 双击直接打开 App，命令行窗口一闪即逝
:: ============================================

:: 切到项目目录
cd /d "d:\text1\questmind"

:: 启动 tauri:dev（开新窗口最小化，避免阻塞）
start "QuestMind" /MIN cmd /c "npm run tauri:dev"

exit
