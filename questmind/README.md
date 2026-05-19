# QuestMind - AI陪伴学习平台

> 一个以 AI 陪伴为核心驱动力的目标分解与进度追踪平台，融合游戏化竞争/奖励机制，让用户"有人一起、有盼头、有动力"地完成自己的目标。

## ✨ 核心功能

### 🎯 目标管理
- 创建、分解、追踪目标
- 子目标勾选完成
- 进度可视化
- 优先级设置

### 🤖 AI 伙伴
- **小思** - 温暖的学习搭子
- **督促师** - 严格的AI教练
- **学友** - 并肩作战的伙伴

### 🏆 成就系统
- 多种成就徽章
- 丰富的奖励机制
- 等级成长体系

### 🎮 游戏化
- 连续学习天数
- 金币/钻石货币
- 排行榜竞争

### 🏠 虚拟小屋
- 装扮你的专属空间
- 收集家具和装饰

## 🛠️ 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite
- **样式**: Tailwind CSS + shadcn/ui
- **状态管理**: Zustand
- **路由**: React Router DOM
- **后端**: Firebase Auth + Supabase
- **AI**: DeepSeek API

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并填写配置：

```bash
cp .env.example .env
```

### 3. 配置 Supabase 数据库

详细配置说明请参考 [Supabase 配置指南](supabase/SETUP.md)

快速步骤：
1. 在 [Supabase](https://supabase.com/) 创建项目
2. 复制 `Project URL` 和 `anon public key` 到 `.env`
3. 在 SQL Editor 中执行 `supabase/schema.sql` 创建所有表

### 4. 启动开发服务器

```bash
npm run dev
```

### 5. 构建生产版本

```bash
npm run build
```

## 📁 项目结构

```
src/
├── components/
│   ├── ui/           # shadcn/ui 组件
│   └── layout/       # 布局组件
├── hooks/            # 自定义 Hooks
├── lib/              # 工具函数
├── pages/            # 页面组件
│   ├── Home/         # 首页
│   ├── Goals/        # 目标管理
│   ├── AI/           # AI 伙伴
│   ├── Achievements/ # 成就中心
│   ├── Quest/        # 每日任务
│   └── Room/         # 虚拟小屋
├── services/         # API 服务
│   ├── ai.service.ts   # DeepSeek AI
│   ├── supabase.ts    # Supabase 数据库操作
│   ├── syncService.ts # 数据同步服务
│   └── firebase.ts    # Firebase 认证
├── store/            # Zustand 状态管理
├── types/            # TypeScript 类型
└── App.tsx           # 应用入口
```

## 🎨 设计理念

### 解决的痛点

1. **目标太大，不知道从哪下手** → 目标分解
2. **自己做计划太容易放弃** → AI 陪伴监督
3. **单人做事缺乏持续动力** → 游戏化竞争与奖励

### 目标用户

- 年龄：16-35岁
- 身份：在校生、在职人群、创业者
- 心理：渴望被理解、有共鸣、害怕孤独

## 📝 待讨论功能

- 用户名唯一标识
- 性别/年龄收集
- 微信登录
- 检测题难度自适应
- 角色语音（TTS）
- 服装系统

## 📄 License

MIT
