const TIME_WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/**
 * 获取当前时间的人性化描述，注入 AI system prompt
 * 让角色有现实时间感，配合历史消息里的时间标记，能区分"昨晚说的"和"今天说的"
 *
 * 独立放此文件，避免 alice.service / aliceProfile.service 之间产生循环依赖。
 */
export function getCurrentTimeContext(): string {
  const now = new Date()
  const month = now.getMonth() + 1
  const date = now.getDate()
  const day = TIME_WEEKDAYS[now.getDay()]
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const hour = now.getHours()
  let period: string
  if (hour < 6) period = '凌晨'
  else if (hour < 11) period = '上午'
  else if (hour < 13) period = '中午'
  else if (hour < 18) period = '下午'
  else if (hour < 22) period = '晚上'
  else period = '深夜'
  return `现在是 ${month}月${date}日 星期${day} ${hh}:${mm}，${period}。`
}
