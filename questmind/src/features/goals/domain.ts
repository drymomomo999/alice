import type { Goal } from '@/types'

export function calculateGoalProgress(subGoals: Goal['subGoals']): number {
  if (subGoals.length === 0) return 0
  const completed = subGoals.filter((subGoal) => subGoal.completed).length
  return Math.round((completed / subGoals.length) * 100)
}

export function normalizeGoalRelations(goal: Goal): Goal {
  return {
    ...goal,
    subGoals: goal.subGoals.map((subGoal) => ({ ...subGoal, goalId: goal.id })),
    dailyTasks: (goal.dailyTasks || []).map((task) => ({ ...task, goalId: goal.id })),
  }
}

export function toggleGoalSubGoal(goal: Goal, subGoalId: string, now = new Date().toISOString()): Goal {
  const subGoals = goal.subGoals.map((subGoal) => subGoal.id === subGoalId
    ? {
        ...subGoal,
        completed: !subGoal.completed,
        completedAt: subGoal.completed ? undefined : now,
      }
    : subGoal)

  return {
    ...goal,
    subGoals,
    progress: calculateGoalProgress(subGoals),
    updatedAt: now,
  }
}
