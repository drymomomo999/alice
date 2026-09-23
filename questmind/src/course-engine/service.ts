import type { Goal, GoalAttachment } from '@/types'
import { applyMasteryEvent, buildCourseModel, buildStudyContext, buildStudyMap } from './engine'
import { recordLearningEvent, recordSubGoalCompletion, rollbackLatestRevision, selectTodayTasks } from './continuity'
import { classifyDocument } from './documentClassifier'
import {
  courseEngineRepository,
  hydrateCourseModelsFromCloud,
  migrateCourseModelsToCloud,
  SupabaseCourseEngineRepository,
} from './repository'
import type { CourseDocumentInput, CourseModel, MasteryEventType, StudyMode } from './types'

export function classifyGoalAttachment(attachment: GoalAttachment, courseName: string): GoalAttachment {
  if (attachment.type !== 'document') return attachment
  const input: CourseDocumentInput = {
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    text: attachment.extractedText || '',
    classification: attachment.courseClassification,
  }
  return { ...attachment, courseClassification: classifyDocument(input, courseName) }
}

export function classifyGoalAttachments(attachments: GoalAttachment[], courseName: string): GoalAttachment[] {
  return attachments.map(attachment => classifyGoalAttachment(attachment, courseName))
}

export function analyzeGoalCourse(goal: Goal, userId: string): CourseModel {
  const inputs: CourseDocumentInput[] = (goal.attachments || [])
    .filter(attachment => attachment.type === 'document' && attachment.extractedText)
    .map(attachment => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      text: attachment.extractedText || '',
      uploadedAt: attachment.uploadedAt,
      classification: attachment.courseClassification,
    }))
  if (!inputs.length) throw new Error('没有可分析的学习资料，请先上传 PDF、DOCX、TXT 或 MD 文件。')
  const model = buildCourseModel({
    userId,
    goalId: goal.id,
    courseName: goal.title || '未归类课程',
    documents: inputs,
    previous: courseEngineRepository.getByGoalId(goal.id),
    initialPlan: {
      subGoals: (goal.subGoals || []).map(item => ({ id: item.id, title: item.title, completed: item.completed, completedAt: item.completedAt })),
      tasks: (goal.dailyTasks || []).map(item => ({ id: item.id, title: item.title, description: item.description, duration: item.duration, completed: item.completed, completedAt: item.completedAt, orderIndex: item.orderIndex })),
    },
  })
  courseEngineRepository.save(model)
  scheduleCloudUpload(userId, model)
  return model
}

export function projectContinuityPlanToGoal(model: CourseModel, goal: Goal): Pick<Goal, 'subGoals' | 'dailyTasks' | 'progress' | 'currentStatus'> {
  const existingSubGoals = new Map((goal.subGoals || []).map(item => [item.id, item]))
  const existingTasks = new Map((goal.dailyTasks || []).map(item => [item.id, item]))
  const subGoals = model.continuity.subGoals
    .filter(item => item.status !== 'SUPERSEDED')
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map(item => ({
      ...existingSubGoals.get(item.id),
      id: item.id,
      goalId: goal.id,
      title: item.canonicalTitle,
      completed: item.status === 'COMPLETED',
      completedAt: item.status === 'COMPLETED' ? (existingSubGoals.get(item.id)?.completedAt || item.updatedAt) : undefined,
    }))
  const dailyTasks = model.continuity.tasks
    .filter(item => item.status !== 'CANCELLED')
    .map((item, index) => ({
      ...existingTasks.get(item.id),
      id: item.id,
      goalId: goal.id,
      title: item.title,
      description: item.description,
      duration: item.estimatedMinutes,
      frequency: 'custom' as const,
      completed: item.status === 'DONE',
      completedAt: item.completedAt,
      orderIndex: index,
      subGoalIndex: Math.max(0, subGoals.findIndex(subGoal => subGoal.id === item.subGoalId)),
      resourceReference: item.nodeIds.map(id => model.nodes.find(node => node.id === id)?.canonicalName).filter(Boolean).join('、') || undefined,
    }))
  return {
    subGoals,
    dailyTasks,
    progress: Math.round(model.continuity.goalProgress * 100),
    currentStatus: `当前阶段：${model.continuity.currentStage}`,
  }
}

export function getCourseModel(goalId: string): CourseModel | null {
  return courseEngineRepository.getByGoalId(goalId)
}

export function recordMasteryEvent(goalId: string, nodeId: string, type: MasteryEventType, errorTag?: string): CourseModel | null {
  const model = courseEngineRepository.getByGoalId(goalId)
  if (!model) return null
  const next = applyMasteryEvent(model, nodeId, type, errorTag)
  courseEngineRepository.save(next)
  scheduleCloudUpload(model.userId, next)
  return next
}

export function recordContinuityTaskCompletion(goalId: string, taskId: string, completed = true): CourseModel | null {
  const model = courseEngineRepository.getByGoalId(goalId)
  if (!model?.continuity) return model
  const task = model.continuity.tasks.find(item => item.id === taskId)
  if (!task || !completed || task.status === 'DONE') return model
  let next = model
  task.nodeIds.forEach(nodeId => { next = applyMasteryEvent(next, nodeId, task.type === 'REVIEW' ? 'review_complete' : 'self_known') })
  next = recordLearningEvent(next, { taskId, nodeIds: task.nodeIds, eventType: 'TASK_DONE' })
  courseEngineRepository.save(next)
  scheduleCloudUpload(next.userId, next)
  return next
}

export function recordContinuitySubGoalCompletion(goalId: string, subGoalId: string, completed = true): CourseModel | null {
  const model = courseEngineRepository.getByGoalId(goalId)
  if (!model?.continuity) return model
  const subGoal = model.continuity.subGoals.find(item => item.id === subGoalId)
  if (!subGoal || (subGoal.status === 'COMPLETED') === completed) return model
  let next = model
  if (completed) subGoal.nodeIds.forEach(nodeId => { next = applyMasteryEvent(next, nodeId, 'concept_correct') })
  next = recordSubGoalCompletion(next, subGoalId, completed)
  courseEngineRepository.save(next)
  scheduleCloudUpload(next.userId, next)
  return next
}

export function getTodayContinuityTasks(goalId: string, availableMinutes = 45) {
  const model = courseEngineRepository.getByGoalId(goalId)
  return model?.continuity ? selectTodayTasks(model, availableMinutes) : []
}

export function rollbackGoalPlan(goalId: string): CourseModel | null {
  const model = courseEngineRepository.getByGoalId(goalId)
  if (!model?.continuity) return model
  const next = rollbackLatestRevision(model)
  courseEngineRepository.save(next)
  scheduleCloudUpload(next.userId, next)
  return next
}

export function getStudyMap(goalId: string, mode: StudyMode = 'systematic') {
  const model = courseEngineRepository.getByGoalId(goalId)
  return model ? buildStudyMap(model, mode) : null
}

export function getStudyContext(goalId: string, mode: StudyMode = 'systematic', focusNodeIds?: string[]) {
  const model = courseEngineRepository.getByGoalId(goalId)
  return model ? buildStudyContext(model, mode, focusNodeIds) : null
}

/**
 * 供 App.tsx 在登录后注入当前 user，让本地写入时可顺手异步上传 snapshot。
 * 未登录时不调用 cloud upload（保持现状）。
 */
export function setCourseEngineCurrentUser(userId: string | undefined): void {
  // 当前实现下 scheduleCloudUpload 直接接收 model.userId，无需在此缓存；
  // 保留此函数以对外暴露签名，便于后续切换路由策略。
  void userId
}

function scheduleCloudUpload(userId: string | undefined, model: CourseModel): void {
  if (!userId) return
  // 进入 idle 队列，避免每次记录掌握度事件都阻塞 UI
  const run = () => {
    try {
      const repo = new SupabaseCourseEngineRepository(userId)
      void repo.saveAsync(model).catch(error => {
        console.warn('[course-engine] cloud snapshot upload failed (will retry on next save):', error)
      })
    } catch (error) {
      // supabase 未配置时不会走到这里，但保护一下
      console.warn('[course-engine] cloud upload setup failed:', error)
    }
  }
  if (typeof (globalThis as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback === 'function') {
    ;(globalThis as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(run)
  } else {
    setTimeout(run, 150)
  }
}

/**
 * 用户登录后调用一次：把云端 snapshot 拉回本地（覆盖更新版本），
 * 然后把 localStorage 模型一次性上传并切换 backend。
 *
 * 注意：每次启动都会执行，因为 backend 标记存在 localStorage 中，
 * 用户清缓存后再次执行可重新建立连接。
 */
export async function syncCourseEngineOnLogin(userId: string): Promise<void> {
  if (!userId) return
  try {
    await hydrateCourseModelsFromCloud(userId)
    await migrateCourseModelsToCloud(userId)
  } catch (error) {
    console.warn('[course-engine] login sync failed (继续用本地):', error)
  }
  // 让本地模型下次写入时也能上云（即使迁移失败也不丢本地数据）
  setCourseEngineCurrentUser(userId)
}
