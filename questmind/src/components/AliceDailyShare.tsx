import { useEffect, useState } from 'react'
import { useAIChatStore, useUserStore } from '@/store'
import { buildProactiveShareMessage, loadAliceLifeStore, planDailyAliceShare, recordSharedStory, type AliceSharedStory } from '@/services/aliceLife.service'
import { hydrateAliceLifeFromCloud, prepareDailyAliceShare, syncAliceLifeToCloud } from '@/services/aliceLifeCloud.service'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'

const jobs = new Map<string, Promise<void>>()
async function ensureDailyShare(userId: string, demo: boolean) {
  const existing = jobs.get(userId)
  if (existing) return existing
  const job = (async () => {
    if (!demo) await hydrateAliceLifeFromCloud(userId)
    const candidate = await prepareDailyAliceShare(userId)
    if (!candidate || useUserStore.getState().user?.id !== userId || !planDailyAliceShare(userId)) return
    const content = buildProactiveShareMessage(candidate)
    useAIChatStore.getState().addMessage('alice', { characterId: 'alice', content, isUser: false, scene: 'HOME' })
    const life = recordSharedStory(userId, candidate)
    window.dispatchEvent(new Event('questmind:daily-share'))
    if (!demo) {
      void syncAliceLifeToCloud(life).catch(console.warn)
      void useAIChatStore.getState().saveToDb(userId, 'alice', content, false, 'HOME').catch(console.warn)
    }
  })().finally(() => jobs.delete(userId))
  jobs.set(userId, job)
  return job
}

export function AliceDailyShare() {
  const { user, isDemo } = useUserStore()
  const [story, setStory] = useState<AliceSharedStory>()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!user) return
    let active = true
    const update = (show = false) => {
      if (!active) return
      setStory(loadAliceLifeStore(user.id).stories[0])
      if (show) setOpen(true)
    }
    const check = () => {
      if (document.visibilityState === 'hidden') return
      update()
      void ensureDailyShare(user.id, isDemo).then(() => update()).catch(console.warn)
    }
    check()
    const timer = window.setInterval(check, 60000)
    document.addEventListener('visibilitychange', check)
    const reveal = () => update(true)
    window.addEventListener('questmind:daily-share', reveal)
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', check); window.removeEventListener('questmind:daily-share', reveal) }
  }, [user, isDemo])
  if (!story) return null
  return <div className="fixed right-4 top-16 z-40 max-w-sm">
    <button onClick={() => setOpen(!open)} className="rounded-2xl border border-sakura-light bg-white px-4 py-2 text-sm text-sakura shadow-sm" aria-expanded={open}>🌸 艾莉丝的每日分享</button>
    {open && <section className="mt-2 max-h-[60vh] overflow-auto rounded-2xl border border-sakura-light bg-white p-5 shadow-lg" aria-label="每日分享">
      <div className="flex justify-between gap-4"><time className="text-xs text-gray-400">{new Date(story.sharedAt).toLocaleDateString()}</time><button onClick={() => setOpen(false)} aria-label="收起分享">×</button></div>
      <h2 className="my-3 font-semibold">{story.title}</h2>
      <MarkdownRenderer content={story.summary} />
      {story.url && /^https?:\/\//.test(story.url) && <a className="mt-3 block text-sm text-sakura underline" href={story.url} target="_blank" rel="noreferrer">阅读来源{story.source ? ` · ${story.source}` : ''}</a>}
      <p className="mt-3 text-xs text-gray-400">也已放进小屋聊天记录，可以接着聊。</p>
    </section>}
  </div>
}
