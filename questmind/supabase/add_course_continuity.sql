-- QuestMind Course Continuity Engine
-- 可重复执行。客户端仍可用 courses.snapshot 离线运行；本迁移为可查询的 revision / event 真源补齐字段。

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS current_stage TEXT,
  ADD COLUMN IF NOT EXISTS active_goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS continuity_version TEXT;

ALTER TABLE sub_goals
  ADD COLUMN IF NOT EXISTS canonical_title TEXT,
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'UPCOMING'
    CHECK (lifecycle_status IN ('LOCKED','UPCOMING','ACTIVE','REVIEW','COMPLETED','SUPERSEDED')),
  ADD COLUMN IF NOT EXISTS node_ids_json JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS source_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE daily_tasks
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (lifecycle_status IN ('PENDING','READY','IN_PROGRESS','DONE','SKIPPED','CANCELLED','OVERDUE')),
  ADD COLUMN IF NOT EXISTS node_ids_json JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS generation_reason TEXT,
  ADD COLUMN IF NOT EXISTS source_revision_id TEXT,
  ADD COLUMN IF NOT EXISTS supersedes_task_id UUID REFERENCES daily_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completion_signal TEXT,
  ADD COLUMN IF NOT EXISTS unlock_condition TEXT;

CREATE TABLE IF NOT EXISTS plan_revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_revision_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('INITIALIZE','DOCUMENT_UPLOAD','LEARNING_EVENT','ROLLBACK','FULL_REPLAN')),
  trigger_id TEXT NOT NULL,
  diff_json JSONB NOT NULL,
  before_state_json JSONB NOT NULL,
  summary TEXT NOT NULL,
  planner_version TEXT NOT NULL,
  reverted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, external_revision_id),
  UNIQUE (course_id, trigger_id, planner_version)
);

CREATE TABLE IF NOT EXISTS course_learning_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_event_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  task_id UUID REFERENCES daily_tasks(id) ON DELETE SET NULL,
  node_ids_json JSONB NOT NULL DEFAULT '[]',
  event_type TEXT NOT NULL CHECK (event_type IN ('TASK_DONE','QUIZ_RESULT','USER_CONFUSION','ERROR_RECORDED','REVIEW_DONE')),
  score NUMERIC(5,4),
  confidence NUMERIC(5,4),
  payload_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_revisions_goal_created ON plan_revisions (goal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_learning_events_goal_created ON course_learning_events (goal_id, created_at DESC);

ALTER TABLE plan_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_learning_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_revisions_all_own ON plan_revisions;
CREATE POLICY plan_revisions_all_own ON plan_revisions FOR ALL
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

DROP POLICY IF EXISTS course_learning_events_all_own ON course_learning_events;
CREATE POLICY course_learning_events_all_own ON course_learning_events FOR ALL
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));
