-- 修复 ai_messages 表的 CHECK 约束，添加 'rem' 角色
-- 在 Supabase SQL Editor 中执行此脚本

-- 删除旧约束（先尝试删除，不存在也不报错）
ALTER TABLE ai_messages DROP CONSTRAINT IF EXISTS ai_messages_character_id_check;

-- 添加包含 'rem' 的新约束
ALTER TABLE ai_messages ADD CONSTRAINT ai_messages_character_id_check
  CHECK (character_id IN ('xiaoSi', 'coach', 'friend', 'rem'));
