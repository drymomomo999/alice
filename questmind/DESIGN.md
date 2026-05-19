# QuestMind — 设计文档

> 文档版本：v1.0 | 更新日期：2026-05-11

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈](#2-技术栈)
3. [架构总览](#3-架构总览)
4. [目录结构](#4-目录结构)
5. [页面功能](#5-页面功能)
6. [组件设计](#6-组件设计)
7. [状态管理](#7-状态管理)
8. [服务层设计](#8-服务层设计)
9. [数据模型](#9-数据模型)
10. [路由设计](#10-路由设计)
11. [AI 系统设计](#11-ai-系统设计)
12. [主题与视觉系统](#12-主题与视觉系统)
13. [数据库设计（Supabase）](#13-数据库设计supabase)
14. [现有问题与欠缺分析](#14-现有问题与欠缺分析)

---

## 1. 项目概述

**QuestMind** 是一个 **AI 陪伴式目标学习平台**，以"克伦威尔领地"为世界观背景，融合 GAL 游戏风格的视觉呈现与结构化目标管理功能。核心理念是：让用户在 AI 角色艾莉丝的陪伴下，将宏大的学习目标拆解为可执行的每日任务，通过金币奖励、成就解锁和测验考核形成正向激励循环。

### 核心功能矩阵

| 功能模块 | 当前状态 |
|---------|---------|
| 用户认证（注册/登录/Onboarding） | ✅ 已完成 |
| 目标管理（CRUD + 子目标 + 每日任务） | ✅ 已完成 |
| AI 智能创建目标计划 | ✅ 已完成 |
| AI 学习指南（任务级别） | ✅ 已完成 |
| AI 角色聊天（艾莉丝） | ✅ 已完成 |
| 每日任务计时器 | ✅ 已完成 |
| 子目标考核验证（AI 出题） | ✅ 已完成 |
| 金币/钻石经济系统 | ✅ 基础已完成 |
| 目标附件上传（PDF/DOCX/图片） | ✅ 已完成 |
| GAL 风格沉浸式对话房间 | ✅ 已完成 |
| 个人中心（资料 + 头像） | ✅ 已完成 |
| 成就系统 | ⚠️ DB 层完成，UI 未集成 |
| 每日任务/Quest 系统 | ⚠️ DB 层完成，UI 未集成 |
| 商店/小屋装饰 | ⚠️ DB 层完成，UI 已放弃 |
| 专注记录统计 | ⚠️ DB 层完成，UI 未集成 |
| 排行榜 | ❌ 仅建表，未实现 |

---

## 2. 技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | ^19.2.4 | UI 框架 |
| TypeScript | ~6.0.2 | 类型安全 |
| Vite | ^8.0.4 | 构建工具 + Dev 代理 |
| Zustand | ^5.0.12 | 客户端状态管理（含 persist 中间件） |
| React Router DOM | ^7.14.1 | 客户端路由 |
| Framer Motion | ^12.38.0 | 动画系统 |
| Tailwind CSS | ^3.4.19 | 原子化样式（Sakura 主题定制） |
| Radix UI | 各组件独立版本 | 无障碍基础组件库 |
| shadcn/ui 模式 | — | 组件封装风格 |
| lucide-react | ^1.8.0 | 图标库 |

### 后端（BaaS）

| 技术 | 版本 | 用途 |
|------|------|------|
| Supabase | ^2.103.0 | Auth + PostgreSQL + Storage + Edge Functions |
| PostgreSQL | — | 主数据库（13 张业务表） |
| Supabase Storage | — | 用户头像 + 目标附件存储 |
| Supabase Edge Functions | — | AI API 代理（隐藏 Key） |

### AI

| 技术 | 用途 |
|------|------|
| DeepSeek Chat (`deepseek-chat`) | 核心 LLM，目标生成 / 对话 / 测验 / 学习建议 |
| DeepSeek API 三层降级 | 直连 → Edge Function → Mock 兜底 |

### 文件处理

| 库 | 用途 |
|---|------|
| pdfjs-dist | 客户端 PDF 文字提取 |
| mammoth | 客户端 DOCX 文字提取 |

---

## 3. 架构总览

```
┌──────────────────────────────────────────────────────────────┐
│  浏览器端 (React 19 + Vite)                                  │
│                                                              │
│  Pages ──→ Components ──→ Hooks                             │
│    │              │                                          │
│    └──→ Stores (Zustand persist) ──→ syncService             │
│                                          │                   │
│              ai.service (DeepSeek)       │                   │
│                    │                     │                   │
└────────────────────┼─────────────────────┼───────────────────┘
                     │                     │
           ┌─────────┴────────┐   ┌────────┴─────────┐
           │  DeepSeek API    │   │  Supabase         │
           │  (直连/代理)      │   │  - Auth           │
           └──────────────────┘   │  - PostgreSQL DB  │
                                  │  - Storage        │
                                  │  - Edge Functions │
                                  └──────────────────┘
```

### 数据流原则

- **乐观更新**：所有写操作先更新 Zustand Store（即时 UI 响应），再异步同步数据库
- **Demo 模式隔离**：`isDemo === true` 时跳过所有数据库写操作，纯本地运行
- **防闪烁保护**：`authChecked` 标志位确保 Supabase 会话验证完成前路由守卫不执行跳转
- **离线队列**：`syncService.addToSyncQueue()` 支持离线操作排队，网络恢复后批量处理
- **自动同步**：每 5 分钟触发 `fullSync()` 保证本地与数据库一致

---

## 4. 目录结构

```
src/
├── App.tsx                          # 根组件，路由 + 全局认证监听
├── main.tsx                         # 应用入口
├── index.css / App.css              # 全局样式（Sakura 设计系统）
│
├── assets/                          # 静态资源
│   ├── alice/                       # 艾莉丝表情图（8 种）
│   │   └── index.ts                 # 表情枚举 + 情绪推断函数
│   ├── alice-character.png          # 艾莉丝默认立绘
│   └── logo.png / hero.png / rem.png
│
├── pages/                           # 页面
│   ├── Welcome.tsx                  # 欢迎落地页
│   ├── Login/LoginPage.tsx          # 登录/注册一体化页
│   ├── Onboarding/index.tsx         # 5 步新用户引导
│   ├── Home/index.tsx               # 首页（大厅导航）
│   ├── Goals/
│   │   ├── index.tsx                # 目标管理主页（三栏布局协调器）
│   │   └── components/              # Goals 专属子组件（7 个）
│   ├── Room/index.tsx               # 沉浸式 GAL 对话房间
│   └── Profile/index.tsx            # 个人中心（3 Tab）
│
├── components/                      # 公共组件
│   ├── layout/AppLayout.tsx         # 主布局（顶部导航 + 底部 Tab）
│   ├── AliceRoom/                   # Room 专用组件（背景/立绘/对话框/输入）
│   └── ui/                          # 基础 UI（shadcn 风格）
│
├── store/index.ts                   # 全部 Zustand Store（4 个）
│
├── services/
│   ├── ai.service.ts                # DeepSeek AI 调用封装
│   ├── alice.service.ts             # 艾莉丝角色配置 + System Prompt
│   ├── rem.service.ts               # 蕾姆角色配置 + System Prompt
│   ├── auth.service.ts              # Supabase Auth 封装
│   ├── supabase.ts                  # Supabase 客户端 + 全部 DB CRUD
│   └── syncService.ts               # Store ↔ DB 同步中间层
│
├── types/index.ts                   # 全部 TypeScript 类型定义
├── hooks/useTypewriter.ts           # 打字机动效 Hook
└── lib/
    ├── utils.ts                     # 通用工具函数
    └── fileExtractor.ts             # 客户端文件文字提取
```

---

## 5. 页面功能

### 5.1 WelcomePage（`/welcome`）

产品落地页，供未登录用户访问。

- 展示品牌 Logo 与 4 个产品特性卡片（任务分解 / AI 伴侣 / 成就系统 / 激励引擎）
- **体验模式入口**：一键 Demo 登录，无需注册即可体验
- **正式账号入口**：跳转 `/login`
- 已登录时自动重定向至 `/`

---

### 5.2 LoginPage（`/login`）

邮箱登录 / 注册一体化页面。

- Tab 切换登录 / 注册模式
- **登录流程**：邮箱 + 密码 → `signInWithEmail` → `loadUser` → 首页
- **注册流程**：昵称 + 邮箱 + 密码 × 2 → `signUpWithEmail` → `initializeUser` → 首页
- 密码明文/密文切换、表单验证、服务端错误内联提示

---

### 5.3 OnboardingPage（`/onboarding`）

新用户首次登录后的 5 步资料完善向导。

| 步骤 | 内容 |
|------|------|
| Step 1 | 设置昵称（2-20 字符） |
| Step 2 | 选择系统 emoji 头像（12 个） |
| Step 3 | 学习时段偏好（早起鸟 / 夜猫子 / 灵活） |
| Step 4 | 兴趣领域多选（学习/健身/阅读/考试/职场/语言/技能/其他） |
| Step 5 | 确认摘要，点击完成（奖励 100 金币） |

---

### 5.4 HomePage（`/`）

视觉上的"克伦威尔领地大厅"，实际为主导航中枢。

- 根据当前时段动态问候（深夜/早晨/上午/下午/傍晚/晚上）
- 艾莉丝立绘根据时段切换表情（睡意/思考/开心/骄傲/害羞）
- 三个主菜单卡片：目标 / 小屋 / 个人（Framer Motion 入场动画）
- 进行中目标预览（最多 2 条，含倒计时 + 进度条）
- 无目标时显示"创建第一个目标"引导

---

### 5.5 GoalsPage（`/goals`）

目标管理核心页面，三栏布局。

**左栏 — GoalListPanel**
- 目标卡片列表（状态标签 + 进度条 + 截止日期倒计时）
- 搜索过滤
- 新建按钮（手动创建 / AI 智能创建）

**中栏 — GoalDetailPanel**
- 子目标列表（含考核验证按钮，答题 60% 以上才能标记完成）
- 每日任务列表（含实时计时器：启动/暂停/完成，完成奖励 +15 金币）
- 今日学习指南卡片（AI 生成摘要）
- 每个任务的 ✨ AI 指引展开按钮（任务级别学习建议）
- 附件列表（支持预览 URL）
- 目标删除

**右栏 — AliceChatPanel**
- 与艾莉丝基于当前目标上下文的交互对话
- 目标切换时自动注入新上下文
- ✨ 快捷提问按钮

**业务逻辑（Goals/index.tsx 协调）**
- 每秒计时器 tick（运行中任务超时自动完成）
- 每日重置检测（`localStorage` 日期对比）
- AI 测验（`generateQuizQuestions` 出 3 道题，60% 通过率）
- AI 智能创建三步向导（SmartCreateDialog）

---

### 5.6 RoomPage（`/room`）

沉浸式 GAL 游戏风格全屏对话房间。

- 使用 `createPortal` 挂载到 `document.body`（z-index: 60 全屏覆盖）
- 场景背景 + 艾莉丝立绘（居中）
- AI 回复完成后自动推断表情（8 种），5 秒后恢复默认
- 打字机效果对话框（点击立绘可跳过打字）
- 历史消息面板（右上角展开）
- AI 上下文携带：用户昵称/等级/连续天数/当前目标列表 + 最近 11 条消息历史

---

### 5.7 ProfilePage（`/profile`）

个人中心，三 Tab 结构。

| Tab | 功能 |
|-----|------|
| 个人资料 | 头像编辑（emoji 系统头像 × 12 + 自定义图片上传）、昵称内联编辑、基本信息卡片、金币/钻石/会员展示 |
| 设置 | 重新进入 Onboarding、退出登录 |
| 数据统计 | 会员天数、金币/钻石余额 |

---

## 6. 组件设计

### 6.1 AppLayout

主布局框架，所有受保护页面的容器。

- **顶部导航栏**（固定）：Logo + 汉堡菜单图标 + 用户头像
- **左侧滑出面板**：用户信息 + 金币钻石余额 + 退出登录
- **底部 Tab 导航**（固定）：首页 / 目标 / 小屋 / 我的，激活 Tab 粉橙渐变指示条
- **Sakura 背景装饰**：飘落樱花动效

### 6.2 AliceRoom 组件系列

专为 RoomPage 服务的四件套：

| 组件 | 职责 |
|------|------|
| `RoomBackground` | 暖粉温馨场景渲染（墙壁/书架/地毯/阳光窗台） |
| `CharacterSprite` | 立绘渲染，`expression` prop 切换图片，`isSpeaking` 触发浮动动画 |
| `DialogBox` | GAL 风格对话框，`useTypewriter` 逐字打印，含角色名标签 |
| `ChatInput` | 对话输入框，Enter 发送，加载中禁用 |

### 6.3 Goals 页面子组件（7 个）

见 [5.5 GoalsPage](#55-goalspage) 中各组件说明。

### 6.4 UI 基础组件（`components/ui/`）

基于 Radix UI + tailwind-merge 封装的 shadcn/ui 风格组件库：
`Button` / `Input` / `Avatar` / `Badge` / `Card` / `Dialog` / `Progress` / `ScrollArea` / `Tabs` / `gal-decorations`

---

## 7. 状态管理

使用 Zustand 5，共 4 个 Store，全部持久化至 `localStorage`。

### 7.1 useUserStore

| 状态字段 | 说明 |
|---------|------|
| `user` | 当前用户对象（含金币/连续天数/等级等） |
| `isAuthenticated` | 是否已登录 |
| `isDemo` | 是否 Demo 模式（跳过 DB 写操作） |
| `authChecked` | Supabase 会话验证是否完成（防闪烁） |

关键 Actions：`initializeUser` / `loadUser` / `addCoins` / `incrementStreak` / `completeOnboarding` / `needsOnboarding`

### 7.2 useGoalsStore

| 状态字段 | 说明 |
|---------|------|
| `goals` | 目标列表（乐观更新） |
| `currentGoal` | 当前选中目标 |

计时器实现要点：采用 `baseElapsed + (now - lastResumedAt)` 分段累积方案，避免页面刷新丢失进度。

### 7.3 useAIChatStore

| 状态字段 | 说明 |
|---------|------|
| `messages` | 5 个角色各自独立的消息历史 |
| `activeCharacter` | 当前激活角色 |

### 7.4 useUIStore

| 状态字段 | 说明 |
|---------|------|
| `sidebarOpen` | 侧边栏状态 |
| `theme` | 主题（light/dark） |
| `activeTab` | 当前底部 Tab |

---

## 8. 服务层设计

### 8.1 ai.service.ts

**三层降级策略**：
1. 直连 DeepSeek（`VITE_DEEPSEEK_API_KEY`，Vite proxy 绕 CORS，仅开发用）
2. Supabase Edge Function `ai-chat`（生产推荐）
3. Mock 回复兜底

**核心函数**：

| 函数 | 说明 |
|------|------|
| `sendAIMessage(options)` | 多角色对话，携带最近 20 条历史 |
| `generateGoalPlan(...)` | 生成完整目标计划（子目标 + 每日任务，严格按每日可用时长约束） |
| `generateStatusQuestions(...)` | 生成 2-4 个状态了解问题 |
| `generateQuizQuestions(...)` | 生成 3 道单选考核题 |
| `askTaskAssistant(...)` | 任务级别 AI 建议（150 字） |
| `generateStudySummary(...)` | 今日学习要点摘要（150 字） |
| `buildGoalContextString(goal)` | 聚合目标描述+上下文+附件文字为 AI 上下文字符串 |

### 8.2 syncService.ts

Zustand Store 与 Supabase DB 之间的中间层，提供：
- `initUserData` — 注册/首次登录初始化
- 全部 CRUD 代理（目标/子目标/每日任务/AI 消息）
- `startAutoSync` — 每 5 分钟自动全量同步
- `addToSyncQueue` — 离线操作排队

---

## 9. 数据模型

### User

```typescript
interface User {
  id: string
  email?: string
  nickname: string
  avatar?: string
  coins: number         // 金币（日常奖励）
  gems: number          // 钻石（高级货币）
  streak: number        // 连续打卡天数
  createdAt: string
  totalGoalsCompleted?: number
  totalFocusMinutes?: number
  timePreference?: 'early' | 'night' | 'flexible'
  goalPreferences?: GoalCategory[]
  onboardingCompleted?: boolean
}
```

### Goal

```typescript
interface Goal {
  id: string; userId: string
  title: string; description: string
  status: 'active' | 'completed' | 'paused' | 'abandoned'
  priority: 'low' | 'medium' | 'high'
  startDate: string; endDate: string
  progress: number           // 0-100，由子目标完成率自动计算
  subGoals: SubGoal[]
  dailyTasks?: DailyTask[]
  currentStatus?: string     // AI 生成的用户当前状态描述
  context?: string           // 用户补充背景（供 AI 参考）
  attachments?: GoalAttachment[]
}
```

### DailyTask（含计时器）

```typescript
interface DailyTask {
  id: string; goalId: string
  title: string; description?: string
  duration?: number; frequency?: 'daily' | 'custom'
  completed: boolean; completedAt?: string
  orderIndex: number
  // 计时器字段
  startedAt?: string
  elapsedSeconds?: number
  isRunning?: boolean
  lastResumedAt?: number      // 毫秒时间戳
  baseElapsed?: number        // 历史累积（暂停前锁定）
}
```

### GoalAttachment

```typescript
interface GoalAttachment {
  id: string; name: string
  type: 'document' | 'image'
  mimeType: string; size: number
  storagePath: string; url: string
  extractedText?: string        // 文档内容（截断至 3000 字）
  imageDescription?: string     // 图片用户描述
  uploadedAt: string
}
```

---

## 10. 路由设计

```
BrowserRouter
├── /welcome           → WelcomePage（公开）
├── /login             → LoginPage（公开）
├── /onboarding        → ProtectedRoute > OnboardingPage
└── /*                 → ProtectedRoute > AppLayout
    ├── /              → HomePage
    ├── /goals         → GoalsPage
    ├── /room          → RoomPage（内部 createPortal 全屏）
    └── /profile       → ProfilePage
```

**ProtectedRoute 守卫逻辑**（按优先级）：

1. `authChecked === false` → 显示加载动画（防闪烁）
2. `isAuthenticated === false` → 跳转 `/login`
3. `needsOnboarding() === true` 且非 `/onboarding` → 跳转 `/onboarding`
4. 通过 → 渲染子组件

---

## 11. AI 系统设计

### 11.1 AI 角色体系

| ID | 名称 | 人设 |
|----|------|------|
| `alice` | 艾莉丝·冯·克伦威尔 | 贵族大小姐，网站看板娘，优雅傲娇 |
| `rem` | 蕾姆 | 《Re:Zero》女仆，忠诚温柔 |
| `xiaoSi` | 小思 | 温暖陪伴型，像懂你的朋友 |
| `coach` | 督促师 | 严格激励型，像严格教练 |
| `friend` | 学友 | 幽默竞争型，像损友 |

### 11.2 艾莉丝角色设定

- **全名**：艾莉丝·冯·克伦威尔（Alice von Cromwell）
- **身份**：克伦威尔家族大小姐 / 网站看板娘 / 站点引导员
- **代表色**：象牙白、曜石黑、暗金色、酒红色
- **形象**：Q 版金发蓝眼少女，金色几何皇冠，黑白金配色华丽礼服
- **核心信念**：秩序不是冷酷管理，而是让每个人都知道下一步该做什么
- **称呼用户**：来访者 / 领地成员

### 11.3 目标生成流程

```
用户输入目标文本
    ↓
generateStatusQuestions()   → 生成 2-4 个了解用户状态的问题
    ↓
用户回答问题
    ↓
generateGoalPlan()          → 生成完整计划
                               - 当前状态整理
                               - 3-6 个子目标
                               - 每日任务（含时长，总和 ≤ 用户每日可用时间）
    ↓
用户确认 → addGoal()        → 奖励 +20 金币
```

### 11.4 表情推断系统

`inferExpressionFromReply(replyText)` 基于关键词匹配，将 AI 回复文本映射至 8 种表情：
`happy` / `sad` / `thinking` / `surprised` / `shy` / `angry` / `proud` / `sleepy`

---

## 12. 主题与视觉系统

### Sakura 主题色彩

```css
/* 主色调 */
--primary: hsl(340 75% 65%)      /* 樱花粉 */
--secondary: hsl(15 90% 70%)     /* 桃橙 */
--accent: hsl(270 55% 72%)       /* 薰衣紫 */

/* 背景 */
--background: hsl(340 30% 97%)   /* 浅粉白 */
```

### 字体

- 主字体：**Nunito**（圆润可爱）
- 通过 Google Fonts 加载

### 视觉风格元素

- 圆角卡片（`rounded-2xl` / `rounded-3xl`）
- 渐变横幅与按钮
- Emoji 装饰
- GAL 游戏风格对话框（打字机效果 + 角色名标签）
- FloatingHearts / Sparkles 装饰组件
- 暖粉温馨房间背景（RoomBackground）

---

## 13. 数据库设计（Supabase）

### 13 张业务表

| 表名 | 说明 |
|------|------|
| `users` | 用户基本信息（昵称/头像/金币/钻石/连续天数等） |
| `goals` | 目标主表（含 context / attachments JSONB 字段） |
| `sub_goals` | 子目标（关联 goals） |
| `ai_messages` | AI 对话消息（关联用户 + 角色 ID） |
| `achievements` | 成就定义表 |
| `user_achievements` | 用户已解锁成就（多对多） |
| `quests` | 每日任务/Quest 定义 |
| `leaderboard` | 排行榜 |
| `room_items` | 小屋装饰物品定义 |
| `user_rooms` | 用户小屋配置 |
| `user_avatar_items` | 用户头像装扮物品 |
| `coin_transactions` | 金币流水记录 |
| `focus_sessions` | 专注时长记录 |

### Supabase Storage Buckets

| Bucket | 说明 |
|--------|------|
| `avatars` | 用户自定义头像（按 auth_uid 目录隔离，限 2MB） |
| `goal-attachments` | 目标附件（路径：`{authUserId}/{goalId}/{uuid}.{ext}`，限 10MB） |

### RLS 策略要点

- 使用 `auth.uid()::text`（不可用 `current_user`，那是 PostgreSQL 系统用户）
- 所有个人数据按 auth UID 隔离

---

## 14. 现有问题与欠缺分析

### 🔴 P0 — 严重缺失（直接影响用户核心体验）

#### 14.1 成就系统 UI 完全缺失

**问题**：DB 层已实现完整的成就表（`achievements` / `user_achievements`）和检查逻辑（`checkAndUnlockAchievements`），但前端 **没有任何页面或组件展示成就**，用户无法感知自己解锁了什么成就，正向激励循环断裂。

**影响**：金币奖励系统的意义大打折扣，用户留存动力不足。

**建议**：在 ProfilePage 增加成就 Tab，展示已解锁/未解锁成就；完成目标/子目标时弹出解锁动画。

---

#### 14.2 每日 Quest 系统 UI 缺失

**问题**：DB 层已实现 `quests` 表（默认 4 个每日任务：早起打卡+20币/完成子目标+30币/与AI聊天+15币/专注30分钟+50币），`completeQuest()` 逻辑已写好，但前端 **没有任何地方展示每日 Quest**，用户不知道每天可以领取哪些任务。

**影响**：设计了激励循环但用户看不到，等于没有。

**建议**：在 HomePage 或 ProfilePage 展示今日 Quest 列表及完成状态。

---

#### 14.3 专注统计 UI 缺失

**问题**：`focus_sessions` 表和 `recordFocusSession` / `getFocusStats` 函数已实现，但 ProfilePage 的"数据统计" Tab **只展示会员天数和金币/钻石**，没有任何专注时长统计图表。

**影响**：用户无法看到自己的学习数据，缺乏成就感和持续动力。

**建议**：在数据统计 Tab 增加：今日专注时长、本周专注曲线图、总专注时长排名。

---

### 🟠 P1 — 重要欠缺（功能残缺或体验较差）

#### 14.4 排行榜完全未实现

**问题**：`leaderboard` 表已建，但代码中 **没有任何读写排行榜的逻辑**，也没有对应页面。

**建议**：实现基于金币或专注时长的每周排行榜，增加社交竞争感。

---

#### 14.5 商店/经济系统残缺

**问题**：`room_items` / `user_avatar_items` / `coin_transactions` 等表已建，金币系统在运作，但 **没有商店页面**，用户积累的金币和钻石 **无处消费**，经济系统失去闭环。

**影响**：货币没有消费出口，激励效果递减。

**建议**：实现简单商店页面，提供主题皮肤、特殊表情包、AI 角色解锁等消费项目。

---

#### 14.6 目标状态管理不完整

**问题**：`GoalStatus` 定义了 `active / completed / paused / abandoned` 四个状态，但：
- 没有 UI 让用户手动将目标标记为"暂停"或"放弃"
- "已完成"状态的目标在列表中和进行中目标混在一起，没有归档分区
- 没有目标完成后的庆祝/仪式感反馈（缺少完成动画/弹窗）

---

#### 14.7 GoalsPage 移动端体验较差

**问题**：Goals 页面为三栏布局，在手机屏幕上三列同时显示会导致严重的空间不足，当前没有响应式折叠逻辑（未见 `md:` 或 `lg:` 断点切换为单栏/双栏）。

**建议**：移动端切换为全屏单栏 + 底部抽屉展开详情的模式。

---

#### 14.8 AI 对话消息缺少流式输出

**问题**：当前 AI 调用是标准 HTTP 请求（等待完整响应后一次性返回），用户看到的是"等待 → 突然出现全文"。虽然有打字机动效缓解，但体感延迟仍明显。

**建议**：接入 DeepSeek Streaming API，实现 SSE 流式输出，边生成边显示。

---

#### 14.9 AI 角色仅艾莉丝深度集成，其余角色体验薄弱

**问题**：Goals 页面的 AI 助手面板、Room 沉浸式房间都只有艾莉丝。`AIPage`（多角色切换）未挂载到任何路由，实际无法访问。蕾姆等角色的对话体验仅存在于废弃路由中。

**建议**：将 AIPage 挂载路由，或在 Room 页提供角色切换功能；至少让蕾姆等角色可在某个入口访问。

---

#### 14.10 密码重置流程未完成

**问题**：`sendPasswordResetEmail(email)` 函数已写好，但 LoginPage **没有"忘记密码"按钮/入口**，用户忘记密码时无法找回。

---

### 🟡 P2 — 体验优化（影响精致感）

#### 14.11 数据统计维度过少

ProfilePage 的数据统计 Tab 只有：会员天数、金币余额、钻石余额。对于一个学习平台而言，缺失：
- 总完成目标数
- 累计专注时长
- 最长连续打卡记录
- 每周/月学习趋势图

---

#### 14.12 离线模式体验不完整

`addToSyncQueue` 已实现离线队列设计，但：
- 没有网络状态监听（`navigator.onLine` / `online`/`offline` 事件）
- 离线时用户不知道当前处于离线状态
- 队列恢复时没有用户可见的同步状态提示（`showSyncToast` 状态存在但未见充分使用）

---

#### 14.13 AI 创建的目标无法二次编辑任务内容

**问题**：AI 智能创建后，子目标和每日任务的内容是 AI 生成的，但 GoalDetailPanel 中没有提供对已有每日任务的**标题/描述/时长编辑**功能，用户只能删除重建。

---

#### 14.14 附件功能交互不完善

- 图片类附件没有预览功能（只有链接跳转）
- 附件上传进度无可视反馈
- 文档附件的 `extractedText` 在 UI 层没有展示入口（用户无法确认提取效果）

---

#### 14.15 `useUIStore` 中 `sidebarOpen` 已无组件消费

原左侧桌面侧边栏已废弃，改为底部 Tab + 左侧滑出菜单，但 `useUIStore` 中的 `sidebarOpen` 字段仍然存在，属于残留状态，应清理。

---

#### 14.16 缺少错误边界（Error Boundary）

当前无 React Error Boundary，任何组件的运行时错误都会导致整个应用白屏，用户无法得到友好提示。

---

#### 14.17 Demo 模式与正式账号功能不对等

Demo 模式下所有 DB 写操作被跳过，用户无法感知这一差异，可能在 Demo 模式下做了大量操作后发现数据丢失（无持久化），缺少明显的 Demo 模式提示横幅。

---

### 📋 优先级汇总

| 优先级 | 问题 | 工作量估算 |
|--------|------|-----------|
| 🔴 P0 | 成就系统 UI | M（中） |
| 🔴 P0 | 每日 Quest UI | S（小） |
| 🔴 P0 | 专注统计图表 | S（小） |
| 🟠 P1 | 商店/金币消费出口 | L（大） |
| 🟠 P1 | 目标状态管理完整化 | M（中） |
| 🟠 P1 | Goals 移动端响应式 | M（中） |
| 🟠 P1 | AI 流式输出 | M（中） |
| 🟠 P1 | 忘记密码入口 | XS（极小） |
| 🟠 P1 | 排行榜 | L（大） |
| 🟡 P2 | 数据统计维度扩充 | S（小） |
| 🟡 P2 | 离线模式体验优化 | S（小） |
| 🟡 P2 | 每日任务内容编辑 | S（小） |
| 🟡 P2 | 附件交互优化 | S（小） |
| 🟡 P2 | Error Boundary | XS（极小） |
| 🟡 P2 | Demo 模式提示 | XS（极小） |

---

*本文档由 AI 辅助生成，基于 2026-05-11 代码库快照。如有变更请同步更新。*
