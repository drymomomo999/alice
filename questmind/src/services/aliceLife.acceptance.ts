import {
  buildDiaryPrompt,
  buildProactiveShareMessage,
  buildShareRuntimePrompt,
  getEvergreenShare,
  loadAliceLifeStore,
  planAliceShare,
  planDailyAliceShare,
  recordSharedStory,
  recordShareReaction,
  shouldWriteAliceDiary,
  upsertDiaryEntry,
} from './aliceLife.service'
import type { AIMessage } from '@/types'

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

function message(content: string, timestamp: string, isUser = true): AIMessage {
  return { id: `${timestamp}-${isUser}`, characterId: 'alice', content, timestamp, isUser, scene: 'HOME' }
}

export function runAliceLifeAcceptanceSuite(): string[] {
  const passed: string[] = []
  const test = (name: string, fn: () => void) => {
    fn()
    passed.push(name)
  }

  test('01 diary is one entry per local day', () => {
    upsertDiaryEntry({ userId: 'life01', content: '今天第一次写下来的心情。', now: new Date('2026-09-07T10:00:00') })
    upsertDiaryEntry({ userId: 'life01', content: '晚上又想起了这件小事。', now: new Date('2026-09-07T20:00:00') })
    const store = loadAliceLifeStore('life01')
    assert(store.diary.length === 1 && store.diary[0].content.includes('晚上'), 'same-day diary was not updated')
  })
  test('02 diary text removes internal log language', () => {
    upsertDiaryEntry({ userId: 'life02', content: '# 日志：\n- system: 数据库评分：今天很好。', now: new Date('2026-09-07T10:00:00') })
    const content = loadAliceLifeStore('life02').diary[0].content
    assert(!/日志|system|数据库|评分|^- /m.test(content), 'internal language leaked into diary')
  })
  test('03 meaningful conversation can trigger diary', () => {
    const history = [message('今天终于把那件事做完了，很开心。', '2026-09-07T10:00:00.000Z')]
    assert(shouldWriteAliceDiary('life03', history, new Date('2026-09-07T18:00:00.000Z')), 'meaningful moment did not trigger')
  })
  test('04 diary prompt forbids fabricated facts and internals', () => {
    const prompt = buildDiaryPrompt('小明', [message('今天聊聊吧', '2026-09-07T10:00:00.000Z')])
    assert(prompt.includes('不要编造天气') && prompt.includes('第一人称') && prompt.includes('不是程序'), 'diary guardrails missing')
  })
  test('05 explicit news request creates a share plan', () => {
    assert(planAliceShare('life05', '最近有什么有趣的新闻吗？', new Date('2026-09-07T10:00:00')) !== null, 'explicit request should be honored')
  })
  test('06 difficult moment suppresses sharing', () => {
    assert(planAliceShare('life06', '我今天真的崩溃了，别说了', new Date('2026-09-07T10:00:00')) === null, 'sharing interrupted distress')
  })
  test('07 four-day cooldown keeps frequency low', () => {
    const first = getEvergreenShare('technology')
    recordSharedStory('life07', first, new Date('2026-09-07T10:00:00'))
    assert(planAliceShare('life07', '随便聊聊', new Date('2026-09-10T10:00:00')) === null, 'cooldown was not enforced')
  })
  test('08 positive feedback raises category preference', () => {
    recordSharedStory('life08', getEvergreenShare('science'), new Date('2026-09-07T10:00:00'))
    const before = loadAliceLifeStore('life08').categoryWeights.science
    recordShareReaction('life08', '这个很有意思，我想听更多', new Date('2026-09-07T11:00:00'))
    assert(loadAliceLifeStore('life08').categoryWeights.science > before, 'positive feedback was not learned')
  })
  test('09 negative feedback lowers category preference once', () => {
    recordSharedStory('life09', getEvergreenShare('games'), new Date('2026-09-07T10:00:00'))
    const before = loadAliceLifeStore('life09').categoryWeights.games
    recordShareReaction('life09', '这个我没兴趣，换个话题吧', new Date('2026-09-07T11:00:00'))
    const after = loadAliceLifeStore('life09').categoryWeights.games
    recordShareReaction('life09', '还是不感兴趣', new Date('2026-09-07T12:00:00'))
    assert(after < before && loadAliceLifeStore('life09').categoryWeights.games === after, 'negative feedback was miscounted')
  })
  test('10 share prompt stays conversational and optional', () => {
    const prompt = buildShareRuntimePrompt(getEvergreenShare('life'))
    assert(prompt.includes('一两句话') && prompt.includes('可以完全不提') && prompt.includes('不要说“根据你的偏好”'), 'sharing style guardrails missing')
  })
  test('11 daily share is planned once per local day', () => {
    const first = planDailyAliceShare('life11', new Date('2026-09-07T10:00:00'))
    assert(first !== null, 'daily share should be planned')
    recordSharedStory('life11', getEvergreenShare(first!), new Date('2026-09-07T10:00:00'))
    assert(planDailyAliceShare('life11', new Date('2026-09-07T18:00:00')) === null, 'daily share duplicated on same day')
    assert(planDailyAliceShare('life11', new Date('2026-09-08T10:00:00')) !== null, 'next day share was not planned')
  })
  test('12 proactive share is a natural message with optional link', () => {
    const text = buildProactiveShareMessage({ category: 'science', title: '一个新发现', summary: '这件事很有意思。', url: 'https://example.com', isCurrent: true })
    assert(text.includes('我今天看到') && text.includes('https://example.com'), 'proactive share message lost context or link')
  })

  return passed
}
