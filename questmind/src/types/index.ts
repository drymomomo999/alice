// User types
export type TimePreference = 'early' | 'night' | 'flexible'
export type GoalCategory = 'study' | 'fitness' | 'reading' | 'exam' | 'career' | 'language' | 'skill' | 'other'

export interface User {
  id: string
  email?: string
  nickname: string
  avatar?: string
  createdAt: string
  // 统计字段
  totalGoalsCompleted?: number
  totalFocusMinutes?: number
  // Onboarding fields
  timePreference?: TimePreference
  goalPreferences?: GoalCategory[]
  onboardingCompleted?: boolean
  // 位置信息
  city?: string   // 城市名称（用于天气问候）
}

// 认证相关类型
export interface AuthResult {
  success: boolean
  user?: User
  error?: string
  isNewUser?: boolean
}

// Goal types
export type GoalStatus = 'active' | 'completed' | 'paused' | 'abandoned'
export type GoalPriority = 'low' | 'medium' | 'high'

// 目标附件类型
export interface GoalAttachment {
  id: string
  name: string
  type: 'document' | 'image'
  mimeType: string
  size: number                       // bytes
  storagePath?: string               // Supabase Storage 路径（未登录时为空）
  url?: string                       // 公开访问 URL（未登录时为空）
  extractedText?: string             // 文档提取的文字（截断至3000字，图片为空）
  imageDescription?: string          // 用户输入的图片描述（文档为空）
  uploadedAt: string
}

export interface Goal {
  id: string
  userId: string
  title: string
  description: string
  status: GoalStatus
  priority: GoalPriority
  category?: GoalCategory             // 目标分类（study/fitness/reading/exam/career/language/skill/other）
  startDate: string
  endDate: string
  progress: number
  subGoals: SubGoal[]
  createdAt: string
  updatedAt: string
  // AI 增强字段
  currentStatus?: string      // 用户当前状态描述（如"体重75kg，久坐上班族"）
  dailyTasks?: DailyTask[]    // 每日任务列表
  context?: string            // 用户补充的背景信息，供 AI 参考
  attachments?: GoalAttachment[]  // 文件附件列表
}

export interface SubGoal {
  id: string
  goalId: string
  title: string
  completed: boolean
  completedAt?: string
  // AI 增强字段（Step 1 新增）
  description?: string      // 子目标详细描述
  dayRange?: string         // 对应天数范围（如"Day 1-3"）
}

// 每日任务类型
export interface DailyTask {
  id: string
  goalId: string
  title: string           // 任务标题（动作+对象+量化格式）
  description?: string    // 任务描述
  duration?: number       // 预计时长（分钟）
  frequency?: 'daily' | 'custom'  // 频率
  completed: boolean
  completedAt?: string
  orderIndex: number
  // AI 增强字段（Step 1 新增）
  dayIndex?: number          // 第几天执行（用于多日计划中的日程定位）
  subGoalIndex?: number      // 关联的子目标索引
  difficultyLevel?: 'easy' | 'medium' | 'hard'  // 任务难度
  resourceReference?: string  // 引用的参考资料位置（如"教材第3章P45-P62"）
  checklist?: string[]       // 执行步骤清单
  // 倒计时相关字段
  startedAt?: string      // 任务开始时间（ISO 字符串）
  elapsedSeconds?: number // 当前运行周期已用时间（秒），每次 resume 重置
  isRunning?: boolean     // 是否正在计时
  lastResumedAt?: number  // 上次恢复时的时间戳（毫秒），用于计算当前周期时间
  baseElapsed?: number    // 历史累积时间（秒），暂停前的已用时间，resume 时固定不变
}

// AI Companion types
export type AICharacter = 'xiaoSi' | 'coach' | 'friend' | 'rem' | 'alice'

export interface AICharacterData {
  id: AICharacter
  name: string
  avatar: string
  description: string
  personality: string
  voice?: string
}

export interface AIMessage {
  id: string
  characterId: AICharacter
  content: string
  timestamp: string
  isUser: boolean
}

// Quiz types
export interface QuizQuestion {
  id: string
  question: string
  options: string[]
  correctIndex: number
  explanation?: string
  difficulty: 'easy' | 'medium' | 'hard'
}

export interface QuizResult {
  questionId: string
  selectedIndex: number
  correct: boolean
  timeSpent: number
}

