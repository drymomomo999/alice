# QuestMind 后端配置完整指南

> 本指南涵盖：Supabase 数据库建表、RLS 权限配置、DeepSeek AI 接入三部分。

---

## 一、Supabase 数据库配置

### 1.1 项目信息

本项目已配置好 Supabase 项目：

| 配置项 | 值 |
|--------|-----|
| Project URL | `https://njecytkavzhrmlgzwwkm.supabase.co` |
| Anon Key | 见 `.env` 文件 |

### 1.2 初始化数据库表

1. 打开 [Supabase Dashboard](https://supabase.com/dashboard)
2. 进入你的项目 → 点击左侧 **SQL Editor**
3. 点击 **New Query**
4. 复制 `supabase/schema.sql` 的全部内容并粘贴
5. 点击 **Run** 执行

> ✅ 该脚本会自动创建所有表、索引、触发器和 RLS 策略，重复执行安全。

### 1.3 验证表是否创建成功

在 SQL Editor 执行：

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

应该看到以下表：
- `users`
- `goals`
- `sub_goals`
- `ai_messages`
- `quests`
- `leaderboard`
- `room_items`
- `user_rooms`
- `user_avatar_items`
- `coin_transactions`
- `focus_sessions`
- `daily_tasks`

### 1.4 RLS 策略说明

数据库使用行级安全（RLS），核心规则：
- 用户只能读写自己的数据（通过 `auth.uid()` 验证）
- `room_items` 为公开读取（无 RLS）
- `leaderboard` 允许公开读取，但只能写自己的条目

---

## 二、配置环境变量

编辑项目根目录的 `.env` 文件：

```bash
# Supabase（已填写，无需修改）
VITE_SUPABASE_URL=https://njecytkavzhrmlgzwwkm.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# DeepSeek AI（按下方说明填写）
VITE_DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 三、DeepSeek AI 配置

### 方案 A：生产推荐 — Supabase Edge Function（Key 不暴露前端）

**步骤 1：安装 Supabase CLI**

```bash
npm install -g supabase
supabase login
```

**步骤 2：链接到项目**

```bash
cd questmind
supabase link --project-ref njecytkavzhrmlgzwwkm
```

**步骤 3：配置 DeepSeek API Key（服务端 Secret）**

前往 [DeepSeek Platform](https://platform.deepseek.com/) 注册并获取 API Key，然后：

```bash
supabase secrets set DEEPSEEK_API_KEY=sk-你的真实key
```

**步骤 4：部署 Edge Function**

```bash
supabase functions deploy ai-chat
```

**步骤 5：前端无需配置任何 AI Key**

`.env` 中的 `VITE_DEEPSEEK_API_KEY` 留空或填占位符即可。

---

### 方案 B：本地开发 — 直连 DeepSeek（快速上手）

1. 前往 [DeepSeek Platform](https://platform.deepseek.com/) 获取 API Key
2. 在 `.env` 中填写：

```bash
VITE_DEEPSEEK_API_KEY=sk-你的真实key
```

> ⚠️ 注意：此方式 API Key 会暴露在浏览器 Network 请求中，**仅建议本地开发使用**。

---

### AI 服务调用优先级

代码会自动按以下顺序尝试：

```
1. Supabase Edge Function (ai-chat) → 生产安全
2. 直连 DeepSeek API              → 开发备用
3. Mock 响应                       → 无 Key 时兜底
```

---

## 四、启动开发服务器

```bash
cd questmind
npm install
npm run dev
```

---

## 五、艾莉丝生成式定制声线

小屋语音通过 MiniMax「音色设计 + speech-2.8-hd」生成。API Key 仅保存在
Supabase Edge Function 的 Secret 中，不要写入 `.env` 或前端代码。

**步骤 1：获取 MiniMax API Key**

前往 MiniMax 开放平台的「接口密钥」页面创建按量付费 API Key。

**步骤 2：配置服务端 Secret**

```bash
supabase secrets set MINIMAX_API_KEY=你的真实Key
```

如果已经在 MiniMax 控制台生成并选定了固定音色，也可以额外指定：

```bash
supabase secrets set ALICE_VOICE_ID=你的voice_id
```

不指定 `ALICE_VOICE_ID` 时，首次朗读会根据项目内的艾莉丝角色声线描述自动生成。

**步骤 3：部署声线函数**

```bash
supabase functions deploy alice-voice
```

部署后，小屋会优先使用生成式定制音色；服务未配置或暂时不可用时，才会自动降级到系统中文语音。右上角的滑杆按钮可调整声线描述、表现风格、语速和音调，并重新生成试听。

访问 `http://localhost:5173`

---

## 五、常见问题排查

### Q: 注册/登录后数据没有保存

1. 确认 Supabase URL 和 Anon Key 正确
2. 在 Supabase Dashboard → Authentication → Users 检查用户是否已创建
3. 打开浏览器控制台查看报错信息

### Q: RLS 策略导致数据访问被拒绝

症状：控制台出现 `42501` 权限错误

解决：在 SQL Editor 运行 `supabase/fix_database.sql` 修复权限。

### Q: AI 对话不返回真实 AI 内容（总是显示固定回复）

- 方案 A 用户：确认 Edge Function 已部署，执行 `supabase functions list` 检查
- 方案 B 用户：确认 `.env` 中的 `VITE_DEEPSEEK_API_KEY` 是真实 Key（非占位符）
- 检查 DeepSeek 账户是否有余额

### Q: 如何查看数据库中的数据

在 Supabase Dashboard → Table Editor 中直接浏览各表数据。

---

## 六、数据库表说明

| 表名 | 说明 |
|------|------|
| `users` | 用户信息、等级、金币、连续天数 |
| `goals` | 学习目标 |
| `sub_goals` | 目标的子任务 |
| `daily_tasks` | 每日任务/学习计划 |
| `ai_messages` | AI 对话历史记录 |
| `quests` | 每日/每周任务 |
| `leaderboard` | 排行榜 |
| `room_items` | 虚拟小屋物品商店 |
| `user_rooms` | 用户的小屋布置 |
| `coin_transactions` | 金币收支记录 |
| `focus_sessions` | 专注学习记录 |
