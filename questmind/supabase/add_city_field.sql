-- 给 users 表新增 city 字段（用于艾莉丝天气问候）
ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT DEFAULT NULL;

-- 同时新增 weather_greeted_date 字段（记录上次天气问候的日期，防止当天重复弹出）
-- 该字段存储格式：'YYYY-MM-DD'，纯前端 localStorage 也可以，这里提供 DB 方案备用
-- 实际前端使用 localStorage 实现"当天只弹一次"逻辑，不需要此 DB 字段

-- 注意：在 Supabase 控制台 SQL Editor 里执行此文件即可
