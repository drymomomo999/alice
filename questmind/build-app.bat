@echo off
title QuestMind - 构建安装包
echo ====================================
echo   QuestMind 正式安装包构建中...
echo ====================================
echo.
echo 构建完成后安装包在: src-tauri\target\release\bundle\
echo.
npm run tauri:build
echo.
echo ====================================
echo   构建完成！
echo   安装包路径: src-tauri\target\release\bundle\nsis\
echo ====================================
pause
