-- Alice 关系连续性系统：显式偏好、共同经历、一次性回访、关系阶段和交互事件。

CREATE TABLE IF NOT EXISTS relationship_preferences (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    value_json JSONB NOT NULL,
    confidence REAL NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
    source TEXT NOT NULL DEFAULT 'explicit' CHECK (source IN ('explicit', 'inferred')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, scope, key)
);

CREATE TABLE IF NOT EXISTS relationship_moments (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    summary TEXT NOT NULL CHECK (char_length(summary) <= 240),
    scope TEXT NOT NULL,
    tone TEXT,
    significance REAL NOT NULL DEFAULT 0.5 CHECK (significance BETWEEN 0 AND 1),
    last_recalled_at TIMESTAMPTZ,
    recall_count INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    embedding JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS relationship_followups (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    summary TEXT NOT NULL,
    scope TEXT NOT NULL,
    earliest_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    priority REAL NOT NULL DEFAULT 0.5 CHECK (priority BETWEEN 0 AND 1),
    ask_once BOOLEAN NOT NULL DEFAULT TRUE,
    asked_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS relationship_state (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    stage TEXT NOT NULL DEFAULT 'S0' CHECK (stage IN ('S0', 'S1', 'S2', 'S3')),
    banter_level REAL NOT NULL DEFAULT 0.08 CHECK (banter_level BETWEEN 0 AND 1),
    curiosity_level REAL NOT NULL DEFAULT 0.48 CHECK (curiosity_level BETWEEN 0 AND 1),
    warmth_level REAL NOT NULL DEFAULT 0.62 CHECK (warmth_level BETWEEN 0 AND 1),
    self_pride_level REAL NOT NULL DEFAULT 0.03 CHECK (self_pride_level BETWEEN 0 AND 1),
    last_stage_change_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS relationship_interaction_events (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relationship_preferences_user_scope
    ON relationship_preferences(user_id, scope, active, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_relationship_moments_user_scope
    ON relationship_moments(user_id, scope, active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_relationship_followups_due
    ON relationship_followups(user_id, earliest_at, expires_at)
    WHERE dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_relationship_events_user_created
    ON relationship_interaction_events(user_id, created_at DESC);

ALTER TABLE relationship_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationship_moments ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationship_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationship_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationship_interaction_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "relationship_preferences_all_own" ON relationship_preferences;
CREATE POLICY "relationship_preferences_all_own" ON relationship_preferences FOR ALL
    USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))
    WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

DROP POLICY IF EXISTS "relationship_moments_all_own" ON relationship_moments;
CREATE POLICY "relationship_moments_all_own" ON relationship_moments FOR ALL
    USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))
    WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

DROP POLICY IF EXISTS "relationship_followups_all_own" ON relationship_followups;
CREATE POLICY "relationship_followups_all_own" ON relationship_followups FOR ALL
    USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))
    WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

DROP POLICY IF EXISTS "relationship_state_all_own" ON relationship_state;
CREATE POLICY "relationship_state_all_own" ON relationship_state FOR ALL
    USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))
    WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

DROP POLICY IF EXISTS "relationship_events_all_own" ON relationship_interaction_events;
CREATE POLICY "relationship_events_all_own" ON relationship_interaction_events FOR ALL
    USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))
    WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));
