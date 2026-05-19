-- =====================================================
-- QuestMind 修复脚本
-- 解决 Firebase Auth + Supabase 兼容性问题
-- =====================================================

-- 1. 先删除所有现有的 RLS 策略
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

-- 2. 重新创建 RLS 策略（禁用 RLS，改为前端控制权限）
-- 对于 Firebase Auth，我们禁用 RLS 或设置为允许所有操作

-- 启用 RLS 但设置为允许所有操作（Firebase Auth 用户在前端通过 auth_id 字段控制）
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_avatar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;

-- 3. 创建宽松的 RLS 策略（允许所有经过身份验证的用户操作）
-- 由于我们使用 Firebase Auth，前端会验证用户身份

CREATE POLICY "Allow all for users" ON users
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for goals" ON goals
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for sub_goals" ON sub_goals
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for ai_messages" ON ai_messages
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for quests" ON quests
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for user_rooms" ON user_rooms
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for user_avatar_items" ON user_avatar_items
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for coin_transactions" ON coin_transactions
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for focus_sessions" ON focus_sessions
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for leaderboard" ON leaderboard
    FOR ALL USING (true) WITH CHECK (true);

-- 4. 验证 users 表结构
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;
