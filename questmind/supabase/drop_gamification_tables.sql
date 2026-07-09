-- =====================================================
-- 删除排行榜、成就、任务、金币交易相关表
-- 根本性移除奖励机制，QuestMind 不再使用游戏化金币/排行系统
-- 执行方式：在 Supabase SQL Editor 中运行此脚本
-- =====================================================

-- 安全起见，先检查表是否存在再删除（使用 IF EXISTS）
-- 删除顺序：先删依赖表（外键引用），再删主表

-- 1. 金币交易记录（依赖 users 表）
DROP TABLE IF EXISTS coin_transactions CASCADE;

-- 2. 用户成就关联表（依赖 users + achievements）
DROP TABLE IF EXISTS user_achievements CASCADE;

-- 3. 成就定义表
DROP TABLE IF EXISTS achievements CASCADE;

-- 4. 排行榜表
DROP TABLE IF EXISTS leaderboard CASCADE;

-- 5. 任务表（如果与 sub_goals 有外键关联，CASCADE 会自动处理）
DROP TABLE IF EXISTS quests CASCADE;

-- 6. 清理 users 表中已废弃的金币/钻石/连续天数字段
-- 注意：这些字段可能在之前的迁移中已删除，加 IF EXISTS 容错
ALTER TABLE users DROP COLUMN IF EXISTS coins;
ALTER TABLE users DROP COLUMN IF EXISTS gems;
ALTER TABLE users DROP COLUMN IF EXISTS streak;
ALTER TABLE users DROP COLUMN IF EXISTS streak_updated_at;

-- 验证：列出剩余的表
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
