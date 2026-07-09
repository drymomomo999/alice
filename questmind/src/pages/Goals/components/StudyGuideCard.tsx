/**
 * AI 学习指南概览卡片
 *
 * 在任务列表上方展示，汇总需要掌握的核心知识。
 * 调用 generateStudySummary() 生成内容，支持折叠/展开。
 *
 * 改进（2026-06-01）：新增 documentTexts prop，把附件文档传入 AI，
 * 让指南基于真实资料内容而不是泛化猜测。
 */
import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Sparkles, Loader2 } from 'lucide-react'
import { generateStudySummary } from '@/services/ai.service'
import { useUserStore } from '@/store'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import type { DailyTask } from '@/types'
import { cn } from '@/lib/utils'

interface StudyGuideCardProps {
  goalTitle: string
  goalContext?: string
  goalCategory?: string
  /** 附件文档内容（可传多个），让 AI 基于真实资料生成精准指南 */
  documentTexts?: { name: string; text: string }[]
  dailyTasks: DailyTask[]
}

export function StudyGuideCard({
  goalTitle,
  goalContext,
  goalCategory,
  documentTexts,
  dailyTasks,
}: StudyGuideCardProps) {
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
          goalCategory,
          documentTexts,
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
  // documentTexts 用 JSON 字符串化避免引用变化导致无限触发
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalTitle, goalContext, goalCategory, dailyTasks, user?.nickname,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      JSON.stringify(documentTexts?.map(d => d.name))])

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
          AI 学习指南
          {documentTexts && documentTexts.length > 0 && (
            <span className="text-[10px] text-lavender/60 font-normal">· 基于上传资料</span>
          )}
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
              <span className="text-[11px] text-muted-foreground">
                {documentTexts && documentTexts.length > 0
                  ? '正在读取资料，整理学习要点...'
                  : '正在整理学习要点...'}
              </span>
            </div>
          ) : summary ? (
            <MarkdownRenderer content={summary} className="text-xs" />
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
