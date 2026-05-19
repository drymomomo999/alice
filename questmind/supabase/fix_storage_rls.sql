-- ============================================================
-- 修复 avatars 存储桶的 RLS 策略
-- 问题：上传头像报错 "new row violates row-level security policy"
-- 原因：Storage Bucket 缺少 INSERT / UPDATE 策略
-- ============================================================

-- 1. 确认 avatars 存储桶存在（如果不存在则创建）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- 2. 清理旧策略（避免冲突）
DROP POLICY IF EXISTS "Public avatar read" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete own avatar" ON storage.objects;

-- 3. 创建存储策略
-- 公开读取：任何人都可以查看头像（头像需要公开访问）
CREATE POLICY "Public avatar read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- 已认证用户可以上传自己的头像
-- 路径格式：{userId}/{timestamp}.{ext}
CREATE POLICY "Authenticated users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

-- 已认证用户可以更新自己的头像文件
CREATE POLICY "Authenticated users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = split_part(name, '/', 1)
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

-- 已认证用户可以删除自己的头像文件
CREATE POLICY "Authenticated users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

-- ============================================================
-- 验证：查看当前 storage 策略是否生效
-- ============================================================
SELECT 
  policyname,
  cmd,
  qual as "USING",
  with_check as "WITH_CHECK"
FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage';
