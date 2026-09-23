import { useEffect, useRef, useState } from 'react'
import type { Goal } from '@/types'

const DAILY_RESET_KEY = 'questmind:goals:last-daily-reset'

interface GoalRuntimeOptions {
  goals: Goal[]
  stopDailyTask: (goalId: string, taskId: string, markCompleted?: boolean) => void
  resetDailyTasks: () => void
}

/**
 * Owns time-based goal behavior. The page only renders the current snapshot;
 * timer expiry and day-boundary resets stay in one lifecycle boundary.
 */
export function useGoalRuntime({ goals, stopDailyTask, resetDailyTasks }: GoalRuntimeOptions): number {
  const [tick, setTick] = useState(0)
  const goalsRef = useRef(goals)
  goalsRef.current = goals

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((value) => value + 1)
      for (const goal of goalsRef.current) {
        for (const task of goal.dailyTasks || []) {
          if (!task.isRunning || !task.lastResumedAt || !task.duration) continue
          const elapsed = (task.baseElapsed ?? 0) + Math.floor((Date.now() - task.lastResumedAt) / 1000)
          if (elapsed >= task.duration * 60) stopDailyTask(goal.id, task.id, true)
        }
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [stopDailyTask])

  useEffect(() => {
    const resetAtDayBoundary = () => {
      const today = new Date().toISOString().slice(0, 10)
      const lastReset = localStorage.getItem(DAILY_RESET_KEY)
        || normalizeLegacyResetDate(localStorage.getItem('lastDailyTasksReset'))
      if (lastReset === today) return
      resetDailyTasks()
      localStorage.setItem(DAILY_RESET_KEY, today)
    }

    resetAtDayBoundary()
    const timer = window.setInterval(resetAtDayBoundary, 60 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [resetDailyTasks])

  return tick
}

function normalizeLegacyResetDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}
