-- Execution feedback that powers explainable, incremental plan adjustments.
ALTER TABLE daily_tasks
  ADD COLUMN IF NOT EXISTS original_day_index INTEGER,
  ADD COLUMN IF NOT EXISTS last_feedback TEXT,
  ADD COLUMN IF NOT EXISTS last_feedback_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS adaptation_note TEXT;

DO $$ BEGIN
  ALTER TABLE daily_tasks ADD CONSTRAINT daily_tasks_last_feedback_check
    CHECK (last_feedback IS NULL OR last_feedback IN ('too_hard', 'no_time', 'already_know', 'blocked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
