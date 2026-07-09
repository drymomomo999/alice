/**
 * FinalExamDialog — 最终综合测验对话框
 *
 * 功能：
 * 1. 题型和数量配置界面（用户可调整每种题型的数量）
 * 2. 调用 generateFinalExam() 生成完整习题
 * 3. 展示习题并支持作答
 * 4. 提交后显示评分结果
 */
import { useState, useCallback } from 'react'
import type React from 'react'
import {
  Sparkles, Loader2,
  XCircle, RotateCcw, Minus, Plus,
  BookOpen, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useT, useI18nStore } from '@/i18n'
import {
  generateFinalExam,
  type FinalExamConfig,
  type FinalExam,
  type FinalExamQuestion,
} from '@/services/ai.service'
import type { GoalAttachment } from '@/types'

// ============================================================
// Types
// ============================================================
type ExamPhase = 'config' | 'generating' | 'exam' | 'result'

interface UserAnswers {
  // 单选题：选中的选项 index
  multipleChoice: (number | undefined)[]
  // 判断题：true/false/undefined
  trueFalse: (boolean | undefined)[]
  // 填空题：每道题每个空的答案
  fillBlank: string[][]
  // 简答题：文本答案
  shortAnswer: string[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  goalTitle: string
  goalContext?: string
  goalCategory?: string
  attachments?: GoalAttachment[]
}

// ============================================================
// Helpers
// ============================================================
function extractDocuments(attachments: GoalAttachment[]): { name: string; text: string }[] {
  return (attachments || [])
    .filter((a) => a.type === 'document' && a.extractedText)
    .map((a) => ({ name: a.name, text: a.extractedText! }))
}

function CountStepper({
  label,
  value,
  onChange,
  min = 0,
  max = 20,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}) {
  return (
    <div className="flex items-center justify-between py-3 px-1 border-b border-sakura-light/20 last:border-0">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-8 h-8 rounded-lg border border-sakura-light/40 flex items-center justify-center hover:bg-sakura-pale/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="w-6 text-center font-bold text-sm text-sakura">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-8 h-8 rounded-lg border border-sakura-light/40 flex items-center justify-center hover:bg-sakura-pale/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Main Component
// ============================================================
export function FinalExamDialog({
  open,
  onOpenChange,
  goalTitle,
  goalContext,
  goalCategory,
  attachments = [],
}: Props) {
  const t = useT()
  const { locale } = useI18nStore()

  const [phase, setPhase] = useState<ExamPhase>('config')
  const [config, setConfig] = useState<FinalExamConfig>({
    multipleChoice: 5,
    trueFalse: 3,
    fillBlank: 3,
    shortAnswer: 2,
  })
  const [exam, setExam] = useState<FinalExam | null>(null)
  const [answers, setAnswers] = useState<UserAnswers>({
    multipleChoice: [],
    trueFalse: [],
    fillBlank: [],
    shortAnswer: [],
  })
  const [showAnswers, setShowAnswers] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const docs = extractDocuments(attachments)
  const totalQ = config.multipleChoice + config.trueFalse + config.fillBlank + config.shortAnswer

  const handleClose = () => {
    onOpenChange(false)
    // Reset after animation
    setTimeout(() => {
      setPhase('config')
      setExam(null)
      setError(null)
      setShowAnswers(false)
    }, 300)
  }

  const handleGenerate = useCallback(async () => {
    setPhase('generating')
    setError(null)
    try {
      const result = await generateFinalExam({
        goalTitle,
        goalContext,
        goalCategory,
        documents: docs,
        config,
        language: locale,
      })
      setExam(result)
      // Init answers
      setAnswers({
        multipleChoice: new Array(result.multipleChoiceQuestions.length).fill(undefined),
        trueFalse: new Array(result.trueFalseQuestions.length).fill(undefined),
        fillBlank: result.fillBlankQuestions.map((q) => new Array(q.blanks?.length || 1).fill('')),
        shortAnswer: new Array(result.shortAnswerQuestions.length).fill(''),
      })
      setShowAnswers(false)
      setPhase('exam')
    } catch (err: any) {
      setError(err?.message || '生成失败，请重试')
      setPhase('config')
    }
  }, [goalTitle, goalContext, goalCategory, docs, config, locale])

  const handleSubmit = () => {
    setShowAnswers(true)
    setPhase('result')
  }

  // Scoring (only auto-scorable: mc + tf)
  const computeScore = () => {
    if (!exam) return { correct: 0, total: 0, pct: 0 }
    let correct = 0
    let total = 0
    exam.multipleChoiceQuestions.forEach((q, i) => {
      total++
      if (answers.multipleChoice[i] === q.correctIndex) correct++
    })
    exam.trueFalseQuestions.forEach((q, i) => {
      total++
      if (answers.trueFalse[i] === q.correctBool) correct++
    })
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0
    return { correct, total, pct }
  }

  // ---- Phase: Config ----
  const renderConfig = () => (
    <div className="flex flex-col gap-4">
      {docs.length === 0 && !goalContext && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-700">{t('finalExam.no_attachments')}</p>
            <p className="text-xs text-amber-600 mt-0.5">{t('finalExam.no_attachments_hint')}</p>
          </div>
        </div>
      )}

      <div className="p-3 rounded-xl bg-sakura-pale/40 border border-sakura-light/30">
        <p className="text-xs font-medium text-sakura mb-1">{t('finalExam.config_hint')}</p>
        <CountStepper label={t('finalExam.multiple_choice')} value={config.multipleChoice} onChange={(v) => setConfig((c) => ({ ...c, multipleChoice: v }))} />
        <CountStepper label={t('finalExam.true_false')} value={config.trueFalse} onChange={(v) => setConfig((c) => ({ ...c, trueFalse: v }))} />
        <CountStepper label={t('finalExam.fill_blank')} value={config.fillBlank} onChange={(v) => setConfig((c) => ({ ...c, fillBlank: v }))} />
        <CountStepper label={t('finalExam.short_answer')} value={config.shortAnswer} onChange={(v) => setConfig((c) => ({ ...c, shortAnswer: v }))} />
        <p className="text-xs text-muted-foreground mt-3 text-right">
          {t('finalExam.total_questions', { count: totalQ })}
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
          <XCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  )

  // ---- Phase: Generating ----
  const renderGenerating = () => (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <Loader2 className="w-10 h-10 text-sakura animate-spin" />
      <p className="text-sm text-muted-foreground text-center">{t('finalExam.generating')}</p>
      <p className="text-xs text-muted-foreground/60">
        {locale === 'zh' ? `正在生成 ${totalQ} 道题目，请稍候...` : `Preparing ${totalQ} questions...`}
      </p>
    </div>
  )

  // ---- Phase: Exam ----
  const renderExam = () => {
    if (!exam) return null
    const sections: React.ReactNode[] = []

    // 单选题
    if (exam.multipleChoiceQuestions.length > 0) {
      sections.push(
        <div key="mc" className="space-y-4">
          <h3 className="text-sm font-bold text-sakura border-b border-sakura-light/30 pb-2">
            {t('finalExam.section_mc')}（{exam.multipleChoiceQuestions.length} {locale === 'zh' ? '题' : 'questions'}）
          </h3>
          {exam.multipleChoiceQuestions.map((q, i) => (
            <QuestionMC
              key={q.id}
              index={i}
              q={q}
              selected={answers.multipleChoice[i]}
              showAnswer={showAnswers}
              onSelect={(idx) => setAnswers((a) => ({
                ...a,
                multipleChoice: a.multipleChoice.map((v, ii) => ii === i ? idx : v),
              }))}
              locale={locale}
              t={t}
            />
          ))}
        </div>
      )
    }

    // 判断题
    if (exam.trueFalseQuestions.length > 0) {
      sections.push(
        <div key="tf" className="space-y-4">
          <h3 className="text-sm font-bold text-sakura border-b border-sakura-light/30 pb-2">
            {t('finalExam.section_tf')}（{exam.trueFalseQuestions.length} {locale === 'zh' ? '题' : 'questions'}）
          </h3>
          {exam.trueFalseQuestions.map((q, i) => (
            <QuestionTF
              key={q.id}
              index={i}
              q={q}
              selected={answers.trueFalse[i]}
              showAnswer={showAnswers}
              onSelect={(v) => setAnswers((a) => ({
                ...a,
                trueFalse: a.trueFalse.map((vv, ii) => ii === i ? v : vv),
              }))}
              locale={locale}
              t={t}
            />
          ))}
        </div>
      )
    }

    // 填空题
    if (exam.fillBlankQuestions.length > 0) {
      sections.push(
        <div key="fb" className="space-y-4">
          <h3 className="text-sm font-bold text-sakura border-b border-sakura-light/30 pb-2">
            {t('finalExam.section_fb')}（{exam.fillBlankQuestions.length} {locale === 'zh' ? '题' : 'questions'}）
          </h3>
          {exam.fillBlankQuestions.map((q, i) => (
            <QuestionFB
              key={q.id}
              index={i}
              q={q}
              userBlanks={answers.fillBlank[i] || []}
              showAnswer={showAnswers}
              onChange={(bi, v) => setAnswers((a) => ({
                ...a,
                fillBlank: a.fillBlank.map((arr, ii) =>
                  ii === i ? arr.map((vv, bi2) => bi2 === bi ? v : vv) : arr
                ),
              }))}
              locale={locale}
              t={t}
            />
          ))}
        </div>
      )
    }

    // 简答题
    if (exam.shortAnswerQuestions.length > 0) {
      sections.push(
        <div key="sa" className="space-y-4">
          <h3 className="text-sm font-bold text-sakura border-b border-sakura-light/30 pb-2">
            {t('finalExam.section_sa')}（{exam.shortAnswerQuestions.length} {locale === 'zh' ? '题' : 'questions'}）
          </h3>
          {exam.shortAnswerQuestions.map((q, i) => (
            <QuestionSA
              key={q.id}
              index={i}
              q={q}
              userAnswer={answers.shortAnswer[i] || ''}
              showAnswer={showAnswers}
              onChange={(v) => setAnswers((a) => ({
                ...a,
                shortAnswer: a.shortAnswer.map((vv, ii) => ii === i ? v : vv),
              }))}
              locale={locale}
              t={t}
            />
          ))}
        </div>
      )
    }

    return <div className="space-y-8">{sections}</div>
  }

  // ---- Phase: Result ----
  const renderResult = () => {
    const { correct, total, pct } = computeScore()
    const label = pct >= 90 ? t('finalExam.excellent') : pct >= 75 ? t('finalExam.good') : pct >= 60 ? t('finalExam.pass') : t('finalExam.fail')
    const emoji = pct >= 90 ? '🏆' : pct >= 75 ? '🌟' : pct >= 60 ? '✅' : '📚'
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-gradient-to-br from-sakura-pale to-lavender-light/30">
          <div className="text-5xl">{emoji}</div>
          <p className="text-xl font-bold text-sakura">{label}</p>
          <p className="text-sm text-muted-foreground">
            {t('finalExam.correct_count', { count: correct })} / {total} {locale === 'zh' ? '道客观题' : 'objective questions'}
          </p>
          <div className="w-full h-2.5 bg-white/70 rounded-full overflow-hidden mt-1">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-700',
                pct >= 90 ? 'bg-gradient-to-r from-green-400 to-emerald-400' :
                pct >= 60 ? 'bg-gradient-to-r from-sakura-pink to-peach-orange' :
                'bg-gradient-to-r from-amber-400 to-orange-400'
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {locale === 'zh' ? '（填空题和简答题需参照参考答案自行评分）' : '(Fill-in-blank and short answer are self-graded)'}
          </p>
        </div>
        {renderExam()}
      </div>
    )
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-sakura" />
            {t('finalExam.title')}
          </DialogTitle>
          <DialogDescription>{t('finalExam.subtitle')}</DialogDescription>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto py-2 px-1">
          {phase === 'config' && renderConfig()}
          {phase === 'generating' && renderGenerating()}
          {(phase === 'exam' || phase === 'result') && renderExam()}
          {phase === 'result' && renderResult()}
        </div>

        {/* Footer */}
        <DialogFooter className="shrink-0 flex-col sm:flex-row gap-2">
          {phase === 'config' && (
            <>
              <Button variant="outline" onClick={handleClose} className="rounded-xl">
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={totalQ === 0 || (docs.length === 0 && !goalContext)}
                className="rounded-xl bg-gradient-to-r from-sakura-pink to-peach-orange text-white border-0"
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                {t('finalExam.generate_btn')}
              </Button>
            </>
          )}
          {phase === 'exam' && !showAnswers && (
            <>
              <Button variant="outline" onClick={handleClose} className="rounded-xl">
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() => { setPhase('config') }}
                variant="outline"
                className="rounded-xl"
              >
                <RotateCcw className="w-4 h-4 mr-1.5" />
                {t('finalExam.regenerate_btn')}
              </Button>
              <Button
                onClick={handleSubmit}
                className="rounded-xl bg-gradient-to-r from-sakura-pink to-peach-orange text-white border-0"
              >
                {t('finalExam.submit_exam')}
              </Button>
            </>
          )}
          {phase === 'result' && (
            <>
              <Button
                onClick={() => {
                  setPhase('config')
                  setExam(null)
                  setShowAnswers(false)
                }}
                variant="outline"
                className="rounded-xl"
              >
                <RotateCcw className="w-4 h-4 mr-1.5" />
                {t('finalExam.regenerate_btn')}
              </Button>
              <Button
                onClick={handleClose}
                className="rounded-xl bg-gradient-to-r from-sakura-pink to-peach-orange text-white border-0"
              >
                {t('common.done')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Sub-components for question types
// ============================================================

type TFunc = (key: string, vars?: Record<string, string | number>) => string

function QuestionMC({
  index, q, selected, showAnswer, onSelect, locale: _locale, t: _t,
}: {
  index: number
  q: FinalExamQuestion
  selected: number | undefined
  showAnswer: boolean
  onSelect: (i: number) => void
  locale: string
  t: TFunc
}) {
  const isAnswered = showAnswer
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        <span className="text-sakura font-bold mr-1">{index + 1}.</span>
        {q.question}
      </p>
      {q.sourceRef && (
        <p className="text-[10px] text-muted-foreground/60 ml-4">📖 {q.sourceRef}</p>
      )}
      <div className="space-y-1.5 ml-4">
        {(q.options || []).map((opt, i) => {
          const isSelected = selected === i
          const isCorrect = q.correctIndex === i
          return (
            <button
              key={i}
              disabled={isAnswered}
              onClick={() => onSelect(i)}
              className={cn(
                'w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all',
                isAnswered && isCorrect && 'border-green-400 bg-green-50 text-green-700',
                isAnswered && isSelected && !isCorrect && 'border-red-400 bg-red-50 text-red-700',
                isAnswered && !isSelected && !isCorrect && 'border-gray-100 bg-gray-50 text-muted-foreground',
                !isAnswered && isSelected && 'border-sakura-pink bg-sakura-pale/30',
                !isAnswered && !isSelected && 'border-gray-100 hover:border-sakura-light/50 hover:bg-sakura-pale/10',
              )}
            >
              <span className="font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
              {opt}
            </button>
          )
        })}
      </div>
      {isAnswered && q.explanation && (
        <div className={cn(
          'ml-4 p-2.5 rounded-xl text-xs',
          selected === q.correctIndex ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
        )}>
          {selected === q.correctIndex ? '✅' : '❌'} {q.explanation}
        </div>
      )}
    </div>
  )
}

function QuestionTF({
  index, q, selected, showAnswer, onSelect, locale: _locale, t,
}: {
  index: number
  q: FinalExamQuestion
  selected: boolean | undefined
  showAnswer: boolean
  onSelect: (v: boolean) => void
  locale: string
  t: TFunc
}) {
  const isAnswered = showAnswer
  const options = [
    { value: true, label: t('finalExam.true') },
    { value: false, label: t('finalExam.false') },
  ]
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        <span className="text-sakura font-bold mr-1">{index + 1}.</span>
        {q.question}
      </p>
      {q.sourceRef && (
        <p className="text-[10px] text-muted-foreground/60 ml-4">📖 {q.sourceRef}</p>
      )}
      <div className="flex gap-3 ml-4">
        {options.map(({ value, label }) => {
          const isSelected = selected === value
          const isCorrect = q.correctBool === value
          return (
            <button
              key={String(value)}
              disabled={isAnswered}
              onClick={() => onSelect(value)}
              className={cn(
                'flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all',
                isAnswered && isCorrect && 'border-green-400 bg-green-50 text-green-700',
                isAnswered && isSelected && !isCorrect && 'border-red-400 bg-red-50 text-red-700',
                isAnswered && !isSelected && !isCorrect && 'border-gray-100 bg-gray-50 text-muted-foreground',
                !isAnswered && isSelected && 'border-sakura-pink bg-sakura-pale/30 text-sakura',
                !isAnswered && !isSelected && 'border-gray-100 hover:border-sakura-light/50 hover:bg-sakura-pale/10',
              )}
            >
              {label}
            </button>
          )
        })}
      </div>
      {isAnswered && q.explanation && (
        <div className={cn(
          'ml-4 p-2.5 rounded-xl text-xs',
          selected === q.correctBool ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
        )}>
          {selected === q.correctBool ? '✅' : '❌'} {q.explanation}
        </div>
      )}
    </div>
  )
}

function QuestionFB({
  index, q, userBlanks, showAnswer, onChange, locale: _locale, t,
}: {
  index: number
  q: FinalExamQuestion
  userBlanks: string[]
  showAnswer: boolean
  onChange: (blankIdx: number, value: string) => void
  locale: string
  t: TFunc
}) {
  const blanks = q.blanks || []
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        <span className="text-sakura font-bold mr-1">{index + 1}.</span>
        {q.question}
      </p>
      {q.sourceRef && (
        <p className="text-[10px] text-muted-foreground/60 ml-4">📖 {q.sourceRef}</p>
      )}
      <div className="ml-4 space-y-2">
        {blanks.map((_ans, bi) => (
          <div key={bi} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">空{bi + 1}：</span>
            <input
              type="text"
              disabled={showAnswer}
              value={userBlanks[bi] || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(bi, e.target.value)}
              placeholder={t('finalExam.answer_placeholder')}
              className={cn(
                'flex-1 px-3 py-1.5 text-sm rounded-lg border transition-all outline-none',
                showAnswer
                  ? 'bg-gray-50 border-gray-200 text-muted-foreground'
                  : 'border-sakura-light/40 focus:border-sakura-pink/60 bg-white',
              )}
            />
          </div>
        ))}
      </div>
      {showAnswer && (
        <div className="ml-4 p-2.5 rounded-xl text-xs bg-blue-50 text-blue-700 space-y-1">
          <p className="font-medium">{t('finalExam.correct_answer')}：{blanks.join('；')}</p>
          {q.explanation && <p>{q.explanation}</p>}
        </div>
      )}
    </div>
  )
}

function QuestionSA({
  index, q, userAnswer, showAnswer, onChange, locale: _locale, t,
}: {
  index: number
  q: FinalExamQuestion
  userAnswer: string
  showAnswer: boolean
  onChange: (value: string) => void
  locale: string
  t: TFunc
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        <span className="text-sakura font-bold mr-1">{index + 1}.</span>
        {q.question}
      </p>
      {q.sourceRef && (
        <p className="text-[10px] text-muted-foreground/60 ml-4">📖 {q.sourceRef}</p>
      )}
      <div className="ml-4">
        <Textarea
          disabled={showAnswer}
          value={userAnswer}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('finalExam.answer_placeholder')}
          rows={3}
          className={cn(
            'text-sm resize-none rounded-xl border transition-all',
            showAnswer ? 'bg-gray-50 border-gray-200' : 'border-sakura-light/40 focus:border-sakura-pink/60',
          )}
        />
      </div>
      {showAnswer && q.referenceAnswer && (
        <div className="ml-4 p-3 rounded-xl text-xs bg-blue-50 text-blue-700 space-y-1">
          <p className="font-medium">{t('finalExam.correct_answer')}：</p>
          <p className="whitespace-pre-wrap">{q.referenceAnswer}</p>
          {q.explanation && (
            <p className="mt-1 text-blue-600 border-t border-blue-100 pt-1">{q.explanation}</p>
          )}
        </div>
      )}
    </div>
  )
}
