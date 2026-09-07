import type { CourseDocumentType } from './types'

export const TEACHER_SIGNAL_WEIGHTS = {
  explicitEmphasis: 0.2,
  visualEmphasis: 0.15,
  slideCoverage: 0.2,
  derivationSignal: 0.15,
  exampleSignal: 0.15,
  repetitionSignal: 0.1,
  summarySignal: 0.05,
} as const

export const IMPORTANCE_WEIGHTS = {
  contentCore: 0.31,
  teacherEmphasis: 0.28,
  assessmentRelevance: 0.24,
  prerequisiteCentrality: 0.17,
} as const

export const PERSONAL_PRIORITY_WEIGHTS = {
  courseImportance: 0.75,
  userWeakness: 0.25,
} as const

export const REVIEW_WEIGHTS = {
  masteryGap: 0.3,
  forgettingRisk: 0.2,
  courseImportance: 0.2,
  assessmentRelevance: 0.15,
  repeatedErrorRisk: 0.15,
} as const

export const IMPORTANCE_THRESHOLDS = { S: 0.82, A: 0.68, B: 0.5, C: 0.32 } as const
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const
export const STUDY_CONTEXT_TOKEN_LIMIT = 2000

export const DOCUMENT_TYPE_LABELS: Record<CourseDocumentType, string> = {
  textbook: '教材',
  lecture_slides: '老师课件',
  lecture_notes: '课堂笔记',
  syllabus_exam_scope: '考试范围',
  homework: '作业',
  tutorial_exercises: '习题资料',
  past_exam: '往年试卷',
  mistake_set: '错题集',
  other: '其他资料',
}
