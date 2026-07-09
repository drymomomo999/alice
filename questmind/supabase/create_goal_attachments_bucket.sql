-- ============================================================
-- 创建 goal-attachments 存储桶（用于目标附件上传）
-- 在 Supabase Dashboard → SQL Editor 中执行此脚本
-- ============================================================

-- 1. 创建公开 bucket（如果不存在）
insert into storage.buckets (id, name, public)
values ('goal-attachments', 'goal-attachments', true)
on conflict (id) do nothing;

-- 2. RLS 策略：允许认证用户上传自己的附件
-- 路径约定: {authUserId}/{goalId}/{fileId}.{ext}
create policy "Allow authenticated uploads"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'goal-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. RLS 策略：允许认证用户读取附件
create policy "Allow authenticated reads"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'goal-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. RLS 策略：允许认证用户删除自己的附件
create policy "Allow authenticated deletes"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'goal-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
