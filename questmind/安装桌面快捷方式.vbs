' ============================================
' QuestMind 桌面快捷方式安装脚本
' 双击运行 → 在桌面创建 "QuestMind.lnk"
' ============================================

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

' 项目目录
projectDir = "d:\text1\questmind"
appExe = projectDir & "\src-tauri\target\release\questmind.exe"

If Not FSO.FileExists(appExe) Then
    MsgBox "找不到正式程序，请先运行 build-app.bat：" & vbCrLf & appExe, vbCritical, "QuestMind"
    WScript.Quit
End If

' 桌面路径
desktop = WshShell.SpecialFolders("Desktop")
shortcutPath = desktop & "\QuestMind.lnk"

' 快捷方式直接指向 Windows GUI 程序，不经过 bat/cmd/npm 开发链路。
Set shortcut = WshShell.CreateShortcut(shortcutPath)
shortcut.TargetPath = appExe
shortcut.WorkingDirectory = projectDir
shortcut.WindowStyle = 1
shortcut.Description = "QuestMind - AI 陪伴式学习平台"
shortcut.IconLocation = projectDir & "\src-tauri\icons\icon.ico"
shortcut.Save

' 提示成功
MsgBox "桌面快捷方式已创建！" & vbCrLf & vbCrLf & _
       "双击桌面 ""QuestMind"" 图标即可启动 App。" & vbCrLf & vbCrLf & _
       "图标位置：" & shortcutPath, vbInformation, "QuestMind"
