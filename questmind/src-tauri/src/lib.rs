// Release/打包后作为 Windows GUI 应用运行：不弹 cmd 控制台窗口，不显示 stdout/stderr。
// Debug 模式 (tauri dev) 保留终端，方便排查。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    env, fs, io::ErrorKind, path::PathBuf, process::Command,
};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Manager,
};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn find_codex_binary() -> PathBuf {
    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        let bin_root = PathBuf::from(local_app_data)
            .join("OpenAI")
            .join("Codex")
            .join("bin");
        if let Ok(versions) = fs::read_dir(bin_root) {
            for version in versions.flatten() {
                let candidate = version.path().join("codex.exe");
                if candidate.is_file() {
                    return candidate;
                }
            }
        }
    }
    PathBuf::from("codex")
}

/// 把 spawn 阶段的 ENOENT 转成给前端可读的友好错误，
/// 避免桌宠只显示"无法创建 Codex 任务：program not found"。
fn map_codex_spawn_error(error: std::io::Error, hint: &str) -> String {
    if error.kind() == ErrorKind::NotFound {
        return format!(
            "codex CLI 未安装或不在 PATH 中。请在终端执行 `npm install -g @openai/codex` 后重试（{hint}）"
        );
    }
    format!("无法创建 Codex 任务：{error}")
}

#[tauri::command]
fn launch_codex_task(prompt: String) -> Result<(), String> {
    let prompt = prompt.trim();
    if prompt.is_empty() {
        return Err("任务内容不能为空".into());
    }
    if prompt.chars().count() > 10_000 {
        return Err("任务内容过长".into());
    }

    let codex = find_codex_binary();
    let workspace = env::var("QUESTMIND_CODEX_WORKSPACE")
        .map(PathBuf::from)
        .or_else(|_| env::current_dir())
        .map_err(|error| format!("无法确定 Codex 工作目录：{error}"))?;

    // 使用独立参数传递语音文本，不经过 shell，避免任务内容被解释为命令。
    let mut task = Command::new(&codex);
    task.args([
        "exec",
        "--skip-git-repo-check",
        "--thread-source",
        "questmind-voice",
        "-C",
    ])
    .arg(&workspace)
    .arg(prompt);
    #[cfg(target_os = "windows")]
    task.creation_flags(CREATE_NO_WINDOW);
    if let Err(error) = task.spawn() {
        return Err(map_codex_spawn_error(error, "用于执行单次任务"));
    }

    // 打开桌面端对应工作区；上面的 exec 会创建可持久化、可在侧栏看到的新会话。
    let app_result = Command::new(&codex).arg("app").arg(&workspace).spawn();
    if let Err(error) = app_result {
        // exec 已成功创建任务，app 启动失败时不要整体失败
        return Err(map_codex_spawn_error(error, "任务已创建，但无法打开 Codex 桌面端"));
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![launch_codex_task])
        .setup(|app| {
            #[cfg(desktop)]
            {
                if let (Some(window), Some(monitor)) = (
                    app.get_webview_window("desktop-pet"),
                    app.primary_monitor()?,
                ) {
                    let monitor_position = monitor.position();
                    let monitor_size = monitor.size();
                    let window_size = window.outer_size()?;
                    let x = monitor_position.x
                        + monitor_size.width.saturating_sub(window_size.width) as i32
                        - 24;
                    let y = monitor_position.y
                        + monitor_size.height.saturating_sub(window_size.height) as i32
                        - 56;
                    window.set_position(tauri::PhysicalPosition::new(x, y))?;
                }

                let show_pet = MenuItemBuilder::with_id("show_pet", "显示桌宠").build(app)?;
                let open_app = MenuItemBuilder::with_id("open_app", "打开 QuestMind").build(app)?;
                let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
                let menu = MenuBuilder::new(app)
                    .items(&[&show_pet, &open_app, &quit])
                    .build()?;

                let mut tray = TrayIconBuilder::new()
                    .menu(&menu)
                    .tooltip("QuestMind · 艾莉丝")
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show_pet" => {
                            if let Some(window) = app.get_webview_window("desktop-pet") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "open_app" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    });

                if let Some(icon) = app.default_window_icon() {
                    tray = tray.icon(icon.clone());
                }
                tray.build(app)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running QuestMind application");
}
