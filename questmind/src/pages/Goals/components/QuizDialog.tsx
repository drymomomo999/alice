/**
 * 考核验证对话框
 */
import { useState } from 'react'
import { Sparkles, Loader2, CheckCircle2, ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { QuizQuestion } from '@/types'

interface QuizDialogProps {
  quizState: {
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
  }
  setQuizState: React.Dispatch<React.SetStateAction<{
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
  }>>
  onStartQuiz: (goalId: string, subGoalId: string, subGoalTitle: string) => void
  onQuizComplete: () => void
}

export function QuizDialog({ quizState, setQuizState, onStartQuiz, onQuizComplete }: QuizDialogProps) {
  return (
    <Dialog open={quizState.open} onOpenChange={(open) => {
      if (!open) setQuizState(prev => ({ ...prev, open: false, result: null }))
    }}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-peach" />
            子目标考核验证
          </DialogTitle>
          <DialogDescription>
            通过考核后才能完成子目标「{quizState.subGoalTitle}」
          </DialogDescription>
        </DialogHeader>

        {quizState.isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 text-sakura animate-spin" />
            <p className="text-sm text-muted-foreground">艾莉丝正在出题中...</p>
          </div>
        ) : quizState.result === 'pass' ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 gap-3">
            <div className="text-5xl">🎉</div>
            <p className="text-lg font-bold text-green-500">考核通过！</p>
            <p className="text-sm text-muted-foreground">子目标已标记为完成</p>
          </div>
        ) : quizState.result === 'fail' ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 gap-3">
            <div className="text-5xl">😔</div>
            <p className="text-lg font-bold text-amber-500">考核未通过</p>
            <p className="text-sm text-muted-foreground">继续努力，掌握后再来挑战吧！</p>
            <Button onClick={() => onStartQuiz(quizState.goalId, quizState.subGoalId, quizState.subGoalTitle)}
              className="rounded-xl bg-gradient-to-r from-sakura-pink to-peach-orange text-white border-0 mt-2">
              重新考核
            </Button>
          </div>
        ) : quizState.questions.length > 0 ? (
          <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-4">
            {/* 进度指示 */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>第 {quizState.currentIdx + 1} / {quizState.questions.length} 题</span>
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-sakura-pink to-peach-orange rounded-full transition-all"
                  style={{ width: `${((quizState.currentIdx + (quizState.answers[quizState.currentIdx] !== undefined ? 1 : 0)) / quizState.questions.length) * 100}%` }} />
              </div>
            </div>

            {/* 当前题目 */}
            {(() => {
              const q = quizState.questions[quizState.currentIdx]
              if (!q) return null
              const selectedAnswer = quizState.answers[quizState.currentIdx]
              const isAnswered = selectedAnswer !== undefined
              const isCorrect = selectedAnswer === q.correctIndex
              return (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">{q.question}</p>
                  <div className="space-y-2">
                    {q.options.map((opt, i) => (
                      <button key={i} disabled={isAnswered}
                        onClick={() => {
                          const newAnswers = [...quizState.answers]
                          newAnswers[quizState.currentIdx] = i
                          setQuizState(prev => ({ ...prev, answers: newAnswers }))
                        }}
                        className={cn(
                          'w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-all',
                          isAnswered && i === q.correctIndex && 'border-green-400 bg-green-50 text-green-700',
                          isAnswered && i === selectedAnswer && i !== q.correctIndex && 'border-red-400 bg-red-50 text-red-700',
                          isAnswered && i !== selectedAnswer && i !== q.correctIndex && 'border-gray-100 bg-gray-50 text-muted-foreground',
                          !isAnswered && i === selectedAnswer && 'border-sakura-pink bg-sakura-pale/30 text-foreground',
                          !isAnswered && 'border-gray-100 hover:border-sakura-light/50 hover:bg-sakura-pale/10',
                        )}
                      >
                        <span className="font-medium mr-2">{String.fromCharCode(65 + i)}.</span>
                        {opt}
                      </button>
                    ))}
                  </div>
                  {isAnswered && q.explanation && (
                    <div className={cn(
                      'p-3 rounded-xl text-xs',
                      isCorrect ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                    )}>
                      <p className="font-medium mb-0.5">{isCorrect ? '✅ 正确！' : '❌ 不正确'}</p>
                      <p>{q.explanation}</p>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        ) : null}

        {/* 底部操作 */}
        {!quizState.isLoading && quizState.result === null && quizState.questions.length > 0 && (
          <DialogFooter className="flex-row gap-2 shrink-0">
            <Button variant="outline" onClick={() => setQuizState(prev => ({ ...prev, open: false }))}
              className="rounded-xl">取消</Button>
            {quizState.answers[quizState.currentIdx] !== undefined && (
              quizState.currentIdx < quizState.questions.length - 1 ? (
                <Button onClick={() => setQuizState(prev => ({ ...prev, currentIdx: prev.currentIdx + 1 }))}
                  className="rounded-xl bg-gradient-to-r from-sakura-pink to-peach-orange text-white border-0">
                  下一题 <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={onQuizComplete}
                  className="rounded-xl bg-gradient-to-r from-sakura-pink to-peach-orange text-white border-0">
                  <Check className="w-4 h-4 mr-1" /> 提交考核
                </Button>
              )
            )}
          </DialogFooter>
        )}
        {quizState.result === 'pass' && (
          <DialogFooter className="shrink-0">
            <Button onClick={() => setQuizState(prev => ({ ...prev, open: false, result: null }))}
              className="rounded-xl bg-gradient-to-r from-sakura-pink to-peach-orange text-white border-0 w-full">
              太棒了！🎉
            </Button>
          </DialogFooter>
        )}
        {quizState.result === 'fail' && (
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setQuizState(prev => ({ ...prev, open: false, result: null }))}
              className="rounded-xl w-full">关闭</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
