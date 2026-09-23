# 艾莉丝日记与低频分享部署

本功能采用“本地可用、云端增强”的方式：未部署数据库或资讯函数时，日记和兴趣仍保存在当前设备；部署后才会跨设备同步，并获取实时公开资讯。

## Supabase 部署

1. 在 Supabase SQL Editor 执行 `supabase/add_alice_life.sql`。
2. 部署资讯函数：

   ```powershell
   supabase functions deploy alice-share
   ```

3. 保持 Edge Function 的 JWT 校验开启。前端通过当前登录会话调用，不需要新增第三方 API Key。

## 验收

```powershell
npm run test:alice-life
npm run test:relationship
npm run build
```

登录后在“艾莉丝的小屋”右上角打开日记本。一天内的日记只会有一篇；资讯分享默认至少间隔四天，明确询问新闻时不受普通随机门槛限制。对分享回复“有意思、想听更多”或“没兴趣、换个话题”会调整对应主题权重。

## 数据说明

- `alice_diary_entries`：自然语言日记，每位用户每天最多一篇。
- `alice_share_preferences`：科技、科学、文化、世界、游戏、生活六类兴趣权重。
- `alice_shared_stories`：已分享内容、来源链接和后续兴趣反馈。

三张表都启用 RLS，只允许当前登录用户访问自己的数据。实时资讯由 `alice-share` 从公开来源取回；调用失败时仅使用无时效的小话题，不会伪装成“今天的新闻”。
