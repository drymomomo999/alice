import {
  IMPORTANCE_THRESHOLDS,
  IMPORTANCE_WEIGHTS,
  PERSONAL_PRIORITY_WEIGHTS,
  REVIEW_INTERVAL_DAYS,
  REVIEW_WEIGHTS,
  STUDY_CONTEXT_TOKEN_LIMIT,
  TEACHER_SIGNAL_WEIGHTS,
} from './config'
import { classifyDocument } from './documentClassifier'
import { extractPedagogicalBlocks } from './pedagogicalExtractor'
import type {
  CourseDocument,
  CourseDocumentInput,
  CourseModel,
  ImportanceLevel,
  KnowledgeEdge,
  KnowledgeNode,
  MasteryEvent,
  MasteryEventType,
  PedagogicalBlock,
  ReviewItem,
  SourceEvidence,
  StudyContext,
  StudyMap,
  StudyMode,
  TeacherSignal,
  UserKnowledgeState,
} from './types'
import { addDays, clamp, estimateTokens, normalizeName, round, similarity, stableId } from './utils'
import { reconcileContinuity, type InitialPlanSeed } from './continuity'

const EMPHASIS_RE = /(重点|注意|掌握|必会|考试|易错|核心|important|must|exam)/i
const ERROR_RE = /(易错|常见错误|不要|不能|混淆|误区|warning)/i

function requirementFor(block: PedagogicalBlock): Pick<KnowledgeNode, 'mustUnderstand' | 'mustMemorize' | 'mustApply'> {
  return {
    mustUnderstand: ['body', 'derivation', 'formula', 'title'].includes(block.type),
    mustMemorize: block.type === 'formula' || /(定义|定理|公式|记住|牢记)/i.test(block.text),
    mustApply: ['example', 'exercise', 'derivation'].includes(block.type),
  }
}

function nodeType(block: PedagogicalBlock): KnowledgeNode['type'] {
  if (block.type === 'formula') return 'formula'
  if (block.type === 'exercise' || block.type === 'example') return 'skill'
  if (block.type === 'derivation') return 'method'
  if (/(定理|theorem)/i.test(block.text)) return 'theorem'
  return 'concept'
}

function canonicalName(block: PedagogicalBlock): string {
  const text = block.text
    .replace(/^(重点|注意|例题?|练习|小结|总结|定义|概念)\s*[：:]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  const definition = text.match(/^(.{2,36}?)(?:是指|是|：|:|，|,)/)?.[1]
  const formulaLeft = text.match(/^([^=]{1,24})=/)?.[1]
  return (definition || formulaLeft || text.slice(0, 32)).replace(/[。；;]$/, '').trim()
}

function makeEvidence(document: CourseDocument, block: PedagogicalBlock): SourceEvidence {
  const type = block.type === 'warning'
    ? 'warning'
    : block.type === 'exercise'
      ? 'exercise'
      : block.type === 'example'
        ? 'example'
        : block.type === 'derivation'
          ? 'derivation'
          : block.type === 'summary'
            ? 'summary'
            : EMPHASIS_RE.test(block.text)
              ? 'teacher_emphasis'
              : document.classification.documentType === 'past_exam' || document.classification.documentType === 'homework'
                ? 'assessment'
                : 'definition'
  return {
    id: stableId('ev', `${document.id}:${block.id}:${type}`),
    documentId: document.id,
    documentType: document.classification.documentType,
    pageOrSlide: block.pageOrSlide,
    blockId: block.id,
    rawExcerpt: block.text.slice(0, 280),
    evidenceType: type,
    strength: round(block.visualEmphasis * 0.35 + (EMPHASIS_RE.test(block.text) ? 0.45 : 0.15) + (type === 'assessment' ? 0.25 : 0)),
    extractedAt: new Date().toISOString(),
  }
}

function calculateTeacherSignals(document: CourseDocument, blocks: PedagogicalBlock[], evidence: SourceEvidence[]): TeacherSignal[] {
  if (document.classification.documentType !== 'lecture_slides') return []
  const repeated = new Map<string, number>()
  blocks.forEach(block => {
    const name = normalizeName(canonicalName(block))
    if (name) repeated.set(name, (repeated.get(name) || 0) + 1)
  })
  return blocks.map(block => {
    const name = normalizeName(canonicalName(block))
    const values = {
      explicitEmphasis: EMPHASIS_RE.test(block.text) ? 1 : 0,
      visualEmphasis: block.visualEmphasis,
      slideCoverage: clamp((repeated.get(name) || 1) / Math.max(2, document.classification.pageCount)),
      derivationSignal: block.type === 'derivation' || block.type === 'formula' ? 1 : 0,
      exampleSignal: block.type === 'example' || block.type === 'exercise' ? 1 : 0,
      repetitionSignal: clamp(((repeated.get(name) || 1) - 1) / 2),
      summarySignal: block.type === 'summary' ? 1 : 0,
    }
    const teacherEmphasis = round(Object.entries(TEACHER_SIGNAL_WEIGHTS).reduce(
      (sum, [key, weight]) => sum + values[key as keyof typeof values] * weight,
      0,
    ))
    return {
      id: stableId('signal', `${document.id}:${block.id}`),
      documentId: document.id,
      blockId: block.id,
      pageOrSlide: block.pageOrSlide,
      evidenceId: evidence.find(item => item.blockId === block.id)?.id || '',
      ...values,
      teacherEmphasis,
    }
  })
}

function levelFor(score: number): ImportanceLevel {
  if (score >= IMPORTANCE_THRESHOLDS.S) return 'S'
  if (score >= IMPORTANCE_THRESHOLDS.A) return 'A'
  if (score >= IMPORTANCE_THRESHOLDS.B) return 'B'
  if (score >= IMPORTANCE_THRESHOLDS.C) return 'C'
  return 'D'
}

function defaultMastery(nodeId: string): UserKnowledgeState {
  return {
    nodeId,
    mastery: 0.35,
    dimensions: { understand: 0.35, remember: 0.35, apply: 0.35 },
    confidence: 0.25,
    correctCount: 0,
    wrongCount: 0,
    hintCount: 0,
    repeatedErrorTags: [],
    intervalIndex: 0,
  }
}

function buildNodes(
  courseId: string,
  documents: CourseDocument[],
  blocks: PedagogicalBlock[],
  evidence: SourceEvidence[],
  signals: TeacherSignal[],
  previousMastery: Record<string, UserKnowledgeState>,
): { nodes: KnowledgeNode[]; edges: KnowledgeEdge[]; mastery: Record<string, UserKnowledgeState> } {
  const nodes: KnowledgeNode[] = []
  const documentById = new Map(documents.map(document => [document.id, document]))

  blocks.filter(block => block.text.length >= 3).forEach(block => {
    const name = canonicalName(block)
    if (name.length < 2) return
    const document = documentById.get(block.documentId)
    if (!document) return
    const match = nodes
      .map(node => ({ node, score: similarity(node.canonicalName, name) }))
      .sort((a, b) => b.score - a.score)[0]
    const evidenceItem = evidence.find(item => item.blockId === block.id)
    const signal = signals.find(item => item.blockId === block.id)
    const requirements = requirementFor(block)
    const assessment = ['homework', 'tutorial_exercises', 'past_exam', 'syllabus_exam_scope', 'mistake_set'].includes(document.classification.documentType)
      ? document.classification.documentType === 'past_exam' || document.classification.documentType === 'syllabus_exam_scope' ? 0.9 : 0.72
      : 0.15
    if (match && match.score >= 0.72) {
      const node = match.node
      if (!node.aliases.includes(name) && normalizeName(name) !== normalizeName(node.canonicalName)) node.aliases.push(name)
      if (evidenceItem && !node.sourceEvidenceIds.includes(evidenceItem.id)) node.sourceEvidenceIds.push(evidenceItem.id)
      node.mustUnderstand ||= requirements.mustUnderstand
      node.mustMemorize ||= requirements.mustMemorize
      node.mustApply ||= requirements.mustApply
      node.teacherEmphasis = Math.max(node.teacherEmphasis, signal?.teacherEmphasis || 0)
      node.assessmentRelevance = Math.max(node.assessmentRelevance, assessment)
      if (ERROR_RE.test(block.text)) node.commonErrors.push(block.text.slice(0, 80))
      if (['example', 'exercise'].includes(block.type)) node.practiceTypes.push(block.type === 'exercise' ? '练习题' : '例题迁移')
      if (!node.explanation && document.classification.documentType === 'textbook' && block.type === 'body') node.explanation = block.text.slice(0, 220)
      return
    }
    const id = stableId('kn', `${courseId}:${normalizeName(name)}`)
    nodes.push({
      id,
      courseId,
      canonicalName: name,
      aliases: [],
      type: nodeType(block),
      chapter: document.classification.chapter,
      importanceLevel: 'D',
      ...requirements,
      teacherEmphasis: signal?.teacherEmphasis || 0,
      assessmentRelevance: assessment,
      prerequisiteCentrality: 0,
      courseImportance: 0,
      personalPriority: 0,
      prerequisites: [],
      commonErrors: ERROR_RE.test(block.text) ? [block.text.slice(0, 80)] : [],
      sourceEvidenceIds: evidenceItem ? [evidenceItem.id] : [],
      explanation: document.classification.documentType === 'textbook' && block.type === 'body' ? block.text.slice(0, 220) : undefined,
      practiceTypes: ['example', 'exercise'].includes(block.type) ? [block.type === 'exercise' ? '练习题' : '例题迁移'] : [],
    })
  })

  const edges: KnowledgeEdge[] = []
  documents.forEach(document => {
    const documentBlocks = blocks.filter(block => block.documentId === document.id)
    let previousNode: KnowledgeNode | undefined
    documentBlocks.forEach(block => {
      const current = nodes
        .map(node => ({ node, score: similarity(node.canonicalName, canonicalName(block)) }))
        .sort((a, b) => b.score - a.score)[0]
      if (!current || current.score < 0.72) return
      if (previousNode && previousNode.id !== current.node.id) {
        const id = stableId('edge', `${courseId}:${previousNode.id}:${current.node.id}`)
        if (!edges.some(edge => edge.id === id)) edges.push({
          id,
          courseId,
          fromNodeId: previousNode.id,
          toNodeId: current.node.id,
          relation: 'prerequisite',
          confidence: 0.58,
          evidenceIds: current.node.sourceEvidenceIds.slice(0, 1),
        })
      }
      previousNode = current.node
    })
  })

  const outgoing = new Map<string, number>()
  edges.forEach(edge => outgoing.set(edge.fromNodeId, (outgoing.get(edge.fromNodeId) || 0) + 1))
  const maxOutgoing = Math.max(1, ...outgoing.values())
  const mastery: Record<string, UserKnowledgeState> = {}
  nodes.forEach(node => {
    node.prerequisiteCentrality = round((outgoing.get(node.id) || 0) / maxOutgoing)
    const evidenceStrength = node.sourceEvidenceIds
      .map(id => evidence.find(item => item.id === id)?.strength || 0)
      .reduce((sum, value) => sum + value, 0) / Math.max(1, node.sourceEvidenceIds.length)
    const contentCore = clamp(0.35 + node.sourceEvidenceIds.length * 0.1 + evidenceStrength * 0.35)
    node.courseImportance = round(
      contentCore * IMPORTANCE_WEIGHTS.contentCore
      + node.teacherEmphasis * IMPORTANCE_WEIGHTS.teacherEmphasis
      + node.assessmentRelevance * IMPORTANCE_WEIGHTS.assessmentRelevance
      + node.prerequisiteCentrality * IMPORTANCE_WEIGHTS.prerequisiteCentrality,
    )
    const state = previousMastery[node.id] || defaultMastery(node.id)
    mastery[node.id] = state
    node.personalPriority = round(
      node.courseImportance * PERSONAL_PRIORITY_WEIGHTS.courseImportance
      + (1 - state.mastery) * PERSONAL_PRIORITY_WEIGHTS.userWeakness,
    )
    node.importanceLevel = levelFor(node.courseImportance)
    node.commonErrors = [...new Set(node.commonErrors)].slice(0, 4)
    node.practiceTypes = [...new Set(node.practiceTypes)].slice(0, 4)
  })

  return { nodes: nodes.sort((a, b) => b.personalPriority - a.personalPriority).slice(0, 60), edges, mastery }
}

export function buildCourseModel(options: {
  userId: string
  goalId: string
  courseName: string
  documents: CourseDocumentInput[]
  previous?: CourseModel | null
  initialPlan?: InitialPlanSeed
  now?: string
}): CourseModel {
  const now = options.now || new Date().toISOString()
  const courseId = options.previous?.id || stableId('course', `${options.userId}:${options.goalId}`)
  const documents: CourseDocument[] = options.documents.map(input => ({
    ...input,
    courseId,
    classification: classifyDocument(input, options.courseName),
    processingStatus: 'CLASSIFIED',
  }))
  const blocks = documents.flatMap(document => extractPedagogicalBlocks(document))
  const evidence = blocks.map(block => makeEvidence(documents.find(document => document.id === block.documentId)!, block))
  const teacherSignals = documents.flatMap(document => calculateTeacherSignals(document, blocks.filter(block => block.documentId === document.id), evidence))
  const normalized = buildNodes(courseId, documents, blocks, evidence, teacherSignals, options.previous?.mastery || {})
  documents.forEach(document => {
    document.processingStatus = 'READY'
    document.processedAt = now
  })
  const model: CourseModel = {
    id: courseId,
    userId: options.userId,
    goalId: options.goalId,
    name: options.courseName,
    createdAt: options.previous?.createdAt || now,
    updatedAt: now,
    documents,
    blocks,
    teacherSignals,
    evidence,
    nodes: normalized.nodes,
    edges: normalized.edges,
    mastery: normalized.mastery,
    masteryEvents: options.previous?.masteryEvents || [],
    reviewQueue: [],
    continuity: undefined as unknown as CourseModel['continuity'],
  }
  model.reviewQueue = buildReviewQueue(model, now)
  model.continuity = reconcileContinuity(model, options.previous, now, options.initialPlan)
  return model
}

export function applyMasteryEvent(
  model: CourseModel,
  nodeId: string,
  type: MasteryEventType,
  errorTag?: string,
  now = new Date().toISOString(),
): CourseModel {
  const state = { ...(model.mastery[nodeId] || defaultMastery(nodeId)), dimensions: { ...(model.mastery[nodeId]?.dimensions || defaultMastery(nodeId).dimensions) } }
  const before = state.mastery
  const deltas: Record<MasteryEventType, number> = {
    self_known: 0.06,
    correct: 0.14,
    correct_with_hint: 0.06,
    concept_correct: 0.12,
    wrong: -0.18,
    review_complete: 0.08,
  }
  state.mastery = round(clamp(state.mastery + deltas[type]))
  state.confidence = round(clamp(state.confidence + (type === 'self_known' ? 0.04 : 0.1)))
  state.lastStudiedAt = now
  if (type === 'review_complete') state.lastReviewedAt = now
  if (type === 'correct' || type === 'concept_correct') state.correctCount += 1
  if (type === 'correct_with_hint') { state.correctCount += 1; state.hintCount += 1 }
  if (type === 'wrong') {
    state.wrongCount += 1
    state.intervalIndex = Math.max(0, state.intervalIndex - 1)
    if (errorTag) state.repeatedErrorTags = [...state.repeatedErrorTags, errorTag].slice(-8)
  } else if (type !== 'self_known') {
    state.intervalIndex = Math.min(REVIEW_INTERVAL_DAYS.length - 1, state.intervalIndex + 1)
  }
  if (type === 'concept_correct') state.dimensions.understand = round(clamp(state.dimensions.understand + 0.16))
  if (type === 'correct' || type === 'correct_with_hint') state.dimensions.apply = round(clamp(state.dimensions.apply + deltas[type]))
  if (type === 'self_known' || type === 'review_complete') state.dimensions.remember = round(clamp(state.dimensions.remember + deltas[type]))
  if (type === 'wrong') state.dimensions.apply = round(clamp(state.dimensions.apply - 0.2))
  state.nextReviewAt = addDays(now, REVIEW_INTERVAL_DAYS[state.intervalIndex])
  const event: MasteryEvent = {
    id: stableId('me', `${model.id}:${nodeId}:${type}:${now}`),
    courseId: model.id,
    nodeId,
    type,
    errorTag,
    createdAt: now,
    masteryBefore: before,
    masteryAfter: state.mastery,
  }
  const next: CourseModel = {
    ...model,
    updatedAt: now,
    mastery: { ...model.mastery, [nodeId]: state },
    masteryEvents: [...model.masteryEvents, event],
    nodes: model.nodes.map(node => node.id === nodeId
      ? { ...node, personalPriority: round(node.courseImportance * 0.75 + (1 - state.mastery) * 0.25) }
      : node),
  }
  next.reviewQueue = buildReviewQueue(next, now)
  return next
}

export function buildReviewQueue(model: CourseModel, now = new Date().toISOString(), availableMinutes = 45): ReviewItem[] {
  const nowMs = new Date(now).getTime()
  const ranked = model.nodes.map(node => {
    const state = model.mastery[node.id] || defaultMastery(node.id)
    const reference = state.lastReviewedAt || state.lastStudiedAt || model.createdAt
    const days = Math.max(0, (nowMs - new Date(reference).getTime()) / 86400000)
    const interval = REVIEW_INTERVAL_DAYS[state.intervalIndex] || 1
    const forgettingRisk = clamp(days / interval)
    const repeatedErrorRisk = clamp(state.repeatedErrorTags.length / 2)
    const priority = round(
      (1 - state.mastery) * REVIEW_WEIGHTS.masteryGap
      + forgettingRisk * REVIEW_WEIGHTS.forgettingRisk
      + node.courseImportance * REVIEW_WEIGHTS.courseImportance
      + node.assessmentRelevance * REVIEW_WEIGHTS.assessmentRelevance
      + repeatedErrorRisk * REVIEW_WEIGHTS.repeatedErrorRisk,
    )
    const reasons = [
      state.wrongCount >= 2 ? `同类错误 ${state.wrongCount} 次` : '',
      forgettingRisk >= 0.8 ? `${Math.floor(days)} 天未复习` : '',
      ['S', 'A'].includes(node.importanceLevel) ? `${node.importanceLevel} 级课程重点` : '',
      node.assessmentRelevance >= 0.7 ? '作业或考试资料有对应证据' : '',
      state.mastery < 0.5 ? '当前掌握度偏低' : '',
    ].filter(Boolean)
    return {
      id: stableId('review', `${model.id}:${node.id}:${now.slice(0, 10)}`),
      courseId: model.id,
      nodeId: node.id,
      priority,
      reason: reasons.slice(0, 2).join(' + ') || '进入基础巩固周期',
      estimatedMinutes: node.mustApply ? 12 : 8,
      minimumTask: node.mustApply ? '1 个概念辨析 + 2 道应用题' : '回忆核心定义 + 1 个自测问题',
      scheduledFor: now.slice(0, 10),
    } satisfies ReviewItem
  }).sort((a, b) => b.priority - a.priority)

  const queue: ReviewItem[] = []
  let used = 0
  for (const item of ranked) {
    if (used + item.estimatedMinutes > availableMinutes && queue.length > 0) continue
    queue.push(item)
    used += item.estimatedMinutes
    if (used >= availableMinutes) break
  }
  return queue
}

export function buildStudyMap(model: CourseModel, mode: StudyMode = 'systematic'): StudyMap {
  const limit = mode === 'preview' ? 8 : mode === 'exam_cram' ? 10 : 18
  const sorted = [...model.nodes].sort((a, b) => {
    if (mode === 'exam_cram' || mode === 'final_review') return (b.assessmentRelevance + b.personalPriority) - (a.assessmentRelevance + a.personalPriority)
    return b.personalPriority - a.personalPriority
  }).slice(0, limit)
  const mainline = [...model.edges]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 7)
    .map(edge => `${model.nodes.find(node => node.id === edge.fromNodeId)?.canonicalName} → ${model.nodes.find(node => node.id === edge.toNodeId)?.canonicalName}`)
    .filter(value => !value.includes('undefined'))
  if (!mainline.length) mainline.push(...sorted.slice(0, 6).map(node => node.canonicalName))
  return {
    courseId: model.id,
    mode,
    generatedAt: new Date().toISOString(),
    mainline,
    items: sorted.map(node => ({
      nodeId: node.id,
      name: node.canonicalName,
      level: node.importanceLevel,
      chapter: node.chapter,
      learningRequirements: [node.mustUnderstand ? '理解' : '', node.mustMemorize ? '记忆' : '', node.mustApply ? '会算/会用' : ''].filter(Boolean),
      teacherSignal: node.teacherEmphasis >= 0.55 ? '老师明确强调或投入较多篇幅' : node.teacherEmphasis >= 0.3 ? '课件中存在教学投入信号' : '暂无强老师强调信号',
      typicalQuestions: node.practiceTypes,
      commonErrors: node.commonErrors,
      explanation: node.explanation,
      nextAction: node.mustApply ? `用 12 分钟完成 ${node.canonicalName} 的概念辨析和 2 道题` : `用 8 分钟复述 ${node.canonicalName} 并完成 1 次自测`,
      evidenceIds: node.sourceEvidenceIds,
    })),
  }
}

export function buildStudyContext(model: CourseModel, mode: StudyMode, focusNodeIds?: string[]): StudyContext {
  const nodes = (focusNodeIds?.length ? focusNodeIds.map(id => model.nodes.find(node => node.id === id)).filter(Boolean) : model.nodes)
    .slice(0, 10) as KnowledgeNode[]
  const review = model.reviewQueue.find(item => nodes.some(node => node.id === item.nodeId)) || model.reviewQueue[0]
  const context: StudyContext = {
    course: model.name,
    mode,
    focusNodes: nodes.map(node => node.canonicalName),
    mastery: Object.fromEntries(nodes.map(node => [node.canonicalName, model.mastery[node.id]?.mastery ?? 0.35])),
    errorTags: [...new Set(nodes.flatMap(node => model.mastery[node.id]?.repeatedErrorTags || []))].slice(0, 8),
    nextAction: review ? model.nodes.find(node => node.id === review.nodeId)?.canonicalName + '：' + review.minimumTask : '先完成 Study Map 中优先级最高的知识点',
    evidenceSummaryIds: [...new Set(nodes.flatMap(node => node.sourceEvidenceIds))].slice(0, 12),
    estimatedTokens: 0,
    truncated: false,
  }
  context.estimatedTokens = estimateTokens(JSON.stringify(context))
  while (context.estimatedTokens > STUDY_CONTEXT_TOKEN_LIMIT && context.focusNodes.length > 3) {
    context.focusNodes.pop()
    const keep = new Set(context.focusNodes)
    context.mastery = Object.fromEntries(Object.entries(context.mastery).filter(([name]) => keep.has(name)))
    context.truncated = true
    context.estimatedTokens = estimateTokens(JSON.stringify(context))
  }
  return context
}

export function evidenceForNode(model: CourseModel, nodeId: string): SourceEvidence[] {
  const node = model.nodes.find(item => item.id === nodeId)
  if (!node) return []
  return node.sourceEvidenceIds.map(id => model.evidence.find(item => item.id === id)).filter(Boolean) as SourceEvidence[]
}

export function blockForEvidence(model: CourseModel, evidenceId: string): PedagogicalBlock | undefined {
  const evidence = model.evidence.find(item => item.id === evidenceId)
  return evidence ? model.blocks.find(block => block.id === evidence.blockId) : undefined
}
