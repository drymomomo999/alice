-- =====================================================
-- QuestMind 跨账号数据泄漏诊断脚本
-- 在 Supabase SQL Editor 中执行，检查当前 RLS 策略状态
-- =====================================================

-- 1. 检查是否存在 USING (true) 的宽松策略（这些会导致跨账号数据泄漏）
SELECT '⚠️ 宽松策略（USING true）:' AS finding,
    tablename,
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR qual IS NULL)
  AND tablename IN ('goals', 'sub_goals', 'daily_tasks', 'ai_messages')
ORDER BY tablename;

-- 2. 列出 goals 表当前所有策略
SELECT '📋 goals 表策略:' AS finding,
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'goals'
ORDER BY policyname;

-- 3. 检查 goals 表的 RLS 是否已启用
SELECT '🔒 goals RLS 状态:' AS finding,
    relname AS table_name,
    relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname = 'goals';

-- 4. 快速测试：模拟另一个用户是否能看到不属于自己的数据
-- （需要换成实际的 user_id）
-- SELECT COUNT(*) FROM goals WHERE user_id != '你的user-id';
