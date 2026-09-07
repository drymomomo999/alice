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
