-- Goal domain fields used by the current client. Safe to run more than once.
ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS category TEXT;

DO $$ BEGIN
  ALTER TABLE goals ADD CONSTRAINT goals_category_check
    CHECK (category IS NULL OR category IN ('study', 'fitness', 'reading', 'exam', 'career', 'language', 'skill', 'other'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE sub_goals
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS day_range TEXT;

ALTER TABLE daily_tasks
  ADD COLUMN IF NOT EXISTS day_index INTEGER,
  ADD COLUMN IF NOT EXISTS sub_goal_index INTEGER,
  ADD COLUMN IF NOT EXISTS difficulty_level TEXT,
  ADD COLUMN IF NOT EXISTS resource_reference TEXT,
  ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS original_day_index INTEGER,
  ADD COLUMN IF NOT EXISTS last_feedback TEXT,
  ADD COLUMN IF NOT EXISTS last_feedback_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS adaptation_note TEXT;

DO $$ BEGIN
  ALTER TABLE daily_tasks ADD CONSTRAINT daily_tasks_difficulty_level_check
    CHECK (difficulty_level IS NULL OR difficulty_level IN ('easy', 'medium', 'hard'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE daily_tasks ADD CONSTRAINT daily_tasks_last_feedback_check
    CHECK (last_feedback IS NULL OR last_feedback IN ('too_hard', 'no_time', 'already_know', 'blocked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
