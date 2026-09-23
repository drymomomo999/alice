import type { DailyTask, Goal } from '@/types'
import type { GoalPlanResult } from '@/services/ai.service'

export interface GoalPlanIssue {
  severity: 'error' | 'warning'
  message: string
  taskIndex?: number
}

export interface GoalTaskSchedule {
  dayNumber: number
  overdue: DailyTask[]
  today: DailyTask[]
  upcoming: DailyTask[]
  completed: DailyTask[]
}

export type GoalTaskFeedback = NonNullable<DailyTask['lastFeedback']>

export interface GoalTaskAdjustment {
  tasks: DailyTask[]
  summary: string
  affectedTaskIds: string[]
}

const DAY_MS = 24 * 60 * 60 * 1000

function localDayNumber(value: Date): number {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / DAY_MS
}

export function getGoalDayNumber(goal: Pick<Goal, 'startDate'>, now = new Date()): number {
  const start = new Date(goal.startDate)
  if (Number.isNaN(start.getTime())) return 1
  return Math.max(1, Math.floor(localDayNumber(now) - localDayNumber(start)) + 1)
}

/**
 * Turns the flat AI task list into an execution view. Tasks without a day are
 * treated as available today so older and manually-created goals keep working.
 */
export function scheduleGoalTasks(goal: Goal, now = new Date()): GoalTaskSchedule {
  const dayNumber = getGoalDayNumber(goal, now)
  const result: GoalTaskSchedule = { dayNumber, overdue: [], today: [], upcoming: [], completed: [] }

  for (const task of goal.dailyTasks || []) {
    if (task.completed) {
      result.completed.push(task)
    } else if ((!task.dayIndex && task.frequency === 'daily') || !task.dayIndex || task.dayIndex === dayNumber) {
      result.today.push(task)
    } else if (task.dayIndex < dayNumber) {
      result.overdue.push(task)
    } else {
      result.upcoming.push(task)
    }
  }

  const byPlanOrder = (a: DailyTask, b: DailyTask) =>
    (a.dayIndex || dayNumber) - (b.dayIndex || dayNumber) || a.orderIndex - b.orderIndex
  result.overdue.sort(byPlanOrder)
  result.today.sort(byPlanOrder)
  result.upcoming.sort(byPlanOrder)
  result.completed.sort(byPlanOrder)
  return result
}

function difficultyBefore(value: DailyTask['difficultyLevel']): DailyTask['difficultyLevel'] {
  if (value === 'hard') return 'medium'
  return 'easy'
}

function inferDailyBudget(tasks: DailyTask[]): number {
  const minutesByDay = new Map<number, number>()
  for (const task of tasks) {
    if (!task.dayIndex || task.completed) continue
    minutesByDay.set(task.dayIndex, (minutesByDay.get(task.dayIndex) || 0) + (task.duration || 0))
  }
  const planned = [...minutesByDay.values()].filter(Boolean).sort((a, b) => a - b)
  if (planned.length === 0) return 45
  return Math.max(15, planned[Math.floor(planned.length / 2)])
}

function findAvailableDay(tasks: DailyTask[], fromDay: number, duration: number, budget: number, maxDay: number): number {
  const load = new Map<number, number>()
  for (const task of tasks) {
    if (!task.completed && task.dayIndex) {
      load.set(task.dayIndex, (load.get(task.dayIndex) || 0) + (task.duration || 0))
    }
  }
  for (let day = Math.max(1, fromDay); day <= Math.max(fromDay, maxDay); day += 1) {
    if ((load.get(day) || 0) + duration <= budget) return day
  }
  return Math.max(fromDay, maxDay)
}

/**
 * Applies a small, explainable adjustment after real execution feedback. The
 * deterministic rules keep the plan stable; AI can still explain or refine it
 * later without being allowed to silently replace the whole schedule.
 */
export function applyGoalTaskFeedback(
  goal: Goal,
  taskId: string,
  feedback: GoalTaskFeedback,
  now = new Date(),
): GoalTaskAdjustment {
  const tasks = (goal.dailyTasks || []).map(task => ({ ...task }))
  const taskIndex = tasks.findIndex(task => task.id === taskId)
  if (taskIndex < 0) throw new Error('没有找到需要调整的任务')

  const task = tasks[taskIndex]
  const dayNumber = getGoalDayNumber(goal, now)
  const originalDayIndex = task.originalDayIndex || task.dayIndex || dayNumber
  const feedbackAt = now.toISOString()
  const budget = inferDailyBudget(tasks)
  const goalDurationDays = Math.ceil((new Date(goal.endDate).getTime() - new Date(goal.startDate).getTime()) / DAY_MS)
  const maxDay = Math.max(
    dayNumber + 7,
    ...tasks.map(item => item.dayIndex || 1),
    Number.isFinite(goalDurationDays) && goalDurationDays > 0 ? goalDurationDays : dayNumber + 7,
  )
  const base = {
    ...task,
    originalDayIndex,
    lastFeedback: feedback,
    lastFeedbackAt: feedbackAt,
    isRunning: false,
    lastResumedAt: undefined,
  }

  if (feedback === 'too_hard') {
    const nextDuration = Math.max(10, Math.round((task.duration || 30) * 0.65 / 5) * 5)
    tasks[taskIndex] = {
      ...base,
      duration: nextDuration,
      difficultyLevel: difficultyBefore(task.difficultyLevel),
      adaptationNote: `已根据“太难”反馈将任务缩短为 ${nextDuration} 分钟，并降低一档难度。`,
    }
    return { tasks, summary: tasks[taskIndex].adaptationNote!, affectedTaskIds: [taskId] }
  }

  if (feedback === 'already_know') {
    tasks[taskIndex] = {
      ...base,
      completed: true,
      completedAt: feedbackAt,
      adaptationNote: '已根据“已经会了”跳过这项内容。',
    }
    const candidate = tasks
      .filter(item => !item.completed && item.id !== taskId && (item.dayIndex || dayNumber) > dayNumber)
      .sort((a, b) => (a.dayIndex || 0) - (b.dayIndex || 0) || a.orderIndex - b.orderIndex)
      .find(item => task.subGoalIndex === undefined || item.subGoalIndex === task.subGoalIndex)
    if (candidate) {
      candidate.originalDayIndex ||= candidate.dayIndex
      candidate.dayIndex = dayNumber
      candidate.adaptationNote = `因你已掌握上一项，已将本任务提前到第 ${dayNumber} 天。`
    }
    const affectedTaskIds = candidate ? [taskId, candidate.id] : [taskId]
    const summary = candidate
      ? `已跳过“${task.title}”，并将“${candidate.title}”提前到今天。`
      : `已跳过“${task.title}”，后续计划保持不变。`
    return { tasks, summary, affectedTaskIds }
  }

  const targetDay = findAvailableDay(tasks.filter(item => item.id !== taskId), dayNumber + 1, task.duration || 30, budget, maxDay)
  const label = feedback === 'no_time' ? '今天没时间' : '被前置条件卡住'
  tasks[taskIndex] = {
    ...base,
    dayIndex: targetDay,
    adaptationNote: `已根据“${label}”将任务移到第 ${targetDay} 天，并避开已排满的日期。`,
  }
  return { tasks, summary: tasks[taskIndex].adaptationNote!, affectedTaskIds: [taskId] }
}

export function normalizeGoalPlan(plan: GoalPlanResult): GoalPlanResult {
  if (!plan || !Array.isArray(plan.subGoals) || !Array.isArray(plan.dailyTasks)) {
    throw new Error('计划缺少阶段目标或每日任务')
  }

  const totalDays = Math.max(1, Math.min(3650, Math.round(Number(plan.totalDays) || 30)))
  const dailyTimeMinutes = Math.max(5, Math.min(1440, Math.round(Number(plan.dailyTimeMinutes) || 45)))
  const subGoals = plan.subGoals
    .filter(item => item && String(item.title || '').trim())
    .map(item => ({ ...item, title: String(item.title).trim() }))

  const seen = new Set<string>()
  const dailyTasks = plan.dailyTasks
    .filter(item => item && String(item.title || '').trim())
    .filter(item => {
      const key = String(item.title).trim().toLocaleLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((item, index) => ({
      ...item,
      title: String(item.title).trim(),
      description: String(item.description || '').trim(),
      duration: Math.max(5, Math.min(240, Math.round(Number(item.duration) || dailyTimeMinutes))),
      frequency: 'custom' as const,
      dayIndex: Math.max(1, Math.min(totalDays, Math.round(Number(item.dayIndex) || index + 1))),
      subGoalIndex: Math.max(0, Math.min(Math.max(0, subGoals.length - 1), Math.round(Number(item.subGoalIndex) || 0))),
      checklist: Array.isArray(item.checklist)
        ? [...new Set(item.checklist.map(step => String(step).trim()).filter(Boolean))].slice(0, 7)
        : [],
    }))

  if (subGoals.length === 0 || dailyTasks.length === 0) {
    throw new Error('计划没有生成可执行的阶段或任务')
  }

  return {
    ...plan,
    currentStatus: String(plan.currentStatus || '尚未形成明确的当前状态').trim(),
    totalDays,
    dailyTimeMinutes,
    subGoals,
    dailyTasks,
  }
}

export function auditGoalPlan(plan: GoalPlanResult, hasSourceDocuments = false): GoalPlanIssue[] {
  const issues: GoalPlanIssue[] = []
  if (plan.subGoals.length < 2) issues.push({ severity: 'warning', message: '阶段划分过少，执行时不容易判断进展。' })
  if (plan.dailyTasks.length === 0) issues.push({ severity: 'error', message: '计划没有任何可执行任务。' })

  const dailyBudget = plan.dailyTimeMinutes || 45
  const minutesByDay = new Map<number, number>()
  plan.dailyTasks.forEach((task, taskIndex) => {
    const day = task.dayIndex || 1
    minutesByDay.set(day, (minutesByDay.get(day) || 0) + (task.duration || 0))
    if (!task.description?.trim()) {
      issues.push({ severity: 'warning', taskIndex, message: `第 ${day} 天的“${task.title}”缺少具体说明。` })
    }
    if (!task.checklist || task.checklist.length < 2) {
      issues.push({ severity: 'warning', taskIndex, message: `“${task.title}”缺少足够的执行步骤。` })
    }
    if (hasSourceDocuments && !task.resourceReference?.trim()) {
      issues.push({ severity: 'warning', taskIndex, message: `“${task.title}”没有标明参考资料位置。` })
    }
    if (task.subGoalIndex !== undefined && task.subGoalIndex >= plan.subGoals.length) {
      issues.push({ severity: 'error', taskIndex, message: `“${task.title}”关联了不存在的阶段。` })
    }
    if (plan.totalDays && day > plan.totalDays) {
      issues.push({ severity: 'error', taskIndex, message: `“${task.title}”安排在第 ${day} 天，已经超出 ${plan.totalDays} 天的计划范围。` })
    }
  })

  for (const [day, minutes] of minutesByDay) {
    if (minutes > dailyBudget * 1.15) {
      issues.push({ severity: 'error', message: `第 ${day} 天安排了 ${minutes} 分钟，超过每日 ${dailyBudget} 分钟的预算。` })
    }
  }
  return issues.slice(0, 8)
}
