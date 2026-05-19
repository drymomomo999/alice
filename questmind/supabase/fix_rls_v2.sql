-- =====================================================
-- QuestMind 数据库修复脚本 v2
-- 适用于：已建表但 RLS 策略有问题的数据库
-- 在 Supabase SQL Editor 中执行
-- =====================================================

-- =====================================================
-- 1. 补充 users 表缺失的列（幂等操作，重复执行安全）
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'time_preference'
    ) THEN
        ALTER TABLE users ADD COLUMN time_preference TEXT CHECK (time_preference IN ('early', 'night', 'flexible'));
        RAISE NOTICE 'Added time_preference column';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'goal_preferences'
    ) THEN
        ALTER TABLE users ADD COLUMN goal_preferences TEXT[];
        RAISE NOTICE 'Added goal_preferences column';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'onboarding_completed'
    ) THEN
        ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added onboarding_completed column';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'streak_updated_at'
    ) THEN
        ALTER TABLE users ADD COLUMN streak_updated_at TIMESTAMPTZ;
        RAISE NOTICE 'Added streak_updated_at column';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'total_goals_completed'
    ) THEN
        ALTER TABLE users ADD COLUMN total_goals_completed INTEGER DEFAULT 0;
        RAISE NOTICE 'Added total_goals_completed column';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'total_focus_minutes'
    ) THEN
        ALTER TABLE users ADD COLUMN total_focus_minutes INTEGER DEFAULT 0;
        RAISE NOTICE 'Added total_focus_minutes column';
    END IF;
END $$;

-- =====================================================
-- 2. 删除所有旧的 RLS 策略（批量清理）
-- =====================================================

-- users
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Authenticated users can do anything with users" ON users;
DROP POLICY IF EXISTS "users_select_own" ON users;
DROP POLICY IF EXISTS "users_insert_own" ON users;
DROP POLICY IF EXISTS "users_update_own" ON users;
DROP POLICY IF EXISTS "users_delete_own" ON users;

-- goals
DROP POLICY IF EXISTS "Users can view own goals" ON goals;
DROP POLICY IF EXISTS "Users can manage own goals" ON goals;
DROP POLICY IF EXISTS "Authenticated users can do anything with goals" ON goals;
DROP POLICY IF EXISTS "goals_all_own" ON goals;

-- sub_goals
DROP POLICY IF EXISTS "Users can view own sub_goals" ON sub_goals;
DROP POLICY IF EXISTS "Users can manage own sub_goals" ON sub_goals;
DROP POLICY IF EXISTS "Authenticated users can do anything with sub_goals" ON sub_goals;
DROP POLICY IF EXISTS "sub_goals_all_own" ON sub_goals;

-- ai_messages
DROP POLICY IF EXISTS "Users can manage own ai_messages" ON ai_messages;
DROP POLICY IF EXISTS "Authenticated users can do anything with ai_messages" ON ai_messages;
DROP POLICY IF EXISTS "ai_messages_all_own" ON ai_messages;

-- quests
DROP POLICY IF EXISTS "Users can manage own quests" ON quests;
DROP POLICY IF EXISTS "Authenticated users can do anything with quests" ON quests;
DROP POLICY IF EXISTS "quests_all_own" ON quests;

-- user_rooms
DROP POLICY IF EXISTS "Users can manage own room" ON user_rooms;
DROP POLICY IF EXISTS "Users can manage own user_rooms" ON user_rooms;
DROP POLICY IF EXISTS "Authenticated users can do anything with user_rooms" ON user_rooms;
DROP POLICY IF EXISTS "user_rooms_all_own" ON user_rooms;

-- user_avatar_items
DROP POLICY IF EXISTS "Users can manage own avatar items" ON user_avatar_items;
DROP POLICY IF EXISTS "Authenticated users can do anything with user_avatar_items" ON user_avatar_items;
DROP POLICY IF EXISTS "user_avatar_items_all_own" ON user_avatar_items;

-- coin_transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON coin_transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON coin_transactions;
DROP POLICY IF EXISTS "Authenticated users can do anything with coin_transactions" ON coin_transactions;
DROP POLICY IF EXISTS "coin_transactions_select_own" ON coin_transactions;
DROP POLICY IF EXISTS "coin_transactions_insert_own" ON coin_transactions;

-- focus_sessions
DROP POLICY IF EXISTS "Users can manage own focus sessions" ON focus_sessions;
DROP POLICY IF EXISTS "Authenticated users can do anything with focus_sessions" ON focus_sessions;
DROP POLICY IF EXISTS "focus_sessions_all_own" ON focus_sessions;

-- leaderboard
DROP POLICY IF EXISTS "Anyone can view leaderboard" ON leaderboard;
DROP POLICY IF EXISTS "Users can update own leaderboard entry" ON leaderboard;
DROP POLICY IF EXISTS "Users can insert own leaderboard entry" ON leaderboard;
DROP POLICY IF EXISTS "Authenticated users can manage own leaderboard" ON leaderboard;
DROP POLICY IF EXISTS "leaderboard_select_all" ON leaderboard;
DROP POLICY IF EXISTS "leaderboard_insert_own" ON leaderboard;
DROP POLICY IF EXISTS "leaderboard_update_own" ON leaderboard;

-- room_items
DROP POLICY IF EXISTS "Anyone can view room_items" ON room_items;

-- =====================================================
-- 3. 重建正确的 RLS 策略（使用 auth.uid()）
-- =====================================================

-- users：通过 auth_id 列对比 auth.uid() 来验证所有权
CREATE POLICY "users_select_own" ON users
    FOR SELECT USING (auth_id = auth.uid()::text);

CREATE POLICY "users_insert_own" ON users
    FOR INSERT WITH CHECK (auth_id = auth.uid()::text);

CREATE POLICY "users_update_own" ON users
    FOR UPDATE USING (auth_id = auth.uid()::text);

CREATE POLICY "users_delete_own" ON users
    FOR DELETE USING (auth_id = auth.uid()::text);

-- goals
CREATE POLICY "goals_all_own" ON goals
    FOR ALL USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- sub_goals
CREATE POLICY "sub_goals_all_own" ON sub_goals
    FOR ALL USING (
        goal_id IN (
            SELECT id FROM goals WHERE user_id IN (
                SELECT id FROM users WHERE auth_id = auth.uid()::text
            )
        )
    );

-- ai_messages
CREATE POLICY "ai_messages_all_own" ON ai_messages
    FOR ALL USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- quests
CREATE POLICY "quests_all_own" ON quests
    FOR ALL USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- user_rooms
CREATE POLICY "user_rooms_all_own" ON user_rooms
    FOR ALL USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- user_avatar_items
CREATE POLICY "user_avatar_items_all_own" ON user_avatar_items
    FOR ALL USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- coin_transactions
CREATE POLICY "coin_transactions_select_own" ON coin_transactions
    FOR SELECT USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

CREATE POLICY "coin_transactions_insert_own" ON coin_transactions
    FOR INSERT WITH CHECK (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- focus_sessions
CREATE POLICY "focus_sessions_all_own" ON focus_sessions
    FOR ALL USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- leaderboard（公开读取）
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

-- room_items 不含用户私有数据，禁用 RLS 直接公开
ALTER TABLE room_items DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. 验证修复结果
-- =====================================================
SELECT
    schemaname,
    tablename,
    policyname,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

SELECT '✅ 数据库修复完成！' AS status;
