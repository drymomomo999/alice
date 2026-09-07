import type { Goal, GoalAttachment } from '@/types'
import { applyMasteryEvent, buildCourseModel, buildStudyContext, buildStudyMap } from './engine'
import { classifyDocument } from './documentClassifier'
import {
  courseEngineRepository,
  localCourseEngineRepository,
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
  })
  courseEngineRepository.save(model)
  scheduleCloudUpload(userId, model)
  return model
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
export function setCourseEngineCurrentUser(_userId: string | undefined): void {
  // 当前实现下 scheduleCloudUpload 直接接收 model.userId，无需在此缓存；
  // 保留此函数以对外暴露签名，便于后续切换路由策略。
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
    const { hydrateCourseModelsFromCloud, migrateCourseModelsToCloud } = await import('./repository')
    await hydrateCourseModelsFromCloud(userId)
    await migrateCourseModelsToCloud(userId)
  } catch (error) {
    console.warn('[course-engine] login sync failed (继续用本地):', error)
  }
  // 让本地模型下次写入时也能上云（即使迁移失败也不丢本地数据）
  setCourseEngineCurrentUser(userId)
  void localCourseEngineRepository // 保持 import 引用，避免 tree-shake
}
