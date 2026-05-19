-- =====================================================
-- QuestMind 406 错误修复脚本（完整版 v3）
-- 解决：Supabase RLS + 缺表 导致的 406 Not Acceptable
-- 在 Supabase Dashboard → SQL Editor 中执行此脚本
-- =====================================================

-- =====================================================
-- 0. 创建缺失的 daily_tasks 表
-- =====================================================
CREATE TABLE IF NOT EXISTS daily_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    duration INTEGER,
    frequency TEXT DEFAULT 'daily' CHECK (frequency IN ('daily', 'custom')),
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_tasks_goal_id ON daily_tasks(goal_id);

-- =====================================================
-- 1. 补充缺失列（幂等安全）
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'time_preference') THEN
        ALTER TABLE users ADD COLUMN time_preference TEXT CHECK (time_preference IN ('early', 'night', 'flexible'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'goal_preferences') THEN
        ALTER TABLE users ADD COLUMN goal_preferences TEXT[];
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'onboarding_completed') THEN
        ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'streak_updated_at') THEN
        ALTER TABLE users ADD COLUMN streak_updated_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'total_goals_completed') THEN
        ALTER TABLE users ADD COLUMN total_goals_completed INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'total_focus_minutes') THEN
        ALTER TABLE users ADD COLUMN total_focus_minutes INTEGER DEFAULT 0;
    END IF;
END $$;

-- =====================================================
-- 2. 清除所有旧 RLS 策略（全量清理）
-- =====================================================

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN 
        SELECT tablename, policyname FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename IN (
            'users', 'goals', 'sub_goals', 'daily_tasks', 'ai_messages',
            'quests', 'leaderboard',
            'room_items', 'user_rooms', 'user_avatar_items',
            'coin_transactions', 'focus_sessions'
        )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "%I" ON %I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- =====================================================
-- 3. 确保 RLS 已启用
-- =====================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_avatar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. 重建所有 RLS 策略（使用 auth.uid()::text）
-- =====================================================

-- ---------- users 表 ----------
CREATE POLICY "users_select_own" ON users
    FOR SELECT USING (auth_id = auth.uid()::text);

CREATE POLICY "users_insert_own" ON users
    FOR INSERT WITH CHECK (auth_id = auth.uid()::text);

CREATE POLICY "users_update_own" ON users
    FOR UPDATE USING (auth_id = auth.uid()::text);

CREATE POLICY "users_delete_own" ON users
    FOR DELETE USING (auth_id = auth.uid()::text);

-- ---------- goals 表 ----------
CREATE POLICY "goals_all_own" ON goals
    FOR ALL USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- ---------- sub_goals 表 ----------
CREATE POLICY "sub_goals_all_own" ON sub_goals
    FOR ALL USING (
        goal_id IN (
            SELECT id FROM goals WHERE user_id IN (
                SELECT id FROM users WHERE auth_id = auth.uid()::text
            )
        )
    );

-- ---------- daily_tasks 表 ----------
CREATE POLICY "daily_tasks_all_own" ON daily_tasks
    FOR ALL USING (
        goal_id IN (
            SELECT id FROM goals WHERE user_id IN (
                SELECT id FROM users WHERE auth_id = auth.uid()::text
            )
        )
    );

-- ---------- ai_messages 表 ----------
CREATE POLICY "ai_messages_all_own" ON ai_messages
    FOR ALL USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- ---------- quests 表 ----------
CREATE POLICY "quests_all_own" ON quests
    FOR ALL USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- ---------- user_rooms 表 ----------
CREATE POLICY "user_rooms_all_own" ON user_rooms
    FOR ALL USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- ---------- user_avatar_items 表 ----------
CREATE POLICY "user_avatar_items_all_own" ON user_avatar_items
    FOR ALL USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- ---------- coin_transactions 表 ----------
CREATE POLICY "coin_transactions_select_own" ON coin_transactions
    FOR SELECT USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

CREATE POLICY "coin_transactions_insert_own" ON coin_transactions
    FOR INSERT WITH CHECK (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- ---------- focus_sessions 表 ----------
CREATE POLICY "focus_sessions_all_own" ON focus_sessions
    FOR ALL USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- ---------- leaderboard 表（公开读）----------
CREATE POLICY "leaderboard_select_all" ON leaderboard
    FOR SELECT USING (true);

CREATE POLICY "leaderboard_insert_own" ON leaderboard
    FOR INSERT WITH CHECK (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

CREATE POLICY "leaderboard_update_own" ON leaderboard
    FOR UPDATE USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- ---------- room_items（公开表，禁用 RLS）----------
ALTER TABLE room_items DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 5. 验证结果
-- =====================================================
SELECT
    tablename,
    COUNT(*) as policy_count,
    string_agg(policyname, ', ') as policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
