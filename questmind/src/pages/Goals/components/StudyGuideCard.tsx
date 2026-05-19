/**
 * AI 学习指南概览卡片
 *
 * 在每日任务列表上方展示，汇总今天需要掌握的核心知识。
 * 调用 generateStudySummary() 生成内容，支持折叠/展开。
 */
import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Sparkles, Loader2 } from 'lucide-react'
import { generateStudySummary } from '@/services/ai.service'
import { useUserStore } from '@/store'
import type { DailyTask } from '@/types'
import { cn } from '@/lib/utils'

interface StudyGuideCardProps {
  goalTitle: string
  goalContext?: string
  dailyTasks: DailyTask[]
}

export function StudyGuideCard({ goalTitle, goalContext, dailyTasks }: StudyGuideCardProps) {
  const { user } = useUserStore()
  const [isExpanded, setIsExpanded] = useState(true)
  const [summary, setSummary] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // 当目标或任务变化时重新生成
  useEffect(() => {
    if (dailyTasks.length === 0) {
      setSummary(null)
      return
    }

    let cancelled = false
    const fetchSummary = async () => {
      setIsLoading(true)
      try {
        const result = await generateStudySummary({
          goalTitle,
          goalContext,
          dailyTasks,
          userName: user?.nickname || '来访者',
        })
        if (!cancelled) {
          setSummary(result)
        }
      } catch {
        if (!cancelled) {
          setSummary('获取学习指南失败，请稍后再试。')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchSummary()
    return () => { cancelled = true }
  }, [goalTitle, goalContext, dailyTasks, user?.nickname])

  // 没有任务时不显示
  if (dailyTasks.length === 0) return null

  return (
    <div className={cn(
      'rounded-xl border transition-all',
      'bg-lavender-light/10 border-lavender-light/30'
    )}>
      {/* 标题栏 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-left"
      >
        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-lavender" />
          今日学习指南
        </span>
        {isExpanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>

      {/* 内容区域 */}
      <AnimateExpand expanded={isExpanded}>
        <div className="px-3.5 pb-3 pt-0">
          {isLoading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-lavender" />
              <span className="text-[11px] text-muted-foreground">正在整理学习要点...</span>
            </div>
          ) : summary ? (
            <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {summary}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">点击任务上的 ✨ 按钮获取详细学习指导</p>
          )}
        </div>
      </AnimateExpand>
    </div>
  )
}

/**
 * 简易展开/收起动画组件
 */
function AnimateExpand({ expanded, children }: { expanded: boolean; children: React.ReactNode }) {
  if (!expanded) return null
  return <>{children}</>
}
