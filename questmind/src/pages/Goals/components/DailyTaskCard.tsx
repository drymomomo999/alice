/**
 * 任务卡片
 *
 * 包含计时器控制 + ✨ AI 学习指引按钮。
 * 点击 ✨ 按钮后在卡片下方展开 AI 详细学习指导。
 */
import { useState, useEffect } from 'react'
import {
  Play, Pause, Check, Sparkles, Loader2, SlidersHorizontal,
} from 'lucide-react'
import { askTaskAssistant, buildGoalContextString } from '@/services/ai.service'
import { useUserStore } from '@/store'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import type { DailyTask, Goal } from '@/types'
import type { GoalTaskFeedback } from '@/features/goals/planning'
import { cn } from '@/lib/utils'

interface DailyTaskCardProps {
  task: DailyTask
  goal: Goal
  goalsVersion: number        // 用于触发计时器重渲染
  isStudyGuideOpen: boolean   // 是否展开了学习指引
  onToggleStudyGuide: (taskId: string) => void
  onStartTask: (goalId: string, taskId: string) => void
  onStopTask: (goalId: string, taskId: string, markCompleted?: boolean) => void
  onToggleComplete: (goalId: string, taskId: string) => void
  onTaskFeedback: (taskId: string, feedback: GoalTaskFeedback) => Promise<string | null>
  formatTimeDisplay: (seconds: number) => string
}

export function DailyTaskCard({
  task,
  goal,
  goalsVersion,
  isStudyGuideOpen,
  onToggleStudyGuide,
  onStartTask,
  onStopTask,
  onToggleComplete,
  onTaskFeedback,
  formatTimeDisplay,
}: DailyTaskCardProps) {
  const { user } = useUserStore()
  const [guideContent, setGuideContent] = useState<string | null>(null)
  const [isGuideLoading, setIsGuideLoading] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(task.adaptationNote || null)
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false)

  // 计算已用时间
  const getTaskElapsed = (t: DailyTask): number => {
    if (t.isRunning && t.lastResumedAt) {
      const base = t.baseElapsed ?? 0
      const current = Math.floor((Date.now() - t.lastResumedAt) / 1000)
      return base + current
    }
    return (t.baseElapsed ?? 0) + (t.elapsedSeconds ?? 0)
  }
  const elapsed = getTaskElapsed(task)
  // 引用 goalsVersion 防止 React 编译器优化掉重渲染
  void goalsVersion

  const submitFeedback = async (feedback: GoalTaskFeedback) => {
    setIsFeedbackLoading(true)
    const message = await onTaskFeedback(task.id, feedback)
    setFeedbackMessage(message)
    setShowFeedback(false)
    setIsFeedbackLoading(false)
  }

  // 当展开学习指引时，加载 AI 内容
  useEffect(() => {
    if (!isStudyGuideOpen || guideContent) return

    let cancelled = false
    const fetchGuide = async () => {
      setIsGuideLoading(true)
      try {
        const result = await askTaskAssistant({
          taskTitle: task.title,
          taskDescription: task.description,
          goalTitle: goal.title,
          goalContext: buildGoalContextString(goal) || undefined,
          goalCategory: goal.category,
          userName: user?.nickname || '来访者',
        })
        if (!cancelled) {
          setGuideContent(result)
        }
      } catch {
        if (!cancelled) {
          setGuideContent('获取学习指引失败，请稍后再试。')
        }
      } finally {
        if (!cancelled) {
          setIsGuideLoading(false)
        }
      }
    }

    fetchGuide()
    return () => { cancelled = true }
  }, [isStudyGuideOpen, guideContent, task.title, task.description, goal, user?.nickname])

  return (
    <div>
      {/* 任务主体 */}
      <div className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all',
        task.completed ? 'bg-green-50/50 border-green-200/40' :
        task.isRunning ? 'bg-sakura-pale/40 border-sakura-light/50 shadow-sm' :
        'bg-white border-sakura-light/20 hover:border-sakura-light/40'
      )}>
        {/* 完成复选框 */}
        <button
          onClick={() => onToggleComplete(goal.id, task.id)}
          className={cn(
            'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
            task.completed ? 'bg-green-400 border-green-400' : 'border-gray-300 hover:border-sakura-pink'
          )}
        >
          {task.completed && <Check className="w-3 h-3 text-white" />}
        </button>

        {/* 任务信息 */}
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium truncate', task.completed && 'line-through text-muted-foreground')}>
            {task.title}
          </p>
          {task.duration && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {task.duration}分钟
            </p>
          )}
        </div>

        {/* 操作按钮区 */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* 计时器显示 */}
          <span className={cn(
            'text-xs font-mono tabular-nums',
            task.isRunning ? 'text-sakura font-bold' : 'text-muted-foreground'
          )}>
            {formatTimeDisplay(elapsed)}
          </span>

          {/* ✨ AI 指引按钮（仅在未完成时显示） */}
          {!task.completed && (
            <button
              onClick={() => onToggleStudyGuide(task.id)}
              className={cn(
                'p-1.5 rounded-lg transition-all',
                isStudyGuideOpen
                  ? 'bg-lavender-light/40 text-lavender'
                  : 'bg-sakura-pale text-sakura hover:bg-sakura-pink/15'
              )}
              title="AI 学习指引"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          )}

          {!task.completed && (
            <button onClick={() => setShowFeedback(value => !value)}
              className={cn('p-1.5 rounded-lg transition-all', showFeedback ? 'bg-amber-100 text-amber-600' : 'bg-gray-50 text-gray-500 hover:bg-amber-50 hover:text-amber-600')}
              title="告诉我这项任务哪里不合适">
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          )}

          {/* 播放/暂停按钮 */}
          {!task.completed && (
            task.isRunning ? (
              <button onClick={() => onStopTask(goal.id, task.id, false)}
                className="p-1.5 rounded-lg bg-amber-50 text-amber-500 hover:bg-amber-100 transition-all"
                title="暂停计时">
                <Pause className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button onClick={() => onStartTask(goal.id, task.id)}
                className="p-1.5 rounded-lg bg-sakura-pale text-sakura hover:bg-sakura-pink/15 transition-all"
                title="开始计时">
                <Play className="w-3.5 h-3.5" />
              </button>
            )
          )}
        </div>
      </div>

      {showFeedback && !task.completed && (
        <div className="ml-8 mt-1.5 p-2.5 rounded-xl bg-amber-50 border border-amber-200/60">
          <p className="text-[10px] font-semibold text-amber-700 mb-2">这项任务哪里不合适？我会据此调整后续安排</p>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              ['too_hard', '太难，拆小一点'],
              ['no_time', '今天没时间'],
              ['already_know', '我已经会了'],
              ['blocked', '被前置条件卡住'],
            ] as const).map(([value, label]) => (
              <button key={value} disabled={isFeedbackLoading} onClick={() => submitFeedback(value)}
                className="px-2 py-1.5 rounded-lg bg-white border border-amber-200/70 text-[10px] text-amber-800 hover:bg-amber-100 disabled:opacity-50">
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {feedbackMessage && (
        <div className="ml-8 mt-1 text-[10px] text-amber-700">↳ {feedbackMessage}</div>
      )}

      {/* AI 学习指引展开区域 */}
      {isStudyGuideOpen && (
        <div className="ml-8 mt-1.5 p-3 rounded-xl bg-lavender-light/10 border border-lavender-light/30">
          {isGuideLoading ? (
            <div className="flex items-center gap-2 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-lavender" />
              <span className="text-[11px] text-muted-foreground">正在获取学习指引...</span>
            </div>
          ) : guideContent ? (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-3 h-3 text-lavender" />
                <span className="text-[11px] font-bold text-lavender">AI 学习指导</span>
              </div>
              <MarkdownRenderer content={guideContent} className="text-xs" />
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
