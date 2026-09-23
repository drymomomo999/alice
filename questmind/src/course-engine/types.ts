export type CourseDocumentType =
  | 'textbook'
  | 'lecture_slides'
  | 'lecture_notes'
  | 'syllabus_exam_scope'
  | 'homework'
  | 'tutorial_exercises'
  | 'past_exam'
  | 'mistake_set'
  | 'other'

export type CourseProcessingStatus =
  | 'UPLOADED'
  | 'CLASSIFIED'
  | 'PARSED'
  | 'PEDAGOGICAL_EXTRACTED'
  | 'KNOWLEDGE_NORMALIZED'
  | 'ALIGNED_TO_COURSE'
  | 'READY'
  | 'FAILED_CLASSIFICATION'
  | 'FAILED_PARSING'
  | 'FAILED_EXTRACTION'
  | 'FAILED_ALIGNMENT'

export type PedagogicalBlockType =
  | 'title'
  | 'body'
  | 'formula'
  | 'example'
  | 'exercise'
  | 'warning'
  | 'summary'
  | 'derivation'

export type KnowledgeNodeType = 'formula' | 'concept' | 'theorem' | 'method' | 'skill'
export type ImportanceLevel = 'S' | 'A' | 'B' | 'C' | 'D'
export type StudyMode = 'preview' | 'systematic' | 'final_review' | 'exam_cram' | 'deep_understanding'
export type MasteryEventType = 'self_known' | 'correct' | 'correct_with_hint' | 'concept_correct' | 'wrong' | 'review_complete'

export type GoalLifecycleStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
export type SubGoalLifecycleStatus = 'LOCKED' | 'UPCOMING' | 'ACTIVE' | 'REVIEW' | 'COMPLETED' | 'SUPERSEDED'
export type ContinuityTaskStatus = 'PENDING' | 'READY' | 'IN_PROGRESS' | 'DONE' | 'SKIPPED' | 'CANCELLED' | 'OVERDUE'
export type PlanAction = 'KEEP' | 'ADD' | 'UPDATE' | 'REORDER' | 'RESCHEDULE' | 'CANCEL' | 'REOPEN' | 'SUPERSEDE'
export type PlanRevisionTrigger = 'INITIALIZE' | 'DOCUMENT_UPLOAD' | 'LEARNING_EVENT' | 'ROLLBACK' | 'FULL_REPLAN'
export type GenerationReason = 'NEW_CONTENT' | 'REVIEW' | 'PREREQUISITE' | 'ERROR_RECOVERY' | 'DEADLINE_CATCHUP'

export interface DocumentClassification {
  documentType: CourseDocumentType
  courseName: string
  chapter?: string
  language: 'zh' | 'en' | 'mixed'
  pageCount: number
  confidence: number
  reasons: string[]
  correctedByUser: boolean
}

export interface CourseDocumentInput {
  id: string
  name: string
  mimeType: string
  text: string
  uploadedAt?: string
  classification?: Partial<DocumentClassification>
}

export interface CourseDocument extends CourseDocumentInput {
  courseId: string
  classification: DocumentClassification
  processingStatus: CourseProcessingStatus
  processingErrorCode?: string
  processedAt?: string
}

export interface CourseMatchResult {
  courseId?: string
  score: number
  decision: 'MATCHED' | 'REVIEW_REQUIRED' | 'NEW_COURSE_CANDIDATE'
  reasons: string[]
}

export interface PedagogicalBlock {
  id: string
  documentId: string
  pageOrSlide: number
  order: number
  type: PedagogicalBlockType
  text: string
  visualEmphasis: number
}

export interface TeacherSignal {
  id: string
  documentId: string
  blockId: string
  pageOrSlide: number
  evidenceId: string
  explicitEmphasis: number
  visualEmphasis: number
  slideCoverage: number
  derivationSignal: number
  exampleSignal: number
  repetitionSignal: number
  summarySignal: number
  teacherEmphasis: number
}

export interface SourceEvidence {
  id: string
  documentId: string
  documentType: CourseDocumentType
  pageOrSlide: number
  blockId: string
  rawExcerpt: string
  evidenceType: 'definition' | 'teacher_emphasis' | 'derivation' | 'example' | 'exercise' | 'warning' | 'summary' | 'assessment'
  strength: number
  extractedAt: string
}

export interface KnowledgeNode {
  id: string
  courseId: string
  canonicalName: string
  aliases: string[]
  type: KnowledgeNodeType
  chapter?: string
  importanceLevel: ImportanceLevel
  mustUnderstand: boolean
  mustMemorize: boolean
  mustApply: boolean
  teacherEmphasis: number
  assessmentRelevance: number
  prerequisiteCentrality: number
  courseImportance: number
  personalPriority: number
  prerequisites: string[]
  commonErrors: string[]
  sourceEvidenceIds: string[]
  explanation?: string
  practiceTypes: string[]
}

export interface KnowledgeEdge {
  id: string
  courseId: string
  fromNodeId: string
  toNodeId: string
  relation: 'prerequisite' | 'related_to' | 'part_of'
  confidence: number
  evidenceIds: string[]
}

export interface MasteryDimensions {
  understand: number
  remember: number
  apply: number
}

export interface UserKnowledgeState {
  nodeId: string
  mastery: number
  dimensions: MasteryDimensions
  confidence: number
  lastStudiedAt?: string
  lastReviewedAt?: string
  correctCount: number
  wrongCount: number
  hintCount: number
  repeatedErrorTags: string[]
  nextReviewAt?: string
  intervalIndex: number
}

export interface MasteryEvent {
  id: string
  courseId: string
  nodeId: string
  type: MasteryEventType
  errorTag?: string
  createdAt: string
  masteryBefore: number
  masteryAfter: number
}

export interface ReviewItem {
  id: string
  courseId: string
  nodeId: string
  priority: number
  reason: string
  estimatedMinutes: number
  minimumTask: string
  scheduledFor: string
  completedAt?: string
}

export interface CourseDeltaNode {
  nodeId: string
  name: string
  evidenceIds: string[]
  reasonCode: 'NEW_NODE' | 'NEW_EVIDENCE' | 'CORRECTION' | 'PREREQUISITE_GAP' | 'ASSIGNMENT_DETECTED' | 'TEACHER_EMPHASIS'
}

export interface CourseDelta {
  courseId: string
  documentIds: string[]
  stageBefore: string
  stageAfter: string
  addedNodes: CourseDeltaNode[]
  strengthenedNodes: CourseDeltaNode[]
  correctedNodes: CourseDeltaNode[]
  newlyRequiredPrerequisites: CourseDeltaNode[]
  newlyDetectedAssignments: CourseDeltaNode[]
  teacherEmphasisChanges: CourseDeltaNode[]
  suggestedNextStage: string
  confidence: number
  createdAt: string
}

export interface ContinuitySubGoal {
  id: string
  goalId: string
  canonicalTitle: string
  nodeIds: string[]
  orderIndex: number
  status: SubGoalLifecycleStatus
  progress: number
  sourceVersion: number
  createdAt: string
  updatedAt: string
}

export interface ContinuityTask {
  id: string
  goalId: string
  subGoalId?: string
  nodeIds: string[]
  title: string
  description: string
  type: 'LEARN' | 'PRACTICE' | 'REVIEW' | 'ASSESS'
  status: ContinuityTaskStatus
  dueAt?: string
  priority: number
  estimatedMinutes: number
  generationReason: GenerationReason
  sourceRevisionId: string
  supersedesTaskId?: string
  completionSignal?: string
  unlockCondition?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface PlanSubGoalAction {
  action: PlanAction
  subGoalId?: string
  payload?: Partial<ContinuitySubGoal> & { canonicalTitle?: string }
  reasonCode: string
  reason: string
}

export interface PlanTaskAction {
  action: PlanAction
  taskId?: string
  payload?: Partial<ContinuityTask> & { title?: string }
  reasonCode: string
  reason: string
}

export interface PlanPatch {
  id: string
  courseId: string
  goalId: string
  triggerDocumentIds: string[]
  revisionReason: string
  subGoalActions: PlanSubGoalAction[]
  taskActions: PlanTaskAction[]
  progressPatch: { currentStage?: string; currentSubGoalId?: string; goalProgress?: number }
  userFacingSummary: string
  confidence: number
  reviewRequired: boolean
  plannerVersion: string
  createdAt: string
}

export interface PlanSnapshot {
  currentStage: string
  currentSubGoalId?: string
  goalProgress: number
  subGoals: ContinuitySubGoal[]
  tasks: ContinuityTask[]
}

export interface PlanRevision {
  id: string
  goalId: string
  triggerType: PlanRevisionTrigger
  triggerId: string
  patch: PlanPatch
  summary: string
  plannerVersion: string
  createdAt: string
  beforeState: PlanSnapshot
  revertedAt?: string
}

export interface LearningEvent {
  id: string
  userId: string
  courseId: string
  goalId: string
  taskId?: string
  nodeIds: string[]
  eventType: 'TASK_DONE' | 'QUIZ_RESULT' | 'USER_CONFUSION' | 'ERROR_RECORDED' | 'REVIEW_DONE'
  score?: number
  confidence?: number
  payload?: Record<string, unknown>
  createdAt: string
}

export interface CourseContinuityState {
  goalStatus: GoalLifecycleStatus
  currentStage: string
  currentSubGoalId?: string
  goalProgress: number
  subGoals: ContinuitySubGoal[]
  tasks: ContinuityTask[]
  revisions: PlanRevision[]
  learningEvents: LearningEvent[]
  processedDocumentKeys: string[]
  plannerVersion: string
  lastDelta?: CourseDelta
  lastSummary?: string
}

export interface StudyMapItem {
  nodeId: string
  name: string
  level: ImportanceLevel
  chapter?: string
  learningRequirements: string[]
  teacherSignal: string
  typicalQuestions: string[]
  commonErrors: string[]
  explanation?: string
  nextAction: string
  evidenceIds: string[]
}

export interface StudyMap {
  courseId: string
  mode: StudyMode
  generatedAt: string
  mainline: string[]
  items: StudyMapItem[]
}

export interface CourseModel {
  id: string
  userId: string
  goalId: string
  name: string
  createdAt: string
  updatedAt: string
  documents: CourseDocument[]
  blocks: PedagogicalBlock[]
  teacherSignals: TeacherSignal[]
  evidence: SourceEvidence[]
  nodes: KnowledgeNode[]
  edges: KnowledgeEdge[]
  mastery: Record<string, UserKnowledgeState>
  masteryEvents: MasteryEvent[]
  reviewQueue: ReviewItem[]
  continuity: CourseContinuityState
}

export interface StudyContext {
  course: string
  mode: StudyMode
  focusNodes: string[]
  mastery: Record<string, number>
  errorTags: string[]
  nextAction: string
  evidenceSummaryIds: string[]
  estimatedTokens: number
  truncated: boolean
}
