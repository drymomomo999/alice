# QuestMind 桌面 App 接入指南（Tauri v2 for Windows）

## 前置条件：安装 Rust 工具链

Tauri 需要 Rust，只需装一次，之后永久可用。

### 方法一：一键安装（推荐）
在 PowerShell（管理员）中运行：
```powershell
winget install Rustlang.Rustup
```
安装完后**重启 PowerShell**，然后运行：
```powershell
rustup default stable
```

### 方法二：官网下载
访问 https://rustup.rs/ 下载 `rustup-init.exe` 并运行，全程默认回车即可。

### 验证安装
```bash
rustc --version
cargo --version
```
看到版本号就成功了。

---

## 开发模式（热重载，调试用）

```bash
cd d:\text1\questmind
npm run tauri:dev
```
开发模式请使用上面的命令。`start-app.bat` 只启动已经构建好的 release 程序，不会启动开发服务器。

效果：弹出一个原生 Windows 窗口，内容和网页版完全一样，代码改动自动热更新。

---

## 打包成 .exe 安装包（发布用）

```bash
cd d:\text1\questmind
npm run tauri:build
```
或双击 `build-app.bat`。

构建完成后安装包在：
```
src-tauri\target\release\bundle\nsis\QuestMind_0.1.0_x64-setup.exe
```
双击即可安装到 Windows，会在桌面生成快捷方式。

---

## 日常工作流（关键：网页和 App 自动同步）

**你只需要正常改网页代码**，App 端完全不用额外操作：
- `dev` 模式：改完代码 → Vite 热更新 → App 窗口自动刷新
- 发布新版本：改完代码 → `npm run tauri:build` → 生成新安装包

**不需要维护两套代码！**

---

## 目录结构说明

```
questmind/
├── src/                    # 所有业务代码（网页 & App 共用）
├── src-tauri/              # Tauri 配置（只需关注 tauri.conf.json）
│   ├── tauri.conf.json     # 窗口大小、标题、CSP、图标配置
│   ├── icons/              # App 图标（可替换为你的设计图）
│   ├── src/main.rs         # Rust 入口（不需要改）
│   └── Cargo.toml          # Rust 依赖（不需要改）
├── start-app.bat           # 双击启动开发模式
├── build-app.bat           # 双击打包安装包
└── ...
```

---

## 常见问题

**Q：第一次 `tauri dev` 很慢？**

A：正常，Rust 第一次编译需要 5-10 分钟，后续增量编译很快。

**Q：图标是粉色方块怎么回事？**

A：当前是占位图标。替换方式：把你的图标 PNG（至少 1024x1024）放到 `src-tauri/icons/` 下，然后运行 `npm run tauri icon` 自动生成所有尺寸。

**Q：CSP 报错导致某些功能不可用？**

A：修改 `src-tauri/tauri.conf.json` 里的 `app.security.csp` 字段，参照网页版 nginx 的配置。

**Q：网页版和 App 如何区分？**

A：代码里用 `window.__TAURI__` 判断：
```ts
const isTauri = typeof window !== 'undefined' && !!window.__TAURI__;
```
