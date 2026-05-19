@echo off
title QuestMind - AI 学习平台

:: 在当前终端窗口运行 npm dev（保持窗口不关闭）
cd /d d:\text1\questmind

:: 后台等待端口就绪后打开浏览器（用独立进程）
start /min cmd /c "d:\text1\questmind\open-browser.bat"

:: 当前窗口运行 npm dev（/k 让窗口保持打开）
npm run dev
