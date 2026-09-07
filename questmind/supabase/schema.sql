-- =====================================================
-- QuestMind 数据库表结构
-- Supabase PostgreSQL Schema
-- 版本: v2 - 修复 RLS 策略使用正确的 auth.uid()
-- =====================================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. 用户表 (users)
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id TEXT UNIQUE NOT NULL,  -- Supabase Auth 的 UID（即 auth.uid()::text）
    email TEXT,
    nickname TEXT NOT NULL DEFAULT '学习新手',
    avatar TEXT,
    level INTEGER DEFAULT 1,
    experience INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 100,
    gems INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    streak_updated_at TIMESTAMPTZ,
    total_goals_completed INTEGER DEFAULT 0,
    total_focus_minutes INTEGER DEFAULT 0,
    -- Onboarding fields
    time_preference TEXT CHECK (time_preference IN ('early', 'night', 'flexible')),
    goal_preferences TEXT[],
    onboarding_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- =====================================================
-- 2. 目标表 (goals)
-- =====================================================
CREATE TABLE IF NOT EXISTS goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    current_status TEXT,  -- 用户当前状态描述（AI 增强）
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'abandoned')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    start_date DATE,
    end_date DATE,
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_user_status ON goals(user_id, status);

-- =====================================================
-- 3. 子目标表 (sub_goals)
-- =====================================================
CREATE TABLE IF NOT EXISTS sub_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_goals_goal_id ON sub_goals(goal_id);

-- =====================================================
-- 3.5. 每日任务表 (daily_tasks)
-- =====================================================
CREATE TABLE IF NOT EXISTS daily_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    duration INTEGER,  -- 预计时长（分钟）
    frequency TEXT DEFAULT 'daily' CHECK (frequency IN ('daily', 'custom')),
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_tasks_goal_id ON daily_tasks(goal_id);

-- =====================================================
-- 4. AI 聊天记录表 (ai_messages)
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id TEXT NOT NULL CHECK (character_id IN ('xiaoSi', 'coach', 'friend', 'rem', 'alice')),
    content TEXT NOT NULL,
    is_user BOOLEAN NOT NULL DEFAULT TRUE,
    scene TEXT CHECK (scene IN ('HOME', 'GOAL')),
    goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_user_id ON ai_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_character ON ai_messages(user_id, character_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_alice_scene ON ai_messages(user_id, character_id, scene, goal_id, created_at);

-- =====================================================
-- 5. 每日任务表 (quests)
-- =====================================================
CREATE TABLE IF NOT EXISTS quests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL CHECK (type IN ('daily', 'weekly', 'special')),
    requirement_type TEXT NOT NULL,
    requirement_count INTEGER NOT NULL,
    reward_coins INTEGER DEFAULT 0,
    reward_gems INTEGER DEFAULT 0,
    reward_experience INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quests_user_id ON quests(user_id);
CREATE INDEX IF NOT EXISTS idx_quests_type ON quests(user_id, type);

-- =====================================================
-- 8. 排行榜表 (leaderboard)
-- =====================================================
CREATE TABLE IF NOT EXISTS leaderboard (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL,
    avatar TEXT,
    level INTEGER DEFAULT 1,
    score INTEGER DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'allTime' CHECK (type IN ('weekly', 'monthly', 'allTime')),
    week_number INTEGER,
    month INTEGER,
    year INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(type, score DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_user ON leaderboard(user_id);

-- =====================================================
-- 9. 虚拟小屋物品表 (room_items)
-- =====================================================
CREATE TABLE IF NOT EXISTS room_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('furniture', 'decoration', 'wallpaper', 'floor')),
    image TEXT NOT NULL,
    price INTEGER DEFAULT 0,
    currency TEXT DEFAULT 'coin' CHECK (currency IN ('coin', 'gem')),
    rarity TEXT DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary'))
);

INSERT INTO room_items (name, type, image, price, currency, rarity)
VALUES
    ('木桌', 'furniture', '/items/wooden_table.png', 100, 'coin', 'common'),
    ('舒适沙发', 'furniture', '/items/sofa.png', 500, 'coin', 'rare'),
    ('落地窗', 'decoration', '/items/window.png', 200, 'coin', 'common'),
    ('仙人掌', 'decoration', '/items/cactus.png', 50, 'coin', 'common'),
    ('简约墙纸', 'wallpaper', '/items/wallpaper_simple.png', 300, 'coin', 'common'),
    ('森林地板', 'floor', '/items/floor_forest.png', 400, 'coin', 'rare')
ON CONFLICT DO NOTHING;

-- =====================================================
-- 10. 用户小屋表 (user_rooms)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    background TEXT DEFAULT '/rooms/default.png',
    placed_items JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 11. 用户头像物品表 (user_avatar_items)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_avatar_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('hair', 'top', 'bottom', 'shoes', 'accessory', 'skin')),
    item_id TEXT NOT NULL,
    equipped BOOLEAN DEFAULT FALSE,
    acquired_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, item_type, item_id)
);

-- =====================================================
-- 12. 用户货币变动记录表 (coin_transactions)
-- =====================================================
CREATE TABLE IF NOT EXISTS coin_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('earn', 'spend', 'bonus', 'penalty')),
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    balance_after INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coin_transactions_user ON coin_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_created ON coin_transactions(created_at DESC);

-- =====================================================
-- 13. 学习打卡记录表 (focus_sessions)
-- =====================================================
CREATE TABLE IF NOT EXISTS focus_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
    duration_minutes INTEGER NOT NULL,
    session_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_focus_sessions_user ON focus_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_date ON focus_sessions(session_date);

-- =====================================================
-- 14. 自动更新时间戳触发器
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_goals_updated_at ON goals;
CREATE TRIGGER update_goals_updated_at
    BEFORE UPDATE ON goals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_quests_updated_at ON quests;
CREATE TRIGGER update_quests_updated_at
    BEFORE UPDATE ON quests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_rooms_updated_at ON user_rooms;
CREATE TRIGGER update_user_rooms_updated_at
    BEFORE UPDATE ON user_rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 15. 行级安全策略 (RLS)
-- 关键：使用 auth.uid() 而不是 current_user
-- =====================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_avatar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;

-- ---------- users ----------
-- 用户只能操作自己的记录（通过 auth_id 与 auth.uid() 对比）
CREATE POLICY "users_select_own" ON users
    FOR SELECT USING (auth_id = auth.uid()::text);

CREATE POLICY "users_insert_own" ON users
    FOR INSERT WITH CHECK (auth_id = auth.uid()::text);

CREATE POLICY "users_update_own" ON users
    FOR UPDATE USING (auth_id = auth.uid()::text);

CREATE POLICY "users_delete_own" ON users
    FOR DELETE USING (auth_id = auth.uid()::text);

-- ---------- goals ----------
CREATE POLICY "goals_all_own" ON goals
    FOR ALL USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- ---------- sub_goals ----------
CREATE POLICY "sub_goals_all_own" ON sub_goals
    FOR ALL USING (
        goal_id IN (
            SELECT id FROM goals WHERE user_id IN (
                SELECT id FROM users WHERE auth_id = auth.uid()::text
            )
        )
    );

-- ---------- daily_tasks ----------
CREATE POLICY "daily_tasks_all_own" ON daily_tasks
    FOR ALL USING (
        goal_id IN (
            SELECT id FROM goals WHERE user_id IN (
                SELECT id FROM users WHERE auth_id = auth.uid()::text
            )
        )
    );

-- ---------- ai_messages ----------
CREATE POLICY "ai_messages_all_own" ON ai_messages
    FOR ALL USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- ---------- quests ----------
CREATE POLICY "quests_all_own" ON quests
    FOR ALL USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- ---------- user_rooms ----------
CREATE POLICY "user_rooms_all_own" ON user_rooms
    FOR ALL USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- ---------- user_avatar_items ----------
CREATE POLICY "user_avatar_items_all_own" ON user_avatar_items
    FOR ALL USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- ---------- coin_transactions ----------
CREATE POLICY "coin_transactions_select_own" ON coin_transactions
    FOR SELECT USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

CREATE POLICY "coin_transactions_insert_own" ON coin_transactions
    FOR INSERT WITH CHECK (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- ---------- focus_sessions ----------
CREATE POLICY "focus_sessions_all_own" ON focus_sessions
    FOR ALL USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- ---------- leaderboard (公开读取) ----------
CREATE POLICY "leaderboard_select_all" ON leaderboard
    FOR SELECT USING (true);

CREATE POLICY "leaderboard_insert_own" ON leaderboard
    FOR INSERT WITH CHECK (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

CREATE POLICY "leaderboard_update_own" ON leaderboard
    FOR UPDATE USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    );

-- ---------- room_items（公开读取，无需 RLS） ----------
-- room_items 不含用户私有数据，直接公开
ALTER TABLE room_items DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 补充：目标上下文 & 文件附件
-- =====================================================

-- 1. 添加 context 列（用户补充的背景信息，供 AI 参考）
ALTER TABLE goals ADD COLUMN IF NOT EXISTS context TEXT;

-- 2. 添加 attachments 列（JSON 数组，存储附件元数据）
ALTER TABLE goals ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

-- 3. 创建 goal-attachments 存储桶
INSERT INTO storage.buckets (id, name, public)
VALUES ('goal-attachments', 'goal-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- 4. RLS：用户只能操作自己目录下的文件
-- 路径约定：goal-attachments/{authUserId}/{goalId}/{uuid}.{ext}
CREATE POLICY "attachments_all_own" ON storage.objects
    FOR ALL USING (
        bucket_id = 'goal-attachments'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
