-- 独立“课件精学”学习档案。
-- 本地可离线使用；部署此迁移后会在登录状态下自动跨设备同步。

CREATE TABLE IF NOT EXISTS courseware_studies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pptx', 'pdf', 'docx', 'text')),
  file_size BIGINT NOT NULL DEFAULT 0,
  source_text TEXT NOT NULL DEFAULT '',
  analysis_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_courseware_studies_user_updated
  ON courseware_studies(user_id, updated_at DESC);

ALTER TABLE courseware_studies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS courseware_studies_all_own ON courseware_studies;
CREATE POLICY courseware_studies_all_own ON courseware_studies
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = courseware_studies.user_id
        AND users.auth_id = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = courseware_studies.user_id
        AND users.auth_id = auth.uid()::text
    )
  );
