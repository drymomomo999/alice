-- 艾莉丝的生活感：私人日记、低频分享及兴趣反馈。

CREATE TABLE IF NOT EXISTS alice_diary_entries (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    title TEXT NOT NULL CHECK (char_length(title) <= 80),
    content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
    mood TEXT NOT NULL DEFAULT 'soft' CHECK (mood IN ('sunny', 'soft', 'thoughtful', 'quiet')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, entry_date)
);

CREATE TABLE IF NOT EXISTS alice_share_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    category_weights JSONB NOT NULL DEFAULT '{"technology":0.62,"science":0.58,"culture":0.56,"world":0.42,"games":0.48,"life":0.64}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alice_shared_stories (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('technology', 'science', 'culture', 'world', 'games', 'life')),
    title TEXT NOT NULL CHECK (char_length(title) <= 300),
    summary TEXT NOT NULL CHECK (char_length(summary) <= 600),
    url TEXT,
    source TEXT,
    shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reaction TEXT NOT NULL DEFAULT 'neutral' CHECK (reaction IN ('interested', 'neutral', 'not_interested')),
    reacted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alice_diary_user_date
    ON alice_diary_entries(user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_alice_stories_user_shared
    ON alice_shared_stories(user_id, shared_at DESC);

ALTER TABLE alice_diary_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE alice_share_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE alice_shared_stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alice_diary_all_own" ON alice_diary_entries;
CREATE POLICY "alice_diary_all_own" ON alice_diary_entries FOR ALL
    USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))
    WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

DROP POLICY IF EXISTS "alice_share_preferences_all_own" ON alice_share_preferences;
CREATE POLICY "alice_share_preferences_all_own" ON alice_share_preferences FOR ALL
    USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))
    WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

DROP POLICY IF EXISTS "alice_shared_stories_all_own" ON alice_shared_stories;
CREATE POLICY "alice_shared_stories_all_own" ON alice_shared_stories FOR ALL
    USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))
    WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

COMMENT ON TABLE alice_diary_entries IS '艾莉丝每天至多一篇的自然语言日记，不存放内部运行日志';
COMMENT ON TABLE alice_share_preferences IS '用户对艾莉丝分享主题的渐进式兴趣权重';
COMMENT ON TABLE alice_shared_stories IS '已经自然分享过的内容及用户后续反馈';
