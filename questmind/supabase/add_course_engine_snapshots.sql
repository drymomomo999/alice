-- 课程引擎的轻量云端持久化：在已有 courses 表上追加 snapshot 列，
-- 用于跨设备同步 + 备份。每个 user/goal 一行 JSON 快照。
--
-- 与 add_course_engine.sql 中规范化 13 张表保持正交：
--   规范化表是"知识图谱真源"（便于查询、统计、跨用户聚合）
--   snapshot 列是"客户端运行快照"（用于快速恢复 CourseModel）
-- 上线后两个通道任一可用即可让客户端继续工作。

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS snapshot JSONB,
  ADD COLUMN IF NOT EXISTS snapshot_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_courses_snapshot_user
  ON courses (user_id)
  WHERE snapshot IS NOT NULL;

COMMENT ON COLUMN courses.snapshot IS
  'CourseModel JSON 快照：客户端 localStorage 镜像，用于跨设备恢复';
