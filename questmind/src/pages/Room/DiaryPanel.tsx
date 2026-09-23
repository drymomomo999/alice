import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Feather, X } from 'lucide-react'
import { loadAliceLifeStore, type AliceDiaryEntry } from '@/services/aliceLife.service'

interface DiaryPanelProps {
  userId: string
  onClose: () => void
}

const moodMarks: Record<AliceDiaryEntry['mood'], string> = {
  sunny: '☀',
  soft: '❀',
  thoughtful: '☁',
  quiet: '☾',
}

function formatDiaryDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`)
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long', day: 'numeric', weekday: 'short',
  }).format(parsed)
}

export function DiaryPanel({ userId, onClose }: DiaryPanelProps) {
  const entries = useMemo(() => loadAliceLifeStore(userId).diary, [userId])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#4a3440]/25 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.section
        initial={{ opacity: 0, y: 24, rotate: -0.5 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        exit={{ opacity: 0, y: 16 }}
        className="relative w-full max-w-xl max-h-[78vh] overflow-hidden rounded-[24px] shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, rgba(255,252,244,.98), rgba(255,244,241,.98))',
          border: '1px solid rgba(196,139,135,.28)',
        }}
        onClick={(event) => event.stopPropagation()}
        aria-label="艾莉丝的日记"
      >
        <div className="absolute inset-y-0 left-9 w-px bg-rose-200/65" />
        <header className="relative flex items-center justify-between px-7 py-5 border-b border-rose-100/80">
          <div className="flex items-center gap-3 pl-4">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-rose-100/70 text-rose-500">
              <Feather className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-serif text-lg font-semibold tracking-wide text-rose-900">艾莉丝的日记</h2>
              <p className="mt-0.5 text-[11px] text-rose-400">一些想悄悄留下来的日常</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-rose-400 transition-colors hover:bg-rose-100/70 hover:text-rose-600"
            aria-label="合上日记"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="relative max-h-[62vh] overflow-y-auto px-7 py-4 pl-14">
          {entries.length === 0 ? (
            <div className="py-16 text-center font-serif text-sm leading-7 text-rose-400/80">
              <p>第一页还是空白的。</p>
              <p>等我们多聊一会儿，也许艾莉丝今晚会写点什么。</p>
            </div>
          ) : (
            <div className="space-y-7">
              {entries.map(entry => (
                <article key={entry.id} className="relative border-b border-rose-100/80 pb-7 last:border-0">
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <div>
                      <time className="font-serif text-xs tracking-wide text-rose-400">{formatDiaryDate(entry.date)}</time>
                      <h3 className="mt-1 font-serif text-base font-semibold text-rose-900/90">{entry.title}</h3>
                    </div>
                    <span className="text-sm text-amber-500/70" aria-label={`心情：${entry.mood}`}>
                      {moodMarks[entry.mood]}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap font-serif text-[15px] leading-8 tracking-[0.03em] text-stone-700/90">
                    {entry.content}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      </motion.section>
    </motion.div>
  )
}
