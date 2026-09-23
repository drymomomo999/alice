export type CoursewareFileType = 'pptx' | 'pdf' | 'docx' | 'text'

export type KnowledgePointProgress = 'NOT_STARTED' | 'LEARNING' | 'MASTERED' | 'REVIEW'

export interface CoursewareKnowledgePoint {
  id: string
  title: string
  summary: string
  explanation: string
  whyItMatters: string
  sourceSlides: number[]
  prerequisites: string[]
  commonMistakes: string[]
  checkQuestion: string
  checkAnswer: string
  progress: KnowledgePointProgress
  detailedExplanation?: string
}

export interface CoursewareSection {
  id: string
  title: string
  summary: string
  knowledgePointIds: string[]
}

export interface CoursewareAnalysis {
  pageLectures?: Record<number, string>
  title: string
  courseHint: string
  summary: string
  learningObjectives: string[]
  sections: CoursewareSection[]
  knowledgePoints: CoursewareKnowledgePoint[]
  suggestedPath: string[]
}

export interface CoursewareStudy {
  id: string
  userId: string
  fileName: string
  fileType: CoursewareFileType
  fileSize: number
  sourceText: string
  slidePreview?: {
    id: string
    slideCount: number
    renderer: 'powerpoint'
    createdAt: string
  }
  slidePreviewError?: string
  analysis: CoursewareAnalysis
  createdAt: string
  updatedAt: string
}
