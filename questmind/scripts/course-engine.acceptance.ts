import assert from 'node:assert/strict'
import { applyMasteryEvent, buildCourseModel, buildStudyContext, buildStudyMap } from '../src/course-engine/engine'
import type { CourseDocumentInput } from '../src/course-engine/types'

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

assert.deepEqual(Object.keys(model).sort(), [
  'blocks','createdAt','documents','edges','evidence','goalId','id','mastery','masteryEvents','name','nodes','reviewQueue','teacherSignals','updatedAt','userId',
].sort(), '课程模型 contract snapshot 发生变化时必须显式更新验收')

console.log(`course-engine acceptance: ok (${model.nodes.length + fixture2.nodes.length + fixture3.nodes.length} nodes, 3 fixtures)`)
