import { calculateGoalProgress, normalizeGoalRelations, toggleGoalSubGoal } from '@/features/goals/domain'
import { applyGoalTaskFeedback, auditGoalPlan, getGoalDayNumber, normalizeGoalPlan, scheduleGoalTasks } from '@/features/goals/planning'
import type { GoalPlanResult } from '@/services/ai.service'
import type { Goal } from '@/types'

let passed = 0

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
  passed += 1
}

const goal: Goal = {
  id: 'goal-1',
  userId: 'user-1',
  title: '可靠目标',
  description: '',
  status: 'active',
  priority: 'medium',
  startDate: '2026-09-08T00:00:00.000Z',
  endDate: '2026-10-08T00:00:00.000Z',
  progress: 0,
  subGoals: [
    { id: 'sub-1', goalId: '', title: '第一步', completed: false },
    { id: 'sub-2', goalId: 'stale-id', title: '第二步', completed: true },
  ],
  dailyTasks: [
    { id: 'task-1', goalId: '', title: '练习', completed: false, orderIndex: 0 },
  ],
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
}

const normalized = normalizeGoalRelations(goal)
expect(normalized.subGoals.every((item) => item.goalId === goal.id), '子目标必须引用真实目标 ID')
expect(normalized.dailyTasks?.every((item) => item.goalId === goal.id) === true, '每日任务必须引用真实目标 ID')
expect(calculateGoalProgress(normalized.subGoals) === 50, '进度必须由当前子目标推导')

const toggled = toggleGoalSubGoal(normalized, 'sub-1', '2026-09-08T01:00:00.000Z')
expect(toggled.progress === 100 && toggled.subGoals[0].completed, '完成子目标后应同步更新进度')

const reverted = toggleGoalSubGoal(toggled, 'sub-1', '2026-09-08T02:00:00.000Z')
expect(reverted.progress === 50 && reverted.subGoals[0].completedAt === undefined, '撤销完成后应清除完成时间并重算进度')

const scheduledGoal: Goal = {
  ...goal,
  startDate: '2026-09-08T20:00:00+08:00',
  dailyTasks: [
    { id: 'overdue', goalId: goal.id, title: '昨天的任务', completed: false, orderIndex: 0, dayIndex: 1, frequency: 'custom' },
    { id: 'today', goalId: goal.id, title: '今天的任务', completed: false, orderIndex: 1, dayIndex: 2, frequency: 'custom' },
    { id: 'future', goalId: goal.id, title: '明天的任务', completed: false, orderIndex: 2, dayIndex: 3, frequency: 'custom' },
    { id: 'repeat', goalId: goal.id, title: '每日任务', completed: false, orderIndex: 3, frequency: 'daily' },
  ],
}
const schedule = scheduleGoalTasks(scheduledGoal, new Date('2026-09-09T09:00:00+08:00'))
expect(getGoalDayNumber(scheduledGoal, new Date('2026-09-09T09:00:00+08:00')) === 2, '计划天数必须按本地自然日计算')
expect(schedule.overdue.map(item => item.id).join(',') === 'overdue', '此前未完成任务必须进入逾期区')
expect(schedule.today.map(item => item.id).join(',') === 'today,repeat', '今日任务与真正的每日重复任务必须进入今日区')
expect(schedule.upcoming.map(item => item.id).join(',') === 'future', '未来任务必须与今日任务分开')

const rawPlan: GoalPlanResult = {
  currentStatus: '每天可投入 30 分钟',
  totalDays: 2,
  dailyTimeMinutes: 30,
  subGoals: [{ title: '第一阶段', estimatedTime: '2天', action: '完成基础训练' }],
  dailyTasks: [
    { title: '完成练习 1', description: '完成指定练习', duration: 40, frequency: 'daily', dayIndex: 1, subGoalIndex: 0, checklist: ['打开资料', '完成练习'] },
    { title: '完成练习 2', description: '完成指定练习', duration: 20, frequency: 'daily', dayIndex: 1, subGoalIndex: 0, checklist: ['打开资料', '完成练习'] },
  ],
}
const normalizedPlan = normalizeGoalPlan(rawPlan)
expect(normalizedPlan.dailyTasks.every(item => item.frequency === 'custom'), '带日期的 AI 计划任务必须规范化为一次性任务')
expect(auditGoalPlan(normalizedPlan).some(issue => issue.severity === 'error' && issue.message.includes('超过每日')), '计划校验必须阻止超出每日时间预算的安排')

const hardAdjustment = applyGoalTaskFeedback(scheduledGoal, 'today', 'too_hard', new Date('2026-09-09T09:00:00+08:00'))
expect(hardAdjustment.tasks.find(item => item.id === 'today')?.duration === 20, '任务太难时必须降低时长和难度')

const noTimeAdjustment = applyGoalTaskFeedback(scheduledGoal, 'today', 'no_time', new Date('2026-09-09T09:00:00+08:00'))
expect((noTimeAdjustment.tasks.find(item => item.id === 'today')?.dayIndex || 0) > 2, '没时间时必须把任务移到以后可用的日期')

const knownAdjustment = applyGoalTaskFeedback(scheduledGoal, 'today', 'already_know', new Date('2026-09-09T09:00:00+08:00'))
expect(knownAdjustment.tasks.find(item => item.id === 'today')?.completed === true, '已经掌握的内容应被跳过')
expect(knownAdjustment.tasks.find(item => item.id === 'future')?.dayIndex === 2, '跳过内容后应提前同阶段的后续任务')

console.log(`Goal domain acceptance: ${passed}/15 passed`)
