import type {
  ContinuitySubGoal,
  ContinuityTask,
  CourseContinuityState,
  CourseDelta,
  CourseDeltaNode,
  CourseDocument,
  CourseMatchResult,
  CourseModel,
  LearningEvent,
  PlanPatch,
  PlanSnapshot,
} from './types'
import { addDays, clamp, normalizeName, round, similarity, stableId } from './utils'

export const CONTINUITY_PLANNER_VERSION = 'cce-mvp-1'

export interface InitialPlanSeed {
  subGoals?: Array<{ id: string; title: string; completed?: boolean; completedAt?: string }>
  tasks?: Array<{ id: string; title: string; description?: string; duration?: number; completed?: boolean; completedAt?: string; orderIndex?: number }>
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function stageForDocuments(documents: CourseDocument[], fallback = '课程起步'): string {
  const latest = [...documents].sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''))[0]
  if (!latest) return fallback
  if (latest.classification.chapter) return latest.classification.chapter
  const match = latest.name.match(/(?:week|第)\s*([0-9一二三四五六七八九十]+)\s*(?:周|讲|章)?/i)
  return match ? `第 ${match[1]} 周` : latest.name.replace(/\.[^.]+$/, '').slice(0, 32)
}

function snapshot(state: CourseContinuityState): PlanSnapshot {
  return clone({
    currentStage: state.currentStage,
    currentSubGoalId: state.currentSubGoalId,
    goalProgress: state.goalProgress,
    subGoals: state.subGoals,
    tasks: state.tasks,
  })
}

function documentKey(documentId: string, plannerVersion = CONTINUITY_PLANNER_VERSION): string {
  return `${documentId}:${plannerVersion}`
}

function dueInDays(now: string, days: number): string {
  return addDays(now, days)
}

function recalculateProgress(state: CourseContinuityState, now: string): void {
  state.subGoals.forEach(subGoal => {
    if (subGoal.status === 'COMPLETED') {
      subGoal.progress = 1
      subGoal.updatedAt = now
      return
    }
    const tasks = state.tasks.filter(task => task.subGoalId === subGoal.id && task.status !== 'CANCELLED')
    subGoal.progress = tasks.length ? round(tasks.filter(task => task.status === 'DONE').length / tasks.length) : subGoal.progress
    if (subGoal.progress >= 1) subGoal.status = 'COMPLETED'
    subGoal.updatedAt = now
  })
  const active = state.subGoals.find(item => item.status === 'ACTIVE' || item.status === 'REVIEW')
    || state.subGoals.find(item => item.status === 'UPCOMING' || item.status === 'LOCKED')
  if (active && active.status !== 'COMPLETED') {
    active.status = 'ACTIVE'
    state.currentSubGoalId = active.id
  }
  const relevant = state.subGoals.filter(item => item.status !== 'SUPERSEDED')
  state.goalProgress = relevant.length ? round(relevant.reduce((sum, item) => sum + item.progress, 0) / relevant.length) : 0
}

export function resolveCourse(options: {
  existingCourses: Array<Pick<CourseModel, 'id' | 'goalId' | 'name' | 'documents'>>
  explicitCourseId?: string
  boundGoalId?: string
  courseName?: string
  documentName: string
  documentText?: string
}): CourseMatchResult {
  const ranked = options.existingCourses.map(course => {
    const explicit = options.explicitCourseId === course.id ? 1 : 0
    const bound = options.boundGoalId === course.goalId ? 1 : 0
    const courseName = options.courseName ? similarity(options.courseName, course.name) : 0
    const syllabus = Math.max(0, ...course.documents.map(item => similarity(item.name, options.documentName)))
    const continuity = /(?:week|第)\s*[0-9一二三四五六七八九十]+/i.test(options.documentName) ? syllabus : 0
    const semantic = options.documentText ? similarity(options.documentText.slice(0, 180), course.name) : 0
    const weighted = Math.max(explicit, bound) * 0.4 + courseName * 0.25 + syllabus * 0.15 + continuity * 0.1 + semantic * 0.1
    const score = round(clamp(Math.max(explicit, bound) ? Math.max(0.8, weighted) : weighted))
    return { course, score, reasons: [explicit ? '用户已明确绑定课程' : '', bound ? '资料已绑定当前目标' : '', courseName >= 0.7 ? '课程名称一致' : '', syllabus >= 0.55 ? '文件名或章节连续' : ''].filter(Boolean) }
  }).sort((a, b) => b.score - a.score)
  const best = ranked[0]
  if (!best || best.score < 0.45) return { score: best?.score || 0, decision: 'NEW_COURSE_CANDIDATE', reasons: best?.reasons || ['没有足够的连续性证据'] }
  if (best.score < 0.75) return { courseId: best.course.id, score: best.score, decision: 'REVIEW_REQUIRED', reasons: best.reasons }
  return { courseId: best.course.id, score: best.score, decision: 'MATCHED', reasons: best.reasons }
}

function deltaNode(model: CourseModel, nodeId: string, documentIds: Set<string>, reasonCode: CourseDeltaNode['reasonCode']): CourseDeltaNode {
  const node = model.nodes.find(item => item.id === nodeId)!
  return {
    nodeId,
    name: node.canonicalName,
    evidenceIds: node.sourceEvidenceIds.filter(id => documentIds.has(model.evidence.find(item => item.id === id)?.documentId || '')),
    reasonCode,
  }
}

export function buildCourseDelta(previous: CourseModel, next: CourseModel, newDocumentIds: string[], now = new Date().toISOString()): CourseDelta {
  const previousNodes = new Map(previous.nodes.map(node => [node.id, node]))
  const newDocs = new Set(newDocumentIds)
  const touched = next.nodes.filter(node => node.sourceEvidenceIds.some(id => newDocs.has(next.evidence.find(item => item.id === id)?.documentId || '')))
  const added = touched.filter(node => !previousNodes.has(node.id))
  const strengthened = touched.filter(node => {
    const old = previousNodes.get(node.id)
    return old && node.sourceEvidenceIds.length > old.sourceEvidenceIds.length
  })
  const corrected = touched.filter(node => node.sourceEvidenceIds.some(id => {
    const excerpt = next.evidence.find(item => item.id === id)?.rawExcerpt || ''
    return /(更正|修正|纠正|以.*为准|勘误)/.test(excerpt)
  }))
  const assignments = touched.filter(node => node.sourceEvidenceIds.some(id => {
    const type = next.evidence.find(item => item.id === id)?.documentType
    return type === 'homework' || type === 'tutorial_exercises'
  }))
  const emphasis = strengthened.filter(node => node.teacherEmphasis > (previousNodes.get(node.id)?.teacherEmphasis || 0))
  const prerequisiteIds = new Set(next.edges
    .filter(edge => added.some(node => node.id === edge.toNodeId) && (next.mastery[edge.fromNodeId]?.mastery || 0.35) < 0.6)
    .map(edge => edge.fromNodeId))
  const stageAfter = stageForDocuments(next.documents.filter(document => newDocs.has(document.id)), previous.continuity?.currentStage || '课程起步')
  return {
    courseId: next.id,
    documentIds: newDocumentIds,
    stageBefore: previous.continuity?.currentStage || stageForDocuments(previous.documents),
    stageAfter,
    addedNodes: added.map(node => deltaNode(next, node.id, newDocs, 'NEW_NODE')),
    strengthenedNodes: strengthened.map(node => deltaNode(next, node.id, newDocs, 'NEW_EVIDENCE')),
    correctedNodes: corrected.map(node => deltaNode(next, node.id, newDocs, 'CORRECTION')),
    newlyRequiredPrerequisites: [...prerequisiteIds].map(id => deltaNode(next, id, newDocs, 'PREREQUISITE_GAP')),
    newlyDetectedAssignments: assignments.map(node => deltaNode(next, node.id, newDocs, 'ASSIGNMENT_DETECTED')),
    teacherEmphasisChanges: emphasis.map(node => deltaNode(next, node.id, newDocs, 'TEACHER_EMPHASIS')),
    suggestedNextStage: stageAfter,
    confidence: round(clamp(0.72 + Math.min(0.24, touched.length * 0.02))),
    createdAt: now,
  }
}

function initializeState(model: CourseModel, now: string, seed?: InitialPlanSeed): CourseContinuityState {
  const seededSubGoals: ContinuitySubGoal[] = (seed?.subGoals || []).map((item, index) => ({
    id: item.id || stableId('sg', `${model.goalId}:${normalizeName(item.title)}`), goalId: model.goalId, canonicalTitle: item.title,
    nodeIds: model.nodes.filter(node => similarity(node.canonicalName, item.title) >= 0.45).map(node => node.id), orderIndex: index,
    status: item.completed ? 'COMPLETED' : index === 0 ? 'ACTIVE' : 'UPCOMING', progress: item.completed ? 1 : 0,
    sourceVersion: 1, createdAt: now, updatedAt: item.completedAt || now,
  }))
  const fallbackSubGoals: ContinuitySubGoal[] = [...new Set(model.nodes.map(node => node.chapter).filter(Boolean))].slice(0, 6).map((chapter, index) => ({
    id: stableId('sg', `${model.goalId}:${normalizeName(chapter!)}`), goalId: model.goalId, canonicalTitle: chapter!,
    nodeIds: model.nodes.filter(node => node.chapter === chapter).map(node => node.id), orderIndex: index,
    status: index === 0 ? 'ACTIVE' : 'UPCOMING', progress: 0, sourceVersion: 1, createdAt: now, updatedAt: now,
  }))
  const subGoals = seededSubGoals.length ? seededSubGoals : fallbackSubGoals.length ? fallbackSubGoals : [{
    id: stableId('sg', `${model.goalId}:核心知识`), goalId: model.goalId, canonicalTitle: '核心知识学习',
    nodeIds: model.nodes.slice(0, 8).map(node => node.id), orderIndex: 0, status: 'ACTIVE' as const, progress: 0,
    sourceVersion: 1, createdAt: now, updatedAt: now,
  }]
  const seededTasks: ContinuityTask[] = (seed?.tasks || []).map((item, index) => ({
    id: item.id || stableId('task', `${model.goalId}:${normalizeName(item.title)}`), goalId: model.goalId,
    subGoalId: subGoals[Math.min(index, subGoals.length - 1)]?.id, nodeIds: model.nodes.filter(node => similarity(node.canonicalName, item.title) >= 0.45).map(node => node.id),
    title: item.title, description: item.description || '继续执行已建立的学习任务', type: 'LEARN', status: item.completed ? 'DONE' : index < 3 ? 'READY' : 'PENDING',
    priority: Math.max(0.4, 0.8 - index * 0.03), estimatedMinutes: item.duration || 20, generationReason: 'NEW_CONTENT', sourceRevisionId: '',
    createdAt: now, updatedAt: item.completedAt || now, completedAt: item.completedAt,
  }))
  const tasks = seededTasks.length ? seededTasks : model.nodes.slice(0, 8).map((node, index) => ({
    id: stableId('task', `${model.goalId}:${node.id}:initial`), goalId: model.goalId, subGoalId: subGoals.find(item => item.nodeIds.includes(node.id))?.id || subGoals[0]?.id,
    nodeIds: [node.id], title: `学习 ${node.canonicalName}`, description: node.mustApply ? '理解核心概念并完成 2 道应用题' : '理解并复述核心概念',
    type: node.mustApply ? 'PRACTICE' as const : 'LEARN' as const, status: index < 3 ? 'READY' as const : 'PENDING' as const,
    priority: node.personalPriority, estimatedMinutes: node.mustApply ? 20 : 12, generationReason: 'NEW_CONTENT' as const, sourceRevisionId: '', createdAt: now, updatedAt: now,
  }))
  const state: CourseContinuityState = {
    goalStatus: 'ACTIVE', currentStage: stageForDocuments(model.documents), currentSubGoalId: subGoals.find(item => item.status === 'ACTIVE')?.id,
    goalProgress: 0, subGoals, tasks, revisions: [], learningEvents: [],
    processedDocumentKeys: model.documents.map(item => documentKey(item.id)), plannerVersion: CONTINUITY_PLANNER_VERSION,
    lastSummary: '已建立课程持续计划，后续资料只会增量调整受影响部分。',
  }
  const patch: PlanPatch = {
    id: stableId('patch', `${model.id}:initialize:${now}`), courseId: model.id, goalId: model.goalId,
    triggerDocumentIds: model.documents.map(item => item.id), revisionReason: '首次建立课程目标与任务', subGoalActions: [], taskActions: [],
    progressPatch: { currentStage: state.currentStage, currentSubGoalId: state.currentSubGoalId, goalProgress: 0 },
    userFacingSummary: state.lastSummary!, confidence: 1, reviewRequired: false, plannerVersion: CONTINUITY_PLANNER_VERSION, createdAt: now,
  }
  state.tasks.forEach(task => { task.sourceRevisionId = patch.id })
  state.revisions.push({ id: stableId('rev', patch.id), goalId: model.goalId, triggerType: 'INITIALIZE', triggerId: model.documents[0]?.id || model.goalId, patch, summary: patch.userFacingSummary, plannerVersion: CONTINUITY_PLANNER_VERSION, createdAt: now, beforeState: { currentStage: '', goalProgress: 0, subGoals: [], tasks: [] } })
  recalculateProgress(state, now)
  return state
}

export function createPlanPatch(model: CourseModel, delta: CourseDelta, now = new Date().toISOString()): PlanPatch {
  const state = model.continuity
  const patchId = stableId('patch', `${model.id}:${delta.documentIds.sort().join(',')}:${CONTINUITY_PLANNER_VERSION}`)
  const subGoalActions: PlanPatch['subGoalActions'] = []
  const taskActions: PlanPatch['taskActions'] = []
  const stageTitle = delta.stageAfter || '新增课程内容'
  const targetSubGoal = state.subGoals.find(item => normalizeName(item.canonicalTitle) === normalizeName(stageTitle))
  if (delta.addedNodes.length && !targetSubGoal) {
    subGoalActions.push({ action: 'ADD', payload: { canonicalTitle: stageTitle, nodeIds: delta.addedNodes.map(item => item.nodeId), orderIndex: state.subGoals.length, status: state.subGoals.some(item => item.status === 'ACTIVE') ? 'UPCOMING' : 'ACTIVE' }, reasonCode: 'NEW_STAGE', reason: '新资料引入了新的学习阶段' })
  } else if (targetSubGoal && delta.addedNodes.length) {
    subGoalActions.push({ action: targetSubGoal.status === 'COMPLETED' ? 'REOPEN' : 'UPDATE', subGoalId: targetSubGoal.id, payload: { nodeIds: [...new Set([...targetSubGoal.nodeIds, ...delta.addedNodes.map(item => item.nodeId)])] }, reasonCode: 'STAGE_DEEPENED', reason: '新资料继续深化已有阶段' })
  }
  const effectiveSubGoalId = targetSubGoal?.id || stableId('sg', `${model.goalId}:${normalizeName(stageTitle)}`)
  delta.addedNodes.slice(0, 6).forEach((item, index) => {
    taskActions.push({ action: 'ADD', payload: { subGoalId: effectiveSubGoalId, nodeIds: [item.nodeId], title: `学习 ${item.name}`, description: '新资料新增知识，完成概念理解与一次自测', type: 'LEARN', status: index < 3 ? 'READY' : 'PENDING', priority: model.nodes.find(node => node.id === item.nodeId)?.personalPriority || 0.6, estimatedMinutes: 15, generationReason: 'NEW_CONTENT', sourceRevisionId: patchId }, reasonCode: 'NEW_CONTENT', reason: '新课件新增知识点' })
  })
  delta.strengthenedNodes.slice(0, 4).forEach(item => {
    const existing = state.tasks.find(task => task.nodeIds.includes(item.nodeId) && task.status !== 'CANCELLED')
    if (existing && existing.status !== 'DONE') taskActions.push({ action: 'UPDATE', taskId: existing.id, payload: { priority: clamp(existing.priority + 0.15), updatedAt: now }, reasonCode: 'TEACHER_EMPHASIS', reason: '老师在新资料中再次强调该知识点' })
    else taskActions.push({ action: 'ADD', payload: { subGoalId: targetSubGoal?.id || state.currentSubGoalId, nodeIds: [item.nodeId], title: `复习 ${item.name}`, description: '新资料再次强调，安排一次针对性复习', type: 'REVIEW', status: 'READY', priority: 0.82, estimatedMinutes: 10, generationReason: 'REVIEW', sourceRevisionId: patchId }, reasonCode: 'REINFORCED_CONTENT', reason: '已学内容被再次强调，保留历史并追加复习' })
  })
  delta.newlyRequiredPrerequisites.slice(0, 3).forEach(item => taskActions.push({ action: 'ADD', payload: { subGoalId: state.currentSubGoalId, nodeIds: [item.nodeId], title: `补齐先修 ${item.name}`, description: '进入新阶段前先补齐必要基础', type: 'LEARN', status: 'READY', priority: 0.9, estimatedMinutes: 15, generationReason: 'PREREQUISITE', sourceRevisionId: patchId }, reasonCode: 'PREREQUISITE_GAP', reason: '新章节依赖尚未掌握的先修知识' }))
  const changed = subGoalActions.length + taskActions.length
  const summary = changed
    ? `已把 ${delta.stageAfter} 接入原课程计划：新增 ${delta.addedNodes.length} 个知识点，强化 ${delta.strengthenedNodes.length} 个知识点；已完成历史不会重置。`
    : `已检查 ${delta.stageAfter} 的新资料；现有计划可以继续，已完成历史保持不变。`
  return {
    id: patchId, courseId: model.id, goalId: model.goalId, triggerDocumentIds: delta.documentIds,
    revisionReason: '新课程资料触发增量对齐', subGoalActions, taskActions,
    progressPatch: { currentStage: delta.stageAfter }, userFacingSummary: summary,
    confidence: delta.confidence, reviewRequired: delta.confidence < 0.55, plannerVersion: CONTINUITY_PLANNER_VERSION, createdAt: now,
  }
}

export function validatePlanPatch(state: CourseContinuityState, patch: PlanPatch): string[] {
  const errors: string[] = []
  const subGoalIds = new Set(state.subGoals.map(item => item.id))
  const taskIds = new Set(state.tasks.map(item => item.id))
  patch.subGoalActions.forEach(item => {
    if (item.action !== 'ADD' && (!item.subGoalId || !subGoalIds.has(item.subGoalId))) errors.push(`子目标修改缺少有效 ID: ${item.reasonCode}`)
  })
  patch.taskActions.forEach(item => {
    if (item.action !== 'ADD' && item.action !== 'KEEP' && (!item.taskId || !taskIds.has(item.taskId))) errors.push(`任务修改缺少有效 ID: ${item.reasonCode}`)
    if (item.action === 'ADD' && !item.payload?.title) errors.push(`新增任务缺少标题: ${item.reasonCode}`)
  })
  const duplicateAdds = patch.taskActions.filter(item => item.action === 'ADD').map(item => normalizeName(item.payload?.title || ''))
  if (new Set(duplicateAdds).size !== duplicateAdds.length) errors.push('同一 patch 包含重复任务')
  if (patch.reviewRequired && (patch.subGoalActions.some(item => ['CANCEL', 'SUPERSEDE'].includes(item.action)) || patch.taskActions.some(item => item.action === 'CANCEL'))) errors.push('低置信度 patch 不允许破坏性修改')
  return errors
}

export function applyPlanPatch(state: CourseContinuityState, patch: PlanPatch, now = patch.createdAt): CourseContinuityState {
  const errors = validatePlanPatch(state, patch)
  if (errors.length) throw new Error(`PlanPatch 校验失败：${errors.join('；')}`)
  if (patch.reviewRequired) return { ...state, lastSummary: '课程归属或计划变化置信度不足，请确认后再应用。' }
  const next = clone(state)
  const beforeState = snapshot(next)
  patch.subGoalActions.forEach(action => {
    if (action.action === 'ADD') {
      const title = action.payload?.canonicalTitle || '新增学习阶段'
      next.subGoals.push({ id: stableId('sg', `${patch.goalId}:${normalizeName(title)}`), goalId: patch.goalId, canonicalTitle: title, nodeIds: action.payload?.nodeIds || [], orderIndex: action.payload?.orderIndex ?? next.subGoals.length, status: action.payload?.status || 'UPCOMING', progress: 0, sourceVersion: next.revisions.length + 1, createdAt: now, updatedAt: now })
      return
    }
    const item = next.subGoals.find(candidate => candidate.id === action.subGoalId)!
    if (action.action === 'SUPERSEDE') item.status = 'SUPERSEDED'
    else if (action.action === 'REOPEN') item.status = 'REVIEW'
    else Object.assign(item, action.payload || {})
    item.sourceVersion += 1
    item.updatedAt = now
  })
  patch.taskActions.forEach(action => {
    if (action.action === 'ADD') {
      const payload = action.payload!
      const id = stableId('task', `${patch.id}:${normalizeName(payload.title || '')}:${(payload.nodeIds || []).join(',')}`)
      if (!next.tasks.some(item => item.id === id)) next.tasks.push({ id, goalId: patch.goalId, subGoalId: payload.subGoalId, nodeIds: payload.nodeIds || [], title: payload.title!, description: payload.description || '', type: payload.type || 'LEARN', status: payload.status || 'PENDING', dueAt: payload.dueAt || dueInDays(now, 3), priority: payload.priority ?? 0.6, estimatedMinutes: payload.estimatedMinutes || 15, generationReason: payload.generationReason || 'NEW_CONTENT', sourceRevisionId: patch.id, supersedesTaskId: payload.supersedesTaskId, completionSignal: payload.completionSignal, unlockCondition: payload.unlockCondition, createdAt: now, updatedAt: now })
      return
    }
    const item = next.tasks.find(candidate => candidate.id === action.taskId)!
    if (action.action === 'CANCEL') item.status = 'CANCELLED'
    else if (action.action === 'RESCHEDULE') Object.assign(item, action.payload || {})
    else Object.assign(item, action.payload || {})
    item.updatedAt = now
  })
  if (patch.progressPatch.currentStage) next.currentStage = patch.progressPatch.currentStage
  if (patch.progressPatch.currentSubGoalId) next.currentSubGoalId = patch.progressPatch.currentSubGoalId
  next.lastSummary = patch.userFacingSummary
  next.processedDocumentKeys = [...new Set([...next.processedDocumentKeys, ...patch.triggerDocumentIds.map(id => documentKey(id, patch.plannerVersion))])]
  next.revisions.push({ id: stableId('rev', patch.id), goalId: patch.goalId, triggerType: 'DOCUMENT_UPLOAD', triggerId: patch.triggerDocumentIds.join(','), patch, summary: patch.userFacingSummary, plannerVersion: patch.plannerVersion, createdAt: now, beforeState })
  recalculateProgress(next, now)
  return next
}

export function reconcileContinuity(model: CourseModel, previous: CourseModel | null | undefined, now: string, seed?: InitialPlanSeed): CourseContinuityState {
  if (!previous?.continuity) return initializeState(model, now, seed)
  const newDocuments = model.documents.filter(item => !previous.continuity.processedDocumentKeys.includes(documentKey(item.id)))
  if (!newDocuments.length) return clone(previous.continuity)
  const delta = buildCourseDelta(previous, model, newDocuments.map(item => item.id), now)
  const base = { ...model, continuity: clone(previous.continuity) }
  const next = applyPlanPatch(base.continuity, createPlanPatch(base, delta, now), now)
  next.lastDelta = delta
  return next
}

export function selectTodayTasks(model: CourseModel, availableMinutes = 45, now = new Date().toISOString()): ContinuityTask[] {
  const nowMs = new Date(now).getTime()
  const ranked = model.continuity.tasks
    .filter(task => !['DONE', 'CANCELLED', 'SKIPPED'].includes(task.status))
    .map(task => {
      const dueMs = task.dueAt ? new Date(task.dueAt).getTime() : nowMs + 7 * 86400000
      const urgency = dueMs <= nowMs ? 1 : clamp(1 - (dueMs - nowMs) / (14 * 86400000))
      const nodes = task.nodeIds.map(id => model.nodes.find(node => node.id === id)).filter(Boolean)
      const importance = nodes.length ? Math.max(...nodes.map(node => node!.courseImportance)) : task.priority
      const masteryGap = nodes.length ? 1 - Math.min(...nodes.map(node => model.mastery[node!.id]?.mastery || 0.35)) : 0.5
      const prerequisiteValue = task.generationReason === 'PREREQUISITE' ? 1 : 0.35
      const forgettingRisk = task.type === 'REVIEW' ? 0.9 : 0.25
      return { task, score: 0.3 * urgency + 0.25 * importance + 0.2 * masteryGap + 0.15 * prerequisiteValue + 0.1 * forgettingRisk }
    }).sort((a, b) => b.score - a.score)
  const selected: ContinuityTask[] = []
  let used = 0
  for (const item of ranked) {
    if (selected.length && used + item.task.estimatedMinutes > availableMinutes) continue
    selected.push(item.task)
    used += item.task.estimatedMinutes
    if (used >= availableMinutes) break
  }
  return selected
}

export function recordLearningEvent(model: CourseModel, event: Omit<LearningEvent, 'id' | 'userId' | 'courseId' | 'goalId' | 'createdAt'> & { createdAt?: string }): CourseModel {
  const now = event.createdAt || new Date().toISOString()
  const next = clone(model)
  const fullEvent: LearningEvent = { ...event, id: stableId('le', `${model.id}:${event.taskId || event.nodeIds.join(',')}:${event.eventType}:${now}`), userId: model.userId, courseId: model.id, goalId: model.goalId, createdAt: now }
  next.continuity.learningEvents.push(fullEvent)
  if (event.taskId) {
    const task = next.continuity.tasks.find(item => item.id === event.taskId)
    if (task && event.eventType === 'TASK_DONE') { task.status = 'DONE'; task.completedAt = now; task.updatedAt = now }
  }
  recalculateProgress(next.continuity, now)
  next.updatedAt = now
  return next
}

export function recordSubGoalCompletion(model: CourseModel, subGoalId: string, completed = true, now = new Date().toISOString()): CourseModel {
  const subGoal = model.continuity.subGoals.find(item => item.id === subGoalId)
  if (!subGoal) return model
  const next = recordLearningEvent(model, {
    nodeIds: subGoal.nodeIds,
    eventType: 'QUIZ_RESULT',
    score: completed ? 1 : 0,
    confidence: 0.85,
    payload: { subGoalId, completed },
    createdAt: now,
  })
  const nextSubGoal = next.continuity.subGoals.find(item => item.id === subGoalId)!
  nextSubGoal.status = completed ? 'COMPLETED' : 'ACTIVE'
  nextSubGoal.progress = completed ? 1 : Math.min(nextSubGoal.progress, 0.95)
  nextSubGoal.updatedAt = now
  recalculateProgress(next.continuity, now)
  return next
}

export function rollbackLatestRevision(model: CourseModel, now = new Date().toISOString()): CourseModel {
  const next = clone(model)
  const revision = [...next.continuity.revisions].reverse().find(item => item.triggerType === 'DOCUMENT_UPLOAD' && !item.revertedAt)
  if (!revision) return next
  revision.revertedAt = now
  next.continuity.currentStage = revision.beforeState.currentStage
  next.continuity.currentSubGoalId = revision.beforeState.currentSubGoalId
  next.continuity.goalProgress = revision.beforeState.goalProgress
  next.continuity.subGoals = clone(revision.beforeState.subGoals)
  next.continuity.tasks = clone(revision.beforeState.tasks)
  next.continuity.lastSummary = `已恢复到“${revision.summary}”之前的计划；历史记录仍保留。`
  next.updatedAt = now
  return next
}
