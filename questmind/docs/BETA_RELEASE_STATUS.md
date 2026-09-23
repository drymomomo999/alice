# QuestMind 0.1.0 内测发布状态

检查日期：2026-09-09

## 已通过

- 前端 TypeScript 与 Vite 生产构建。
- Rust `cargo check`。
- 课程引擎、目标领域、Alice 关系连续性、Alice 日记共 47 项自动验收。
- 生产资源常见服务端密钥扫描。
- 正式依赖审计：0 个已知漏洞（使用 npm 官方 registry）。
- Windows NSIS 安装包生成，文件版本与产品版本均为 0.1.0。

安装包：`src-tauri/target/release/bundle/nsis/QuestMind_0.1.0_x64-setup.exe`

SHA-256：`72B45FE53246C1B30CB2899FFA8FB0D4FC7D36078E6C2553A524B7A4DF7F610C`

## 当前阻塞完整账号内测的线上项

运行 `npm run test:beta-backend` 的实时结果：

- 缺少 `relationship_preferences`、`relationship_state` 等关系连续性表。
- 缺少 `alice_diary_entries`、`alice_share_preferences`、`alice_shared_stories`。
- `goals`、`sub_goals`、`daily_tasks` 缺少当前客户端需要的领域字段。
- `alice-share` Edge Function 未部署。
- `ai-chat`、`alice-voice`、基础表、课程快照列、计划修订与学习事件已可访问。

在 Supabase 项目中按顺序执行：

1. `supabase/add_goal_domain_fields.sql`
2. `supabase/add_alice_relationship_system.sql`
3. `supabase/add_alice_life.sql`
4. 部署 `supabase/functions/alice-share/`
5. 再运行 `npm run test:beta-backend`，必须全部通过。

上述操作会修改线上数据库与函数，执行前需要项目负责人明确确认并提供已登录的 Supabase CLI 或 Dashboard 操作环境。

本项目现在内置项目级 Supabase CLI：

```bash
npm run supabase -- --version
npm run supabase:login
npm run supabase -- link --project-ref njecytkavzhrmlgzwwkm
npm run supabase:db:push
npm run supabase:functions:deploy:alice-share
npm run test:beta-backend
```

`supabase/config.toml` 可提交；`supabase/.temp/` 和 `.supabase-cli-home/` 是本机状态，不要提交。

## 仍需人工验收

当前 Windows 实机控制权限不可用，以下不能以自动构建代替：

- 安装、覆盖安装、卸载。
- 首次启动是否清楚看到桌宠提示，单击是否打开主界面。
- 桌宠拖动、摸头、语音按钮和系统托盘菜单。
- 体验模式的目标创建、资料上传、对话和重启持久化。
- 部署线上迁移后的真实账号注册、重新登录与跨设备同步。

人工验收全部通过前，发布范围应保持为少量、可直接联系的体验模式测试者。
