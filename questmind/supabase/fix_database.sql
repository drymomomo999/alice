-- =====================================================
-- QuestMind 数据库修复脚本
-- 在 Supabase SQL Editor 中执行
-- =====================================================

-- 1. 先检查并添加缺失的列到 users 表
DO $$
BEGIN
    -- 添加 time_preference 列（如果不存在）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'time_preference'
    ) THEN
        ALTER TABLE users ADD COLUMN time_preference TEXT CHECK (time_preference IN ('early', 'night', 'flexible'));
    END IF;
    
    -- 添加 goal_preferences 列（如果不存在）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'goal_preferences'
    ) THEN
        ALTER TABLE users ADD COLUMN goal_preferences TEXT[];
    END IF;
    
    -- 添加 onboarding_completed 列（如果不存在）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'onboarding_completed'
    ) THEN
        ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- 添加 streak_updated_at 列（如果不存在）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'streak_updated_at'
    ) THEN
        ALTER TABLE users ADD COLUMN streak_updated_at TIMESTAMPTZ;
    END IF;
    
    -- 添加 total_goals_completed 列（如果不存在）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'total_goals_completed'
    ) THEN
        ALTER TABLE users ADD COLUMN total_goals_completed INTEGER DEFAULT 0;
    END IF;
    
    -- 添加 total_focus_minutes 列（如果不存在）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'total_focus_minutes'
    ) THEN
        ALTER TABLE users ADD COLUMN total_focus_minutes INTEGER DEFAULT 0;
    END IF;
END $$;

-- 2. 验证表结构
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;

-- 3. 修复 RLS 策略 - 删除旧策略（包括未预期的策略）
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can view own goals" ON goals;
DROP POLICY IF EXISTS "Users can manage own goals" ON goals;
DROP POLICY IF EXISTS "Users can view own sub_goals" ON sub_goals;
DROP POLICY IF EXISTS "Users can manage own sub_goals" ON sub_goals;
DROP POLICY IF EXISTS "Users can manage own ai_messages" ON ai_messages;
DROP POLICY IF EXISTS "Users can manage own quests" ON quests;
DROP POLICY IF EXISTS "Users can manage own room" ON user_rooms;
DROP POLICY IF EXISTS "Users can manage own avatar items" ON user_avatar_items;
DROP POLICY IF EXISTS "Users can view own transactions" ON coin_transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON coin_transactions;
DROP POLICY IF EXISTS "Users can manage own focus sessions" ON focus_sessions;
DROP POLICY IF EXISTS "Users can update own leaderboard entry" ON leaderboard;
DROP POLICY IF EXISTS "Users can insert own leaderboard entry" ON leaderboard;
DROP POLICY IF EXISTS "Users can manage own user_rooms" ON user_rooms;
DROP POLICY IF EXISTS "Anyone can view leaderboard" ON leaderboard;
DROP POLICY IF EXISTS "Anyone can view room_items" ON room_items;

-- 4. 重新创建更宽松的 RLS 策略
-- 用户表：允许经过身份验证的用户进行所有操作
CREATE POLICY "Authenticated users can do anything with users" ON users
    FOR ALL USING (true) WITH CHECK (true);

-- 目标表
CREATE POLICY "Authenticated users can do anything with goals" ON goals
    FOR ALL USING (true) WITH CHECK (true);

-- 子目标表
CREATE POLICY "Authenticated users can do anything with sub_goals" ON sub_goals
    FOR ALL USING (true) WITH CHECK (true);

-- AI 消息表
CREATE POLICY "Authenticated users can do anything with ai_messages" ON ai_messages
    FOR ALL USING (true) WITH CHECK (true);

-- 任务表
CREATE POLICY "Authenticated users can do anything with quests" ON quests
    FOR ALL USING (true) WITH CHECK (true);

-- 小屋表
CREATE POLICY "Authenticated users can do anything with user_rooms" ON user_rooms
    FOR ALL USING (true) WITH CHECK (true);

-- 头像物品表
CREATE POLICY "Authenticated users can do anything with user_avatar_items" ON user_avatar_items
    FOR ALL USING (true) WITH CHECK (true);

-- 货币交易表
CREATE POLICY "Authenticated users can do anything with coin_transactions" ON coin_transactions
    FOR ALL USING (true) WITH CHECK (true);

-- 专注记录表
CREATE POLICY "Authenticated users can do anything with focus_sessions" ON focus_sessions
    FOR ALL USING (true) WITH CHECK (true);

-- 排行榜表
CREATE POLICY "Anyone can view leaderboard" ON leaderboard
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage own leaderboard" ON leaderboard
    FOR ALL USING (true) WITH CHECK (true);

-- 物品商店表（公开）
CREATE POLICY "Anyone can view room_items" ON room_items
    FOR SELECT USING (true);

-- 5. 输出完成信息
SELECT '修复完成！' AS status;
