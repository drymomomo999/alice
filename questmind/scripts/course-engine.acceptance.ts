import assert from 'node:assert/strict'
import { applyMasteryEvent, buildCourseModel, buildStudyContext, buildStudyMap } from '../src/course-engine/engine'
import { applyPlanPatch, createPlanPatch, recordLearningEvent, recordSubGoalCompletion, resolveCourse, rollbackLatestRevision, selectTodayTasks, validatePlanPatch } from '../src/course-engine/continuity'
import type { CourseDocumentInput, PlanPatch } from '../src/course-engine/types'

const documents: CourseDocumentInput[] = [
  {
    id: 'slides', name: '概率论第5讲老师课件.pdf', mimeType: 'application/pdf',
    text: '第5讲 条件概率\n重点：贝叶斯公式\n---\n贝叶斯公式 P(A|B)=P(B|A)P(A)/P(B)\n推导：全概率公式 => 条件概率 => 贝叶斯公式\n---\n例题：医学检测中的贝叶斯公式\n---\n小结：贝叶斯公式是本讲重点',
  },
  {
    id: 'textbook', name: '概率论教材第2章.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    text: '第二章 条件概率\n贝叶斯公式是利用先验概率与新证据计算后验概率的方法。\n全概率公式用于拆分完备事件组。',
  },
  {
    id: 'homework', name: '第5讲作业.txt', mimeType: 'text/plain',
    text: '作业\n练习：使用贝叶斯公式计算后验概率？\n易错：条件方向不要写反。',
  },
]

let model = buildCourseModel({ userId: 'user', goalId: 'goal', courseName: '概率论', documents, now: '2026-09-07T00:00:00.000Z' })
assert.equal(model.documents.find(item => item.id === 'slides')?.classification.documentType, 'lecture_slides')
assert.equal(model.documents.find(item => item.id === 'textbook')?.classification.documentType, 'textbook')
assert.equal(model.documents.find(item => item.id === 'homework')?.classification.documentType, 'homework')
assert.ok(model.documents.every(item => item.processingStatus === 'READY'))

const bayes = model.nodes.find(node => node.canonicalName.includes('贝叶斯'))
assert.ok(bayes, '应生成贝叶斯公式知识节点')
assert.ok((bayes?.teacherEmphasis || 0) > 0.2, '跨页推导、例题与总结应形成老师信号')
assert.ok((bayes?.sourceEvidenceIds.length || 0) >= 2, '多源节点必须保留可回溯证据')
assert.ok(bayes?.explanation, '课件过简处应能获得教材解释')
assert.ok((bayes?.assessmentRelevance || 0) >= 0.7, '作业证据应提高考核相关度')

const map = buildStudyMap(model, 'systematic')
const mapItem = map.items.find(item => item.nodeId === bayes?.id)
assert.ok(map.mainline.length > 0)
assert.ok(mapItem?.learningRequirements.length)
assert.ok(mapItem?.teacherSignal)
assert.ok(mapItem?.nextAction)
assert.ok(mapItem?.evidenceIds.length)

model = applyMasteryEvent(model, bayes!.id, 'wrong', '条件方向混淆', '2026-09-07T01:00:00.000Z')
model = applyMasteryEvent(model, bayes!.id, 'wrong', '条件方向混淆', '2026-09-07T02:00:00.000Z')
const review = model.reviewQueue.find(item => item.nodeId === bayes!.id)
assert.ok(review?.reason.includes('同类错误 2 次'), '重复错误后复习队列必须解释原因')

const context = buildStudyContext(model, 'final_review')
assert.ok(context.estimatedTokens <= 2000, '结构化学习上下文不得超过硬预算')
assert.ok(!JSON.stringify(context).includes(documents[0].text), '学习上下文不得注入整份原始资料')

const fixture2 = buildCourseModel({
  userId: 'user', goalId: 'goal-2', courseName: '线性代数', now: '2026-09-07T00:00:00.000Z',
  documents: [
    { id: 's2', name: '线性代数课件第3讲.pdf', mimeType: 'application/pdf', text: '矩阵的秩\n重点：初等变换\n---\n例题：求矩阵的秩' },
    { id: 'h2', name: '第三讲习题.pdf', mimeType: 'application/pdf', text: '练习：使用初等变换求秩？' },
  ],
})
assert.ok(fixture2.nodes.length > 0)

const fixture3 = buildCourseModel({
  userId: 'user', goalId: 'goal-3', courseName: '微观经济学', now: '2026-09-07T00:00:00.000Z',
  documents: [
    { id: 's3', name: '微观经济学课件.pdf', mimeType: 'application/pdf', text: '需求价格弹性\n重点：弹性计算\n---\n例题：价格变化与需求量变化' },
    { id: 't3', name: '微观经济学教材第2章.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', text: '需求价格弹性是需求量变动率与价格变动率之比。' },
    { id: 'e3', name: '2025期末试卷.pdf', mimeType: 'application/pdf', text: '计算题：求需求价格弹性？' },
  ],
})
assert.ok(fixture3.nodes.some(node => node.assessmentRelevance >= 0.9))

// CCE MVP-1 ~ MVP-7：连续周次、稳定 ID、patch、进度、幂等、回滚与不确定归属。
const week1Documents: CourseDocumentInput[] = [{
  id: 'signals-w1', name: '信号与系统 Week 1.pdf', mimeType: 'application/pdf', uploadedAt: '2026-09-01T00:00:00.000Z',
  text: 'Week 1 基础信号\n冲激函数\n重点：冲激函数\n---\n连续信号与离散信号\n---\n练习：完成信号变换',
}]
let continuity = buildCourseModel({
  userId: 'user', goalId: 'signals-goal', courseName: '信号与系统', documents: week1Documents, now: '2026-09-01T00:00:00.000Z',
  initialPlan: {
    subGoals: [{ id: 'sg-week1', title: '基础信号', completed: false }],
    tasks: [
      { id: 'task-done', title: '学习连续与离散信号', completed: true, completedAt: '2026-09-01T01:00:00.000Z' },
      { id: 'task-impulse', title: '复习冲激函数', completed: false },
    ],
  },
})
const initialCourseId = continuity.id
const initialNode = continuity.nodes.find(node => node.canonicalName.includes('冲激函数'))
assert.ok(initialNode)
assert.equal(continuity.continuity.tasks.find(task => task.id === 'task-done')?.status, 'DONE')

const week2Documents: CourseDocumentInput[] = [...week1Documents, {
  id: 'signals-w2', name: '信号与系统 Week 2.pdf', mimeType: 'application/pdf', uploadedAt: '2026-09-08T00:00:00.000Z',
  text: 'Week 2 系统性质\n冲激函数\n重点：冲激函数\n---\nLTI 系统\n---\n线性与时不变\n---\n作业：判断系统性质',
}]
continuity = buildCourseModel({ userId: 'user', goalId: 'signals-goal', courseName: '信号与系统', documents: week2Documents, previous: continuity, now: '2026-09-08T00:00:00.000Z' })
assert.equal(continuity.id, initialCourseId, '连续周次必须沿用 course_id')
assert.equal(continuity.goalId, 'signals-goal', '连续周次必须沿用 goal_id')
assert.equal(continuity.continuity.tasks.find(task => task.id === 'task-done')?.status, 'DONE', '已完成历史不能重置')
assert.ok(continuity.continuity.lastDelta?.addedNodes.length, 'Week 2 必须生成新增节点 delta')
assert.ok(continuity.continuity.lastDelta?.strengthenedNodes.some(node => node.nodeId === initialNode?.id), '重复知识必须合并到同一 node_id 并增加 Evidence')
assert.ok(continuity.continuity.revisions.some(item => item.triggerType === 'DOCUMENT_UPLOAD'))
assert.ok(continuity.continuity.tasks.some(task => task.sourceRevisionId && task.nodeIds.some(id => continuity.continuity.lastDelta?.addedNodes.some(node => node.nodeId === id))))
assert.ok(continuity.continuity.revisions.at(-1)?.patch.taskActions.some(action => ['UPDATE', 'ADD'].includes(action.action) && ['TEACHER_EMPHASIS', 'REINFORCED_CONTENT'].includes(action.reasonCode)), '老师强化重点必须提升任务或追加复习')

const revisionCount = continuity.continuity.revisions.length
const taskIds = continuity.continuity.tasks.map(task => task.id)
const repeated = buildCourseModel({ userId: 'user', goalId: 'signals-goal', courseName: '信号与系统', documents: week2Documents, previous: continuity, now: '2026-09-08T02:00:00.000Z' })
assert.equal(repeated.continuity.revisions.length, revisionCount, '重复上传不得生成重复 revision')
assert.deepEqual(repeated.continuity.tasks.map(task => task.id), taskIds, '重复上传不得生成重复任务')

const today = selectTodayTasks(repeated, 30, '2026-09-09T00:00:00.000Z')
assert.ok(today.every(task => !['DONE', 'CANCELLED'].includes(task.status)), '今日任务不得重新放入完成或取消项')
assert.ok(today.reduce((sum, task) => sum + task.estimatedMinutes, 0) <= 30 || today.length === 1, '今日任务受可用时间约束')

const taskToFinish = repeated.continuity.tasks.find(task => task.status === 'READY')!
const afterTask = recordLearningEvent(repeated, { taskId: taskToFinish.id, nodeIds: taskToFinish.nodeIds, eventType: 'TASK_DONE', createdAt: '2026-09-09T00:30:00.000Z' })
assert.equal(afterTask.continuity.tasks.find(task => task.id === taskToFinish.id)?.status, 'DONE', '任务完成必须写回状态')
assert.ok(afterTask.continuity.learningEvents.some(event => event.taskId === taskToFinish.id), '任务完成必须形成 LearningEvent')
const activeSubGoal = afterTask.continuity.subGoals.find(item => item.status === 'ACTIVE')!
const afterSubGoal = recordSubGoalCompletion(afterTask, activeSubGoal.id, true, '2026-09-09T00:45:00.000Z')
assert.equal(afterSubGoal.continuity.subGoals.find(item => item.id === activeSubGoal.id)?.status, 'COMPLETED', '子目标完成后必须解锁下一阶段')
assert.ok(afterSubGoal.continuity.currentSubGoalId !== activeSubGoal.id || afterSubGoal.continuity.goalProgress === 1)

const uncertain = resolveCourse({ existingCourses: [repeated], documentName: '完全无法识别的材料.bin', documentText: '无关内容' })
assert.notEqual(uncertain.decision, 'MATCHED', '低置信度课程归属不得静默合并')
const explicit = resolveCourse({ existingCourses: [repeated], explicitCourseId: repeated.id, documentName: '老师临时命名.pdf' })
assert.equal(explicit.decision, 'MATCHED', '用户明确绑定应优先归入现有课程')

const latestDelta = repeated.continuity.lastDelta!
const safePatch = createPlanPatch(repeated, latestDelta, '2026-09-09T01:00:00.000Z')
assert.deepEqual(validatePlanPatch(repeated.continuity, safePatch), [])
const invalidPatch: PlanPatch = {
  ...safePatch, id: 'invalid-patch', subGoalActions: [],
  taskActions: [{ action: 'CANCEL', taskId: 'missing-task', reasonCode: 'OUTLINE_CHANGED', reason: '大纲替换' }],
}
assert.ok(validatePlanPatch(repeated.continuity, invalidPatch).length, '修改/取消没有稳定 ID 必须被拒绝')

const cancellable = repeated.continuity.tasks.find(task => task.status !== 'DONE')!
const cancelPatch: PlanPatch = {
  ...safePatch, id: 'outline-change-patch', triggerDocumentIds: ['outline-change'], subGoalActions: [],
  taskActions: [{ action: 'CANCEL', taskId: cancellable.id, reasonCode: 'OUTLINE_CHANGED', reason: '老师已删除原章节' }],
  userFacingSummary: '课程大纲发生变化，旧任务已取消但历史仍保留。', reviewRequired: false,
}
const cancelledState = applyPlanPatch(repeated.continuity, cancelPatch, '2026-09-09T02:00:00.000Z')
assert.equal(cancelledState.tasks.find(task => task.id === cancellable.id)?.status, 'CANCELLED')
assert.ok(cancelledState.revisions.some(item => item.patch.id === cancelPatch.id), '大纲变化必须保留 revision reason')
const cancelledModel = { ...repeated, continuity: cancelledState }
const rolledBack = rollbackLatestRevision(cancelledModel, '2026-09-09T03:00:00.000Z')
assert.notEqual(rolledBack.continuity.tasks.find(task => task.id === cancellable.id)?.status, 'CANCELLED', '回滚必须恢复上一版本')
assert.ok(rolledBack.continuity.revisions.find(item => item.patch.id === cancelPatch.id)?.revertedAt, '回滚不能删除 revision 历史')

assert.deepEqual(Object.keys(model).sort(), [
  'blocks','continuity','createdAt','documents','edges','evidence','goalId','id','mastery','masteryEvents','name','nodes','reviewQueue','teacherSignals','updatedAt','userId',
].sort(), '课程模型 contract snapshot 发生变化时必须显式更新验收')

console.log(`course-engine acceptance: ok (${model.nodes.length + fixture2.nodes.length + fixture3.nodes.length} nodes, 3 fixtures)`)
