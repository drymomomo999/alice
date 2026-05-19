# QuestMind AI 目标创建功能更新

## 更新日期
2026-04-16

## 功能概述
实现了 AI 智能目标创建流程，用户输入目标后，AI 会：
1. 询问用户当前状态（如体重、基础水平等）
2. 基于目标和状态生成子目标
3. 生成每日任务清单

## 代码变更

### 1. 类型定义 (`src/types/index.ts`)
- 新增 `DailyTask` 类型
- `Goal` 类型新增 `currentStatus` 和 `dailyTasks` 字段

### 2. AI 服务 (`src/services/ai.service.ts`)
新增三个函数：
- `generateStatusQuestions()` - 根据目标生成询问状态的问题
- `generateGoalPlan()` - 基于目标和状态生成完整计划
- `GoalPlanResult` 接口 - 包含当前状态、子目标、每日任务

### 3. Goals 页面 (`src/pages/Goals/index.tsx`)
- 新增 AI 智能创建对话框
- 多步骤向导：目标输入 → 状态询问 → 计划预览 → 确认创建
- 目标卡片新增每日任务显示
- 头部新增「AI 智能创建」按钮

### 4. Store (`src/store/index.ts`)
- `addGoal` 方法支持 `dailyTasks`
- 新增 `toggleDailyTask` 方法

### 5. 数据库 Schema (`supabase/schema.sql`)
- `goals` 表新增 `current_status` 字段
- 新增 `daily_tasks` 表
- 添加 RLS 策略

## 用户体验流程
1. 点击「AI 智能创建」按钮
2. 输入目标（如：三个月学会Python）
3. AI 询问当前状态问题（如：你目前的基础水平？每周能投入多少时间？）
4. 用户回答后，AI 生成：
   - 阶段性子目标
   - 每日任务清单（含时长）
5. 用户确认后创建目标

## 待办事项
- [ ] 每日任务的勾选交互（点击完成任务）
- [ ] 每日任务的数据持久化（同步到数据库）
- [ ] 每日任务的定时重置（每天自动重置为未完成）
