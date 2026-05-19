/**
 * Goals 页面 — 目标管理主页面
 *
 * 三栏布局：左栏(目标列表) + 中栏(目标详情+AI学习指南) + 右栏(艾莉丝聊天)
 */
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGoalsStore, useUserStore } from '@/store'
import { generateId } from '@/lib/utils'
import { generateStatusQuestions, generateGoalPlan, generateQuizQuestions, buildGoalContextString, type GoalPlanResult } from '@/services/ai.service'
import type { Goal, GoalPriority, GoalCategory, DailyTask, QuizQuestion, GoalAttachment } from '@/types'

// 拆分后的子组件
import { GoalListPanel } from './components/GoalListPanel'
import { GoalDetailPanel } from './components/GoalDetailPanel'
import { AliceChatPanel } from './components/AliceChatPanel'
import { QuizDialog } from './components/QuizDialog'
import { NewGoalDialog } from './components/NewGoalDialog'
import { SmartCreateDialog } from './components/SmartCreateDialog'

// ============================================================
// Types
// ============================================================
type AIWizardStep = 'goal' | 'status' | 'plan'

interface AIWizardState {
  step: AIWizardStep
  goalTitle: string
  goalContext: string
  attachments: GoalAttachment[]
  questions: string[]
  statusAnswers: string[]
  planResult: GoalPlanResult | null
  isLoading: boolean
  error: string | null
}

// ============================================================
// Main Page
// ============================================================
export function GoalsPage() {
  const {
    goals, addGoal, updateGoal, deleteGoal,
    toggleSubGoal, toggleDailyTask, startDailyTask, stopDailyTask,
    resetDailyTasks,
  } = useGoalsStore()
  const { user, addCoins } = useUserStore()

  // State
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [goalsVersion, setGoalsVersion] = useState(0)

  // Dialog
  const [showNewGoalDialog, setShowNewGoalDialog] = useState(false)
  const [showSmartCreateDialog, setShowSmartCreateDialog] = useState(false)
  const [newGoal, setNewGoal] = useState({
    title: '', description: '', context: '', category: 'study' as GoalCategory,
    priority: 'medium' as GoalPriority, endDate: '',
    subGoals: [{ title: '' }],
    attachments: [] as GoalAttachment[],
  })

  // AI wizard
  const [wizardState, setWizardState] = useState<AIWizardState>({
    step: 'goal', goalTitle: '', goalContext: '', attachments: [],
    questions: [], statusAnswers: [],
    planResult: null, isLoading: false, error: null,
  })

  // Coin toast
  const [coinToast, setCoinToast] = useState<{ show: boolean; amount: number; reason: string }>({ show: false, amount: 0, reason: '' })

  // 考核验证
  const [quizState, setQuizState] = useState<{
    open: boolean
    goalId: string
    subGoalId: string
    subGoalTitle: string
    questions: QuizQuestion[]
    currentIdx: number
    answers: number[]
    isLoading: boolean
    error: string | null
    result: 'pass' | 'fail' | null
  }>({
    open: false, goalId: '', subGoalId: '', subGoalTitle: '',
    questions: [], currentIdx: 0, answers: [],
    isLoading: false, error: null, result: null,
  })

  // Refs
  const goalsRef = useRef(goals)
  goalsRef.current = goals
  const showCoinToast = (amount: number, reason: string) => {
    addCoins(amount)
    setCoinToast({ show: true, amount, reason })
    setTimeout(() => setCoinToast({ show: false, amount: 0, reason: '' }), 3000)
  }
  const showCoinToastRef = useRef(showCoinToast)
  showCoinToastRef.current = showCoinToast

  // Selected goal
  const selectedGoal = goals.find(g => g.id === selectedGoalId) || null

  // Timer tick — 每秒刷新运行中任务的显示时间
  useEffect(() => {
    const timer = setInterval(() => {
      setGoalsVersion(v => v + 1)
      const currentGoals = goalsRef.current
      currentGoals.forEach(goal => {
        goal.dailyTasks?.forEach(task => {
          if (task.isRunning && task.lastResumedAt && task.duration) {
            const base = task.baseElapsed ?? 0
            const current = Math.floor((Date.now() - task.lastResumedAt) / 1000)
            const totalElapsed = base + current
            if (totalElapsed >= task.duration * 60) {
              stopDailyTask(goal.id, task.id, true)
              showCoinToastRef.current(15, '完成今日任务 +15 金币！')
            }
          }
        })
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [stopDailyTask])

  // Daily reset
  useEffect(() => {
    const check = () => {
      const last = localStorage.getItem('lastDailyTasksReset')
      const today = new Date().toDateString()
      if (last !== today) { resetDailyTasks(); localStorage.setItem('lastDailyTasksReset', today) }
    }
    check()
    const t = setInterval(check, 3600000)
    return () => clearInterval(t)
  }, [resetDailyTasks])

  // Handlers
  const handleStartQuiz = async (goalId: string, subGoalId: string, subGoalTitle: string) => {
    setQuizState({
      open: true, goalId, subGoalId, subGoalTitle,
      questions: [], currentIdx: 0, answers: [],
      isLoading: true, error: null, result: null,
    })
    try {
      const goal = goals.find(g => g.id === goalId) || null
      const goalContext = goal ? buildGoalContextString(goal) : ''
      const raw = await generateQuizQuestions({ topic: subGoalTitle, difficulty: 'easy', count: 3, goalContext })
      const parsed = JSON.parse(raw)
      const questions: QuizQuestion[] = (parsed.questions || []).map((q: any, i: number) => ({
        id: q.id || `q${i}`,
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        difficulty: 'easy' as const,
      }))
      if (questions.length === 0) throw new Error('未生成题目')
      setQuizState(prev => ({ ...prev, questions, isLoading: false }))
    } catch {
      const fallbackQuestions: QuizQuestion[] = [
        {
          id: 'f1', question: `关于"${subGoalTitle}"，你是否已经掌握了核心要点？`,
          options: ['还没有，需要继续学习', '已经基本掌握了', '非常熟练', '完全不了解'],
          correctIndex: 2, explanation: '只有非常熟练才算真正掌握！', difficulty: 'easy',
        },
        {
          id: 'f2', question: `你能在没有参考的情况下独立完成"${subGoalTitle}"相关任务吗？`,
          options: ['完全不行', '需要一些提示', '可以独立完成', '可以教别人'],
          correctIndex: 2, explanation: '能独立完成才是真正的掌握。', difficulty: 'easy',
        },
      ]
      setQuizState(prev => ({ ...prev, questions: fallbackQuestions, isLoading: false }))
    }
  }

  const handleQuizComplete = () => {
    const { goalId, subGoalId, answers, questions } = quizState
    const correctCount = answers.filter((a, i) => a === questions[i]?.correctIndex).length
    const passed = correctCount >= Math.ceil(questions.length * 0.6)
    if (passed) {
      const goal = goals.find(g => g.id === goalId)
      if (goal) {
        toggleSubGoal(goalId, subGoalId)
        const updated = goal.subGoals.map(sg => sg.id === subGoalId ? { ...sg, completed: true } : sg)
        const completedCount = updated.filter(sg => sg.completed).length
        const newProgress = updated.length > 0 ? Math.round((completedCount / updated.length) * 100) : 0
        if (newProgress === 100 && goal.progress < 100) {
          updateGoal(goalId, { status: 'completed', progress: 100 })
          showCoinToast(230, '目标达成！+230 金币！')
        } else {
          updateGoal(goalId, { progress: newProgress })
          showCoinToast(30, '考核通过！完成子目标 +30 金币！')
        }
      }
      setQuizState(prev => ({ ...prev, result: 'pass' }))
    } else {
      setQuizState(prev => ({ ...prev, result: 'fail' }))
    }
  }

  const handleCreateGoal = () => {
    if (!newGoal.title || !newGoal.endDate) return
    const subGoals = newGoal.subGoals.filter(sg => sg.title.trim()).map(sg => ({
      id: generateId(), goalId: '', title: sg.title, completed: false,
    }))
    addGoal({
      title: newGoal.title, description: newGoal.description,
      context: newGoal.context || undefined,
      attachments: newGoal.attachments,
      status: 'active', priority: newGoal.priority,
      startDate: new Date().toISOString(),
      endDate: new Date(newGoal.endDate).toISOString(),
      progress: 0, subGoals, category: newGoal.category,
    })
    showCoinToast(20, '创建新目标 +20 金币！')
    setNewGoal({ title: '', description: '', context: '', category: 'study', priority: 'medium', endDate: '', subGoals: [{ title: '' }], attachments: [] })
    setShowNewGoalDialog(false)
  }

  // 从附件中提取文字内容，供 AI 函数使用
  const extractAttachmentTexts = (attachments: GoalAttachment[]): string[] => {
    return attachments
      .filter(a => a.type === 'document' && a.extractedText)
      .map(a => `[${a.name}]\n${a.extractedText}`)
  }

  const handleSubmitGoalForSmartCreate = async () => {
    if (!wizardState.goalTitle.trim()) return
    setWizardState(prev => ({ ...prev, isLoading: true, error: null }))
    try {
      const attachmentTexts = extractAttachmentTexts(wizardState.attachments)
      const result = await generateStatusQuestions(
        wizardState.goalTitle,
        wizardState.goalContext || undefined,
        attachmentTexts.length > 0 ? attachmentTexts : undefined,
      )
      setWizardState(prev => ({ ...prev, step: 'status', questions: result.questions, statusAnswers: new Array(result.questions.length).fill(''), isLoading: false }))
    } catch {
      setWizardState(prev => ({ ...prev, isLoading: false, error: '生成问题失败，请重试' }))
    }
  }

  const handleSubmitStatusAnswers = async () => {
    const statusText = wizardState.statusAnswers.join('；')
    if (!statusText.trim()) return
    setWizardState(prev => ({ ...prev, isLoading: true, error: null }))
    try {
      const attachmentTexts = extractAttachmentTexts(wizardState.attachments)
      const result = await generateGoalPlan(
        wizardState.goalTitle,
        statusText,
        wizardState.goalContext || undefined,
        attachmentTexts.length > 0 ? attachmentTexts : undefined,
      )
      setWizardState(prev => ({ ...prev, step: 'plan', planResult: result, isLoading: false }))
    } catch {
      setWizardState(prev => ({ ...prev, isLoading: false, error: '生成计划失败，请重试' }))
    }
  }

  const handleConfirmAndCreateGoal = async () => {
    if (!wizardState.planResult) return
    const endDate = new Date(); endDate.setDate(endDate.getDate() + 90)
    const subGoals = wizardState.planResult.subGoals.map(sg => ({ id: generateId(), goalId: '', title: sg.title, completed: false }))
    const dailyTasks: DailyTask[] = wizardState.planResult.dailyTasks.map((task, idx) => ({
      id: generateId(), goalId: '', title: task.title, description: task.description,
      duration: task.duration, frequency: task.frequency, completed: false, orderIndex: idx,
    }))
    await addGoal({
      title: wizardState.goalTitle,
      description: `当前状态：${wizardState.planResult.currentStatus}`,
      context: wizardState.goalContext || undefined,
      attachments: wizardState.attachments.length > 0 ? wizardState.attachments : undefined,
      status: 'active', priority: 'medium' as GoalPriority,
      startDate: new Date().toISOString(), endDate: endDate.toISOString(),
      progress: 0, subGoals, currentStatus: wizardState.planResult.currentStatus, dailyTasks,
    })
    showCoinToast(20, 'AI 创建目标 +20 金币！')
    setShowSmartCreateDialog(false)
    setWizardState({ step: 'goal', goalTitle: '', goalContext: '', attachments: [], questions: [], statusAnswers: [], planResult: null, isLoading: false, error: null })
  }

  const formatTimeDisplay = (seconds: number): string => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="h-[calc(100vh-7.5rem)] flex gap-4 animate-in goals-dashboard">
      {/* LEFT — 目标列表 */}
      <GoalListPanel
        goals={goals}
        selectedGoalId={selectedGoalId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSelectGoal={setSelectedGoalId}
        onNewGoal={() => setShowNewGoalDialog(true)}
        onSmartCreate={() => {
          setShowSmartCreateDialog(true)
          setWizardState({ step: 'goal', goalTitle: '', goalContext: '', attachments: [], questions: [], statusAnswers: [], planResult: null, isLoading: false, error: null })
        }}
      />

      {/* CENTER — 目标详情 */}
      <GoalDetailPanel
        selectedGoal={selectedGoal}
        goalsVersion={goalsVersion}
        onStartQuiz={handleStartQuiz}
        onShowNewGoal={() => setShowNewGoalDialog(true)}
        onShowSmartCreate={() => {
          setShowSmartCreateDialog(true)
          setWizardState({ step: 'goal', goalTitle: '', goalContext: '', attachments: [], questions: [], statusAnswers: [], planResult: null, isLoading: false, error: null })
        }}
        onDeleteGoal={(goalId) => {
          deleteGoal(goalId)
          setSelectedGoalId(null)
        }}
        showCoinToast={showCoinToast}
        formatTimeDisplay={formatTimeDisplay}
      />

      {/* RIGHT — 艾莉丝聊天 */}
      <AliceChatPanel selectedGoal={selectedGoal} />

      {/* ====== DIALOGS ====== */}

      {/* New Goal Dialog */}
      <NewGoalDialog
        open={showNewGoalDialog}
        onOpenChange={setShowNewGoalDialog}
        newGoal={newGoal}
        setNewGoal={setNewGoal}
        onCreateGoal={handleCreateGoal}
      />

      {/* Smart Create Dialog */}
      <SmartCreateDialog
        open={showSmartCreateDialog}
        onOpenChange={setShowSmartCreateDialog}
        wizardState={wizardState}
        setWizardState={setWizardState}
        onSubmitGoal={handleSubmitGoalForSmartCreate}
        onSubmitStatus={handleSubmitStatusAnswers}
        onConfirmAndCreate={handleConfirmAndCreateGoal}
      />

      {/* Quiz Dialog */}
      <QuizDialog
        quizState={quizState}
        setQuizState={setQuizState}
        onStartQuiz={handleStartQuiz}
        onQuizComplete={handleQuizComplete}
      />

      {/* Coin Toast */}
      <AnimatePresence>
        {coinToast.show && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.9 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-gradient-to-r from-sakura-pink to-peach-orange text-white font-bold shadow-xl flex items-center gap-2 text-sm"
          >
            <span className="text-lg">🪙</span>
            <span>+{coinToast.amount}</span>
            <span className="font-normal opacity-90">{coinToast.reason}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
