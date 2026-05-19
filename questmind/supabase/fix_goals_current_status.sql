-- =====================================================
-- QuestMind 数据库修复脚本 v3
-- 修复 goals 表缺失的 current_status 列
-- 在 Supabase SQL Editor 中执行
-- =====================================================

-- 1. 添加 goals 表缺失的 current_status 列
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'goals' AND column_name = 'current_status'
    ) THEN
        ALTER TABLE goals ADD COLUMN current_status TEXT;
    END IF;
END $$;

-- 2. 刷新 PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- 3. 验证
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'goals' AND column_name = 'current_status';

SELECT '✅ goals 表 current_status 列修复完成！' AS status;
