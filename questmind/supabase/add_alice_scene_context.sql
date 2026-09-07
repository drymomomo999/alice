-- Alice 双场景会话隔离：HOME 共享一条小屋历史，GOAL 按 goal_id 隔离。
ALTER TABLE ai_messages
  ADD COLUMN IF NOT EXISTS scene TEXT CHECK (scene IN ('HOME', 'GOAL')),
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ai_messages_alice_scene
  ON ai_messages(user_id, character_id, scene, goal_id, created_at);

COMMENT ON COLUMN ai_messages.scene IS 'Alice 场景：HOME 或 GOAL；旧记录为空，不自动混入新场景上下文';
COMMENT ON COLUMN ai_messages.goal_id IS 'GOAL 场景所属目标；HOME 场景为空';
