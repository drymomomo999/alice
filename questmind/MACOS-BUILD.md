# QuestMind macOS 打包指南

## ⚠️ 重要前提

**macOS .dmg 必须在 macOS 系统上构建**（苹果开发者限制）。Windows 上无法直接产出 .dmg。

本项目代码已 100% 兼容 macOS，只需要在 Mac 上一行命令即可打包。

---

## 在 Mac 上打包（推荐配置：macOS 13+, Apple Silicon）

### 1. 准备 Mac 环境（一次性）

打开 **终端（Terminal）**：

```bash
# 1. 安装 Xcode 命令行工具（提供编译器 + git）
xcode-select --install

# 2. 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup default stable

# 3. 安装 Node.js 18+ (如果还没装)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
```

### 2. 拉取代码

把 `d:\text1\questmind` 整个目录同步到 Mac 的某个目录，例如 `~/Projects/questmind`：

```bash
cd ~/Projects
# 方式 A：用 git
git clone <你的仓库地址> questmind
# 方式 B：直接拷贝整个文件夹（scp / iCloud / U盘均可）
```

### 3. 安装依赖 + 打包

```bash
cd ~/Projects/questmind
npm install
```

**只输出 Apple Silicon (.dmg) ：**
```bash
npm run tauri:build
```

**输出 Intel 版（兼容老 Mac）:**
```bash
npm run tauri:build -- --target x86_64-apple-darwin
```

**两个架构同时出（universal binary，需先加 target）:**
```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

### 4. 找到 .dmg 文件

```
src-tauri/target/release/bundle/macos/QuestMind.app      ← .app 包
src-tauri/target/release/bundle/dmg/QuestMind_0.1.0_aarch64.dmg  ← .dmg 安装器
```

---

## 用户安装（用户视角）

把 `.dmg` 文件发给 Mac 用户，他们：
1. 双击 `.dmg` 挂载
2. 把 `QuestMind` 拖入 `Applications` 文件夹
3. 在启动台或应用程序文件夹打开
4. **首次打开可能提示"无法验证开发者"** → 系统设置 → 隐私与安全性 → 仍要打开

---

## 开发者签名（可选，用于正式发布）

未签名的 App 也能在用户机器上跑（会有上面那个安全提示），但要发布到 App Store 或避免提示就需要 Apple 开发者证书。

### 自签名（个人测试用）
```bash
# 打开钥匙串访问，导入你的 Apple Developer 证书
# 然后在 tauri.conf.json 的 macOS.signingIdentity 填入证书名
```

### 完整签名（团队/上架）
需购买 Apple Developer Program（$99/年），然后用 codesign + notarytool 签名公证。详见 [Tauri macOS 签名文档](https://v2.tauri.app/distribute/sign/macos/)。

---

## 自动更新（可选）

`tauri.conf.json` 已默认 `createUpdaterArtifacts: false`（未开）。开启后会生成 `.app.tar.gz` 更新包，配合 `tauri-plugin-updater` 即可让 App 启动时自动检查更新。

```bash
npm install @tauri-apps/plugin-updater
```

---

## 跨平台开发工作流

| 平台 | 开发 | 打包 |
|------|------|------|
| **Windows** | `npm run tauri:dev` | `npm run tauri:build` → NSIS .exe |
| **macOS** | `npm run tauri:dev` | `npm run tauri:build` → .dmg |
| **Linux** | `npm run tauri:dev` | `npm run tauri:build` → .AppImage/.deb |

代码 100% 共享，开发体验完全一致。

---

## 故障排查

**"code signing blocked" 错误**：
未签名 + macOS Gatekeeper 拦截。开发阶段可绕过：
```bash
xattr -dr com.apple.quarantine ~/Applications/QuestMind.app
```

**"libwebview2 not found"**：
不会发生在 macOS 上（macOS 自带 WebKit）。

**窗口不显示**：
检查 `tauri.conf.json` 的 `windows[0].visible` 是否被设为 false（默认 true）。
