// Release/打包后作为 Windows GUI 应用运行：不弹 cmd 控制台窗口，不显示 stdout/stderr。
// Debug 模式 (tauri dev) 保留终端，方便排查。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use std::{
    env, fs,
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
    process::Command,
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
    let mut codex_app = Command::new(&codex);
    codex_app.arg("app").arg(&workspace);
    #[cfg(target_os = "windows")]
    codex_app.creation_flags(CREATE_NO_WINDOW);
    let app_result = codex_app.spawn();
    if let Err(error) = app_result {
        // exec 已成功创建任务，app 启动失败时不要整体失败
        return Err(map_codex_spawn_error(
            error,
            "任务已创建，但无法打开 Codex 桌面端",
        ));
    }

    Ok(())
}

fn validate_preview_id(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 96
        || !value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err("课件预览标识无效".into());
    }
    Ok(())
}

fn courseware_preview_root(app: &tauri::AppHandle, preview_id: &str) -> Result<PathBuf, String> {
    validate_preview_id(preview_id)?;
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("courseware-slide-previews").join(preview_id))
        .map_err(|error| format!("无法确定课件预览目录：{error}"))
}

#[tauri::command]
fn begin_courseware_preview(app: tauri::AppHandle, preview_id: String) -> Result<(), String> {
    let root = courseware_preview_root(&app, &preview_id)?;
    if root.exists() {
        fs::remove_dir_all(&root).map_err(|error| format!("无法更新旧课件预览：{error}"))?;
    }
    fs::create_dir_all(&root).map_err(|error| format!("无法创建课件预览目录：{error}"))?;
    fs::File::create(root.join("source.pptx"))
        .map(|_| ())
        .map_err(|error| format!("无法准备课件预览文件：{error}"))
}

#[tauri::command]
fn append_courseware_preview_chunk(
    app: tauri::AppHandle,
    preview_id: String,
    chunk_base64: String,
) -> Result<(), String> {
    if chunk_base64.len() > 800_000 {
        return Err("单个课件数据块过大".into());
    }
    let root = courseware_preview_root(&app, &preview_id)?;
    let bytes = BASE64
        .decode(chunk_base64)
        .map_err(|_| "课件预览数据损坏".to_string())?;
    let mut file = fs::OpenOptions::new()
        .append(true)
        .open(root.join("source.pptx"))
        .map_err(|error| format!("无法写入课件预览文件：{error}"))?;
    file.write_all(&bytes)
        .map_err(|error| format!("无法写入课件预览数据：{error}"))
}

#[tauri::command]
fn delete_courseware_preview(app: tauri::AppHandle, preview_id: String) -> Result<(), String> {
    let root = courseware_preview_root(&app, &preview_id)?;
    if root.exists() {
        fs::remove_dir_all(root).map_err(|error| format!("无法删除本地课件画面：{error}"))?;
    }
    Ok(())
}

fn page_number(path: &Path) -> u32 {
    path.file_stem()
        .and_then(|value| value.to_str())
        .map(|value| {
            value
                .chars()
                .filter(|ch| ch.is_ascii_digit())
                .collect::<String>()
        })
        .and_then(|value| value.parse().ok())
        .unwrap_or(u32::MAX)
}

#[tauri::command]
fn finish_courseware_preview(app: tauri::AppHandle, preview_id: String) -> Result<u32, String> {
    let root = courseware_preview_root(&app, &preview_id)?;
    let source = root.join("source.pptx");
    let exported = root.join("powerpoint-export");
    fs::create_dir_all(&exported).map_err(|error| format!("无法创建幻灯片图片目录：{error}"))?;

    let script = r#"$ErrorActionPreference='Stop'
$source=$env:QUESTMIND_PPTX_SOURCE
$destination=$env:QUESTMIND_PPTX_DESTINATION
$ppt=New-Object -ComObject PowerPoint.Application
$quitWhenDone=($ppt.Presentations.Count -eq 0)
$presentation=$null
try {
  $presentation=$ppt.Presentations.Open($source,$true,$true,$false)
  $presentation.Export($destination,'PNG')
} finally {
  if ($null -ne $presentation) { $presentation.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) }
  if ($quitWhenDone -and $ppt.Presentations.Count -eq 0) { $ppt.Quit() }
  [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($ppt)
}"#;
    let mut command = Command::new("powershell.exe");
    command
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            script,
        ])
        .env("QUESTMIND_PPTX_SOURCE", &source)
        .env("QUESTMIND_PPTX_DESTINATION", &exported);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    let output = command
        .output()
        .map_err(|error| format!("无法启动 PowerPoint 页面转换：{error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() {
            "PowerPoint 无法渲染这份课件".into()
        } else {
            format!("PowerPoint 渲染失败：{detail}")
        });
    }

    let mut images = fs::read_dir(&exported)
        .map_err(|error| format!("无法读取幻灯片图片：{error}"))?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.eq_ignore_ascii_case("png"))
        })
        .collect::<Vec<_>>();
    images.sort_by_key(|path| page_number(path));
    if images.is_empty() {
        return Err("PowerPoint 没有导出任何幻灯片画面".into());
    }
    for (index, source_image) in images.iter().enumerate() {
        fs::copy(
            source_image,
            root.join(format!("page-{:04}.png", index + 1)),
        )
        .map_err(|error| format!("无法保存第 {} 页画面：{error}", index + 1))?;
    }
    let _ = fs::remove_file(source);
    let _ = fs::remove_dir_all(exported);
    Ok(images.len() as u32)
}

#[tauri::command]
fn get_courseware_preview_page(
    app: tauri::AppHandle,
    preview_id: String,
    page_number: u32,
) -> Result<String, String> {
    if page_number == 0 || page_number > 5000 {
        return Err("幻灯片页码无效".into());
    }
    let root = courseware_preview_root(&app, &preview_id)?;
    let bytes = fs::read(root.join(format!("page-{page_number:04}.png")))
        .map_err(|_| "本机没有保存这一页的原始画面，请重新上传 PPTX".to_string())?;
    Ok(format!("data:image/png;base64,{}", BASE64.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::{page_number, validate_preview_id};
    use std::path::Path;

    #[test]
    fn preview_ids_stay_inside_the_app_cache() {
        assert!(validate_preview_id("courseware-ab12_cd-34").is_ok());
        assert!(validate_preview_id("../outside").is_err());
        assert!(validate_preview_id("courseware/other").is_err());
    }

    #[test]
    fn localized_powerpoint_filenames_sort_by_slide_number() {
        assert_eq!(page_number(Path::new("幻灯片12.PNG")), 12);
        assert_eq!(page_number(Path::new("Slide3.png")), 3);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            launch_codex_task,
            begin_courseware_preview,
            append_courseware_preview_chunk,
            finish_courseware_preview,
            get_courseware_preview_page,
            delete_courseware_preview,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                // 桌宠定位和托盘属于增强能力。WebView/桌面会话偶发取不到尺寸或
                // 消息时不能让整个 App 在 setup 阶段退出。
                if let (Some(window), Ok(Some(monitor))) =
                    (app.get_webview_window("desktop-pet"), app.primary_monitor())
                {
                    if let Ok(window_size) = window.outer_size() {
                        let monitor_position = monitor.position();
                        let monitor_size = monitor.size();
                        let x = monitor_position.x
                            + monitor_size.width.saturating_sub(window_size.width) as i32
                            - 24;
                        let y = monitor_position.y
                            + monitor_size.height.saturating_sub(window_size.height) as i32
                            - 56;
                        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
                    }
                }

                let items = (
                    MenuItemBuilder::with_id("show_pet", "显示桌宠").build(app),
                    MenuItemBuilder::with_id("open_app", "打开 QuestMind").build(app),
                    MenuItemBuilder::with_id("quit", "退出").build(app),
                );
                if let (Ok(show_pet), Ok(open_app), Ok(quit)) = items {
                    if let Ok(menu) = MenuBuilder::new(app)
                        .items(&[&show_pet, &open_app, &quit])
                        .build()
                    {
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
                        let _ = tray.build(app);
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running QuestMind application");
}
