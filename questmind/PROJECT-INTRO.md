# QuestMind — AI 陪伴式学习平台

> 以 AI 伙伴「艾莉丝」为核心，将目标管理、智能学习与情感陪伴融为一体，让每一次学习都有人同行。

---

## 一、项目概览

**QuestMind** 是一款软硬件结合的 AI 陪伴式学习平台。它不只是一个待办清单工具，而是一个会"陪伴你"的学习伙伴——通过 AI 角色 **艾莉丝（Alice）** 提供从目标拆解、学习指导到日常闲聊的全流程陪伴，让用户"有人一起、有盼头、有动力"地完成自己的目标。

| 项目属性 | 详情 |
|---------|------|
| **定位** | AI 陪伴式学习平台（软件 + 硬件） |
| **目标用户** | 16–35 岁在校生、在职人群、自学者 |
| **核心痛点** | 目标太大不知从何下手、独自学习容易放弃、缺乏持续动力与情感支持 |
| **解决方案** | AI 目标拆解 + 学习指南 + 角色陪伴 + 专注计时 + 多端覆盖 |

---

## 二、核心功能

### 1. 目标管理系统（Goals）

三栏交互式布局，覆盖目标全生命周期：

- **目标列表**：创建、分类、优先级设置、状态追踪（进行中/已完成）
- **目标详情面板**：子目标勾选分解、进度可视化、附件上传（PDF / Word / 图片）
- **AI 学习指南**：艾莉丝根据目标上下文自动生成结构化学习计划（markdown 大纲 + 知识要点）
- **智能测验**：基于目标内容生成真实练习题，支持每日任务卡片与期末考试模式
- **AI 聊天面板**：目标专属的艾莉丝对话，对标 NotebookLM 讲解流 + Character.ai 角色卡

### 2. 艾莉丝角色系统（Alice）

艾莉丝是 QuestMind 的灵魂角色，拥有完整的人物设定：

- **身份**：全名艾莉丝（Alice），住在深圳的温柔女孩/看板娘
- **形象**：Q 版金发蓝眼少女，金色几何皇冠，象牙白礼服
- **性格**：温柔、优雅、认真、克制、有同理心，称呼用户昵称
- **象征**：白蔷薇花；代表色为象牙白 / 樱花粉 / 暖橙色
- **情绪立绘**：8 种情绪状态（开心/生气/骄傲/伤心/害羞/困倦/惊讶/思考）+ 6 张剧情 CG

艾莉丝分为两条独立产品线：

| 产品线 | 场景 | 定位 | 对标 |
|--------|------|------|------|
| **小屋艾莉丝** | 小屋互动房 | 纯陪伴闲聊，可编辑个人档案，AI 偏好分析 | GPT / DeepSeek 精准度与泛用性 |
| **Goals 艾莉丝** | 目标学习页面 | 学习指导与知识讲解，硬编码角色设定 | NotebookLM 讲解流 + Character.ai 角色卡 |

### 3. 讲义学习室（LectureRoom）

- 文档渲染：支持 PDF（pdfjs-dist canvas 渲染）与 Word（mammoth 提取）
- 桌宠浮窗：右下角 AlicePet 陪伴式学习
- 移动端适配：Android WebView 兼容渲染

### 4. 虚拟小屋（Room）

温馨的暖粉色房间场景，艾莉丝在此与用户互动：

- **ProfilePanel**：可编辑的艾莉丝个人档案（动态人设）
- **VoiceSettingsPanel**：语音设置（TTS）
- **AI 偏好分析**：每 4 轮对话后台自动分析用户偏好，用户不可见
- 场景元素：暖墙 + 护墙板 + 木地板 + 阳光窗台 + 书架

### 5. 专注计时（Focus Sessions）

- 专注会话记录与统计
- 累计专注时长追踪

### 6. 国际化（i18n）

- 自定义 `useT()` Hook，中英双语切换
- 语言文件：`zh.ts` / `en.ts`

---

## 三、技术架构

### 技术栈

| 层级 | 技术选型 |
|------|---------|
| **前端框架** | React 19 + TypeScript |
| **构建工具** | Vite 8 |
| **样式方案** | Tailwind CSS 3.4 + shadcn/ui (Radix) + framer-motion + tailwindcss-animate |
| **状态管理** | Zustand 5 (with persist) |
| **路由** | React Router DOM 7（HashRouter + ProtectedRoute） |
| **后端服务** | Supabase（PostgreSQL + Auth + Storage + Edge Functions） |
| **AI 能力** | DeepSeek API（deepseek-chat 模型） |
| **桌面端** | Tauri v2 |
| **移动端** | Capacitor 8（Android） |
| **文档处理** | pdfjs-dist（PDF 渲染）+ mammoth（Word 提取）+ react-markdown |

### 架构亮点

```
┌─────────────────────────────────────────────────────┐
│                   QuestMind 客户端                   │
│  (React + Vite — 桌面/网页/安卓 共用代码)             │
├──────────┬──────────┬──────────┬───────────────────┤
│  Goals   │ Room     │ Lecture  │  Home / Profile   │
│  目标管理 │ 小屋陪伴  │ 讲义学习室 │  首页 / 个人中心   │
├──────────┴──────────┴──────────┴───────────────────┤
│           Zustand Store + i18n + 自定义 Hooks        │
├─────────────────────────────────────────────────────┤
│              Supabase (PostgreSQL + Auth)            │
│              Edge Functions (AI Chat / Voice)        │
│              Storage (avatars / goal-attachments)     │
├─────────────────────────────────────────────────────┤
│              DeepSeek API (deepseek-chat)            │
└─────────────────────────────────────────────────────┘
```

### AI 调用链

```
客户端请求 → DeepSeek 直连（桌面/网页）→ 失败回退 → Edge Function → 再失败 → Mock 兜底
```

- 桌面/网页环境：客户端直连 DeepSeek
- Capacitor（安卓）环境：统一走 Edge Function（API Key 安全 + 无 CORS 问题）
- Edge Function：`supabase/functions/ai-chat/index.ts`，配置 `DEEPSEEK_API_KEY`
- 语音 Edge Function：`supabase/functions/alice-voice/`

### 数据库（8 张表）

| 表名 | 用途 |
|------|------|
| `users` | 用户基础信息（昵称、头像、专注时长、完成目标数） |
| `goals` | 目标（含 context 上下文、attachments 附件 JSONB） |
| `sub_goals` | 子目标 |
| `ai_messages` | AI 对话消息 |
| `room_items` | 小屋物品 |
| `user_rooms` | 用户小屋配置 |
| `user_avatar_items` | 用户头像物品 |
| `focus_sessions` | 专注会话记录 |

> 已移除 5 张游戏化表及 users 表的 coins/gems/streak 字段，聚焦陪伴式学习核心。

### 多端覆盖

| 平台 | 方案 | 状态 |
|------|------|------|
| **桌面端** | Tauri v2 | ✅ 已支持 |
| **网页端** | Vite 构建 | ✅ 已支持 |
| **安卓端** | Capacitor 8 套壳 | ✅ 已支持（appId: com.questmind.app） |

移动端适配要点：
- 路由 BrowserRouter → HashRouter（兼容 file:// 协议）
- vite.config base 设为 `'./'`（相对路径）
- Goals 页面三栏 → 单栏 + Tab 切换
- PDF 渲染 iframe → pdfjs-dist canvas（Android WebView 兼容）
- 立绘尺寸 62vh → 55vh 适配

---

## 四、UI 设计风格

- **主题色系**：樱花粉 `hsl(340 75% 65%)` + 桃橙色 + 薰衣草紫
- **字体**：Nunito
- **风格**：圆角卡片 + 渐变 + emoji，温馨治愈系
- **小屋场景**：暖粉色温馨房间（暖墙 + 护墙板 + 木地板 + 阳光窗台 + 书架）
- **旧颜色兼容**：cyber/honkki-gold/void 等旧名通过 Tailwind 别名映射

---

## 五、硬件产品规划

QuestMind 不仅是一套软件，更有实体硬件落地计划：

### 路线 A — 手办型（MVP，12–18 个月）

| 项目 | 详情 |
|------|------|
| 售价 | ¥299–399 |
| BOM 成本 | ¥63–97 |
| 定位 | 入门级实体陪伴 |

### 路线 B — 全息投影

| 项目 | 详情 |
|------|------|
| 售价 | ¥899–1,299 |
| 定位 | 高端沉浸式体验 |

### 融资计划

| 轮次 | 金额 | 出让股份 |
|------|------|---------|
| 天使轮 | 200–500 万 | 10–20% |
| Pre-A 轮 | 1,000–3,000 万 | — |
| A 轮 | 3,000–8,000 万 | — |

---

## 六、项目结构

```
questmind/
├── src/
│   ├── pages/              # 页面
│   │   ├── Welcome.tsx     # 欢迎页
│   │   ├── Login/          # 登录注册
│   │   ├── Onboarding/     # 引导设置（昵称/头像/偏好）
│   │   ├── Home/           # 首页
│   │   ├── Goals/          # 目标管理（7 个子组件）
│   │   ├── LectureRoom/    # 讲义学习室（含 AlicePet 桌宠）
│   │   ├── Room/           # 小屋互动房
│   │   └── Profile/        # 个人中心
│   ├── components/         # 通用组件（ui / layout / AliceRoom / Room）
│   ├── services/           # 服务层
│   │   ├── ai.service.ts       # DeepSeek AI 调用
│   │   ├── alice.service.ts    # 艾莉丝角色配置
│   │   ├── aliceProfile.service.ts  # 艾莉丝档案管理
│   │   ├── aliceVoice.service.ts    # 语音服务
│   │   ├── auth.service.ts     # 认证服务
│   │   ├── supabase.ts        # 数据库操作
│   │   └── syncService.ts     # 数据同步
│   ├── store/              # Zustand 状态管理
│   ├── hooks/              # 自定义 Hooks（语音/移动端检测/打字机效果）
│   ├── lib/                # 工具函数（文件提取/通用工具）
│   ├── i18n/               # 国际化（中/英）
│   ├── types/              # TypeScript 类型定义
│   └── assets/             # 静态资源（艾莉丝立绘/CG/图标）
├── src-tauri/              # Tauri 桌面端配置
├── android/                # Capacitor 安卓工程
├── supabase/               # 后端
│   ├── schema.sql          # 数据库表结构
│   ├── functions/          # Edge Functions（ai-chat / alice-voice）
│   └── *.sql               # RLS 策略与修复脚本
└── capacitor.config.ts     # Capacitor 配置
```

---

## 七、快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env   # 填写 Supabase URL / Key / DeepSeek API Key

# 3. 配置数据库（执行 supabase/schema.sql）
#    配置 Edge Function secrets:
#    supabase secrets set DEEPSEEK_API_KEY=sk-xxx

# 4. 启动开发服务器
npm run dev

# 5. 桌面端
npm run tauri:dev

# 6. 安卓端构建
npm run android:build   # 然后 Android Studio 打开 android/ 构建 APK
```

---

## 八、设计理念

QuestMind 解决三大学习痛点：

| 痛点 | 解决方案 |
|------|---------|
| 目标太大，不知道从哪下手 | AI 智能目标拆解 + 结构化学习指南 |
| 自己做计划太容易放弃 | 艾莉丝全程陪伴监督 + 专注计时 |
| 单人学习缺乏持续动力 | 情感陪伴角色 + 小屋互动 + 成长追踪 |

**核心理念**：不是冰冷的效率工具，而是有温度的学习伙伴。

---

*QuestMind — 让每一次学习，都有艾莉丝陪你同行。*
