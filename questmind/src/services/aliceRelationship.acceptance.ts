import {
  buildRelationshipContext,
  clearRelationshipMemories,
  deleteRelationshipMemory,
  getRelationshipStage,
  loadRelationshipStore,
  recordRelationshipResponse,
  recordRelationshipUserMessage,
  saveRelationshipStore,
  seedRelationshipFromLegacyProfile,
} from './aliceRelationship.service'

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

export function runRelationshipAcceptanceSuite(): string[] {
  const passed: string[] = []
  const test = (name: string, fn: () => void) => {
    fn()
    passed.push(name)
  }
  const at = (iso: string) => new Date(iso)

  test('01 explicit correction is stored immediately', () => {
    clearRelationshipMemories('t01')
    const store = recordRelationshipUserMessage({ userId: 't01', scene: 'HOME', message: '以后别每次都问我要不要继续。' })
    assert(store.preferences.some(item => item.confidence === 1), 'missing explicit preference')
  })
  test('02 explicit correction is upserted', () => {
    const before = loadRelationshipStore('t01').preferences.length
    recordRelationshipUserMessage({ userId: 't01', scene: 'HOME', message: '以后别每次都问我要不要继续。' })
    assert(loadRelationshipStore('t01').preferences.length === before, 'preference duplicated')
  })
  test('03 cabin preference stays out of goal mode', () => {
    const context = buildRelationshipContext({ userId: 't01', scene: 'GOAL', goalId: 'g1', message: '继续' })
    assert(context.preferences.length === 0, 'cabin preference leaked into goal')
  })
  test('04 project preference stays in its project', () => {
    clearRelationshipMemories('t04')
    recordRelationshipUserMessage({ userId: 't04', scene: 'GOAL', goalId: 'g1', message: '以后请多给具体例子。' })
    assert(buildRelationshipContext({ userId: 't04', scene: 'GOAL', goalId: 'g1', message: '解释一下' }).preferences.length === 1, 'project preference missing')
    assert(buildRelationshipContext({ userId: 't04', scene: 'GOAL', goalId: 'g2', message: '解释一下' }).preferences.length === 0, 'project preference leaked')
  })
  test('05 legacy preferences migrate as global', () => {
    clearRelationshipMemories('t05')
    seedRelationshipFromLegacyProfile('t05', { preferenceTags: ['喜欢简洁回答'] })
    assert(buildRelationshipContext({ userId: 't05', scene: 'GOAL', message: '说说看' }).preferences.length === 1, 'legacy preference missing')
  })
  test('06 future event creates follow-up', () => {
    clearRelationshipMemories('t06')
    const store = recordRelationshipUserMessage({ userId: 't06', scene: 'HOME', message: '明天我要去路演。', now: at('2026-09-07T08:00:00Z') })
    assert(store.followups.length === 1, 'follow-up not created')
  })
  test('07 follow-up appears only in cabin', () => {
    const now = at('2026-09-08T09:00:00Z')
    assert(Boolean(buildRelationshipContext({ userId: 't06', scene: 'HOME', message: '早', now }).followup), 'cabin follow-up missing')
    assert(!buildRelationshipContext({ userId: 't06', scene: 'GOAL', message: '开始', now }).followup, 'follow-up leaked to goal')
  })
  test('08 ask-once follow-up is consumed', () => {
    const now = at('2026-09-08T09:00:00Z')
    const context = buildRelationshipContext({ userId: 't06', scene: 'HOME', message: '早', now })
    recordRelationshipResponse('t06', context, 'HOME', now)
    assert(!buildRelationshipContext({ userId: 't06', scene: 'HOME', message: '又来了', now: at('2026-09-08T10:00:00Z') }).followup, 'ask-once repeated')
  })
  test('09 rejection dismisses pending recall', () => {
    clearRelationshipMemories('t09')
    recordRelationshipUserMessage({ userId: 't09', scene: 'HOME', message: '明天我要去面试。', now: at('2026-09-07T08:00:00Z') })
    recordRelationshipUserMessage({ userId: 't09', scene: 'HOME', message: '这事别再提了。', now: at('2026-09-07T09:00:00Z') })
    assert(loadRelationshipStore('t09').followups.every(item => Boolean(item.dismissedAt)), 'follow-up not dismissed')
  })
  test('10 meaningful milestone creates moment', () => {
    clearRelationshipMemories('t10')
    const store = recordRelationshipUserMessage({ userId: 't10', scene: 'HOME', message: '我们终于把概率论补集搞懂了，我特别开心。' })
    assert(store.moments.length === 1, 'moment not created')
  })
  test('11 ordinary complaint is not promoted to moment', () => {
    clearRelationshipMemories('t11')
    const store = recordRelationshipUserMessage({ userId: 't11', scene: 'HOME', message: '今天食堂的面难吃死了。' })
    assert(store.moments.length === 0, 'ordinary message became moment')
  })
  test('12 recalled moment receives cooldown metadata', () => {
    const context = buildRelationshipContext({ userId: 't10', scene: 'HOME', message: '概率论补集', now: at('2026-09-10T09:00:00Z') })
    recordRelationshipResponse('t10', context, 'HOME', at('2026-09-10T09:00:00Z'))
    assert(loadRelationshipStore('t10').moments[0].recallCount === 1, 'recall count not updated')
  })
  test('13 one preference can be deleted', () => {
    const id = loadRelationshipStore('t01').preferences[0].id
    deleteRelationshipMemory('t01', 'preference', id)
    assert(loadRelationshipStore('t01').preferences.length === 0, 'preference deletion failed')
  })
  test('14 all relationship memories can be cleared', () => {
    clearRelationshipMemories('t10')
    const store = loadRelationshipStore('t10')
    assert(store.preferences.length + store.moments.length + store.followups.length === 0, 'clear failed')
  })
  test('15 new relationship starts at S0', () => {
    clearRelationshipMemories('t15')
    assert(getRelationshipStage('t15') === 'S0', 'unexpected initial stage')
  })
  test('16 confirmed preference advances familiarity to S1', () => {
    recordRelationshipUserMessage({ userId: 't15', scene: 'HOME', message: '以后请少说套话。' })
    assert(getRelationshipStage('t15') === 'S1', 'stage did not advance')
  })
  test('17 dynamic relationship prompt stays under 800 tokens', () => {
    clearRelationshipMemories('t17')
    for (let i = 0; i < 30; i += 1) recordRelationshipUserMessage({ userId: 't17', scene: 'HOME', message: `以后请多给第${i}种非常具体而且详细的解释方式。` })
    const context = buildRelationshipContext({ userId: 't17', scene: 'HOME', message: '继续' })
    assert(context.tokenEstimate <= 800, `budget exceeded: ${context.tokenEstimate}`)
  })
  test('18 no more than five preferences are injected', () => {
    assert(buildRelationshipContext({ userId: 't17', scene: 'HOME', message: '继续' }).preferences.length <= 5, 'too many preferences')
  })
  test('19 voluntary turns are measured from user input', () => {
    assert(loadRelationshipStore('t17').analytics.voluntaryTurns === 30, 'voluntary turn count wrong')
  })
  test('20 safety boundary stays in relationship prompt', () => {
    const prompt = buildRelationshipContext({ userId: 't15', scene: 'HOME', message: '你好' }).prompt
    assert(prompt.includes('不代表恋爱、排他或功能权限'), 'safety boundary missing')
  })

  return passed
}

export function resetAcceptanceStores(): void {
  for (let i = 1; i <= 20; i += 1) {
    const id = `t${String(i).padStart(2, '0')}`
    const store = loadRelationshipStore(id)
    store.preferences = []
    store.moments = []
    store.followups = []
    store.events = []
    saveRelationshipStore(store)
  }
}
