-- QuestMind 课程理解与自适应复习系统（纯学习层）
-- 可重复执行；所有结论表均保留证据关系，用户私有数据通过 courses.user_id 隔离。

CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  language TEXT CHECK (language IN ('zh', 'en', 'mixed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, goal_id)
);

CREATE TABLE IF NOT EXISTS course_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  attachment_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT,
  document_type TEXT NOT NULL DEFAULT 'other' CHECK (document_type IN ('textbook','lecture_slides','lecture_notes','syllabus_exam_scope','homework','tutorial_exercises','past_exam','mistake_set','other')),
  chapter TEXT,
  page_count INTEGER NOT NULL DEFAULT 1,
  classification_confidence NUMERIC(4,3) NOT NULL DEFAULT 0.35 CHECK (classification_confidence BETWEEN 0 AND 1),
  classification_reasons JSONB NOT NULL DEFAULT '[]',
  corrected_by_user BOOLEAN NOT NULL DEFAULT FALSE,
  processing_status TEXT NOT NULL DEFAULT 'UPLOADED',
  processing_error_code TEXT,
  content_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, attachment_id)
);

CREATE TABLE IF NOT EXISTS document_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES course_documents(id) ON DELETE CASCADE,
  page_or_slide INTEGER NOT NULL,
  block_order INTEGER NOT NULL,
  block_type TEXT NOT NULL CHECK (block_type IN ('title','body','formula','example','exercise','warning','summary','derivation')),
  text_content TEXT NOT NULL,
  visual_emphasis NUMERIC(4,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, page_or_slide, block_order)
);

CREATE TABLE IF NOT EXISTS source_evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES course_documents(id) ON DELETE CASCADE,
  block_id UUID REFERENCES document_blocks(id) ON DELETE SET NULL,
  page_or_slide INTEGER NOT NULL,
  raw_excerpt TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  strength NUMERIC(4,3) NOT NULL CHECK (strength BETWEEN 0 AND 1),
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teacher_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES course_documents(id) ON DELETE CASCADE,
  block_id UUID REFERENCES document_blocks(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES source_evidence(id) ON DELETE CASCADE,
  signal_values JSONB NOT NULL,
  teacher_emphasis NUMERIC(4,3) NOT NULL CHECK (teacher_emphasis BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, block_id)
);

CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  canonical_name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  node_type TEXT NOT NULL CHECK (node_type IN ('formula','concept','theorem','method','skill')),
  chapter TEXT,
  must_understand BOOLEAN NOT NULL DEFAULT FALSE,
  must_memorize BOOLEAN NOT NULL DEFAULT FALSE,
  must_apply BOOLEAN NOT NULL DEFAULT FALSE,
  prerequisites TEXT[] NOT NULL DEFAULT '{}',
  common_errors TEXT[] NOT NULL DEFAULT '{}',
  explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, canonical_name)
);

CREATE TABLE IF NOT EXISTS knowledge_node_evidence (
  knowledge_node_id UUID NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES source_evidence(id) ON DELETE CASCADE,
  match_confidence NUMERIC(4,3) NOT NULL DEFAULT 1 CHECK (match_confidence BETWEEN 0 AND 1),
  PRIMARY KEY (knowledge_node_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS knowledge_edges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  from_node_id UUID NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  to_node_id UUID NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK (relation IN ('prerequisite','related_to','part_of')),
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence_ids UUID[] NOT NULL DEFAULT '{}',
  UNIQUE (course_id, from_node_id, to_node_id, relation)
);

CREATE TABLE IF NOT EXISTS course_node_stats (
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  knowledge_node_id UUID NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  teacher_emphasis NUMERIC(4,3) NOT NULL DEFAULT 0,
  assessment_relevance NUMERIC(4,3) NOT NULL DEFAULT 0,
  prerequisite_centrality NUMERIC(4,3) NOT NULL DEFAULT 0,
  course_importance NUMERIC(4,3) NOT NULL DEFAULT 0,
  importance_level TEXT NOT NULL DEFAULT 'D' CHECK (importance_level IN ('S','A','B','C','D')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (course_id, knowledge_node_id)
);

CREATE TABLE IF NOT EXISTS user_knowledge_state (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  knowledge_node_id UUID NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  mastery NUMERIC(4,3) NOT NULL DEFAULT 0.35 CHECK (mastery BETWEEN 0 AND 1),
  mastery_dimensions JSONB NOT NULL DEFAULT '{"understand":0.35,"remember":0.35,"apply":0.35}',
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.25 CHECK (confidence BETWEEN 0 AND 1),
  last_studied_at TIMESTAMPTZ,
  last_reviewed_at TIMESTAMPTZ,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  hint_count INTEGER NOT NULL DEFAULT 0,
  repeated_error_tags TEXT[] NOT NULL DEFAULT '{}',
  next_review_at TIMESTAMPTZ,
  interval_index INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, course_id, knowledge_node_id)
);

CREATE TABLE IF NOT EXISTS mastery_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  knowledge_node_id UUID NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  error_tag TEXT,
  mastery_before NUMERIC(4,3) NOT NULL,
  mastery_after NUMERIC(4,3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS practice_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  knowledge_node_id UUID NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  correct BOOLEAN NOT NULL,
  hint_count INTEGER NOT NULL DEFAULT 0,
  error_tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS review_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  knowledge_node_id UUID NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  priority NUMERIC(4,3) NOT NULL,
  reason TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL,
  minimum_task TEXT NOT NULL,
  scheduled_for DATE NOT NULL,
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, knowledge_node_id, scheduled_for)
);

CREATE TABLE IF NOT EXISTS study_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  focus_node_ids UUID[] NOT NULL DEFAULT '{}',
  context_summary JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_course_documents_course_status ON course_documents(course_id, processing_status);
CREATE INDEX IF NOT EXISTS idx_source_evidence_course ON source_evidence(course_id, document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_course ON knowledge_nodes(course_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_today ON review_queue(user_id, scheduled_for, priority DESC);
CREATE INDEX IF NOT EXISTS idx_mastery_events_node ON mastery_events(user_id, knowledge_node_id, created_at DESC);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_node_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_node_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_knowledge_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE mastery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS courses_all_own ON courses;
CREATE POLICY courses_all_own ON courses FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['course_documents','document_blocks','source_evidence','teacher_signals','knowledge_nodes','knowledge_node_evidence','knowledge_edges','course_node_stats']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_all_own', table_name);
    IF table_name = 'course_documents' THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (course_id IN (SELECT id FROM courses WHERE user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)))', table_name || '_all_own', table_name);
    ELSIF table_name IN ('document_blocks','teacher_signals') THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (document_id IN (SELECT id FROM course_documents WHERE course_id IN (SELECT id FROM courses WHERE user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))))', table_name || '_all_own', table_name);
    ELSIF table_name = 'knowledge_node_evidence' THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (knowledge_node_id IN (SELECT id FROM knowledge_nodes WHERE course_id IN (SELECT id FROM courses WHERE user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))))', table_name || '_all_own', table_name);
    ELSE
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (course_id IN (SELECT id FROM courses WHERE user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)))', table_name || '_all_own', table_name);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS user_knowledge_state_all_own ON user_knowledge_state;
CREATE POLICY user_knowledge_state_all_own ON user_knowledge_state FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));
DROP POLICY IF EXISTS mastery_events_all_own ON mastery_events;
CREATE POLICY mastery_events_all_own ON mastery_events FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));
DROP POLICY IF EXISTS practice_attempts_all_own ON practice_attempts;
CREATE POLICY practice_attempts_all_own ON practice_attempts FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));
DROP POLICY IF EXISTS review_queue_all_own ON review_queue;
CREATE POLICY review_queue_all_own ON review_queue FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));
DROP POLICY IF EXISTS study_sessions_all_own ON study_sessions;
CREATE POLICY study_sessions_all_own ON study_sessions FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));
