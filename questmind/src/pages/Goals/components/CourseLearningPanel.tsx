import { useMemo, useState } from 'react'
import { AlertCircle, BookOpenCheck, Brain, ChevronDown, Clock3, Loader2, RefreshCw, Route, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUserStore } from '@/store'
import type { Goal } from '@/types'
import { DOCUMENT_TYPE_LABELS } from '@/course-engine/config'
import { buildStudyMap, evidenceForNode } from '@/course-engine/engine'
import { analyzeGoalCourse, classifyGoalAttachments, getCourseModel, recordMasteryEvent } from '@/course-engine/service'
import type { CourseDocumentType, CourseModel, StudyMode } from '@/course-engine/types'

const MODES: Array<{ value: StudyMode; label: string }> = [
  { value: 'preview', label: '课前预习' },
  { value: 'systematic', label: '系统学习' },
  { value: 'final_review', label: '期末复习' },
  { value: 'exam_cram', label: '考前冲刺' },
  { value: 'deep_understanding', label: '深入理解' },
]

const TYPE_OPTIONS = Object.entries(DOCUMENT_TYPE_LABELS) as Array<[CourseDocumentType, string]>

interface CourseLearningPanelProps {
  goal: Goal
  onUpdateGoal: (goalId: string, updates: Partial<Goal>) => void
}

export function CourseLearningPanel({ goal, onUpdateGoal }: CourseLearningPanelProps) {
  const user = useUserStore(state => state.user)
  const [model, setModel] = useState<CourseModel | null>(() => getCourseModel(goal.id))
  const [mode, setMode] = useState<StudyMode>('systematic')
  const [expanded, setExpanded] = useState(true)
  const [isBuilding, setIsBuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const documentAttachments = useMemo(
    () => (goal.attachments || []).filter(attachment => attachment.type === 'document'),
    [goal.attachments],
  )
  const studyMap = useMemo(() => model ? buildStudyMap(model, mode) : null, [model, mode])

  const build = () => {
    setIsBuilding(true)
    setError(null)
    try {
      const classified = classifyGoalAttachments(goal.attachments || [], goal.title)
      if (JSON.stringify(classified) !== JSON.stringify(goal.attachments || [])) {
        onUpdateGoal(goal.id, { attachments: classified })
      }
      const next = analyzeGoalCourse({ ...goal, attachments: classified }, user?.id || goal.userId || 'local-user')
      setModel(next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '课程模型构建失败')
    } finally {
      setIsBuilding(false)
    }
  }

  const correctType = (attachmentId: string, type: CourseDocumentType) => {
    const next = (goal.attachments || []).map(attachment => attachment.id === attachmentId
      ? {
          ...attachment,
          courseClassification: {
            ...(attachment.courseClassification || {
              courseName: goal.title,
              language: 'mixed' as const,
              pageCount: 1,
              confidence: 1,
              reasons: [],
              correctedByUser: true,
              documentType: type,
            }),
            documentType: type,
            confidence: 1,
            reasons: ['用户已手动确认资料类型'],
            correctedByUser: true,
          },
        }
      : attachment)
    onUpdateGoal(goal.id, { attachments: next })
    setModel(null)
  }

  const updateMastery = (nodeId: string, result: 'self_known' | 'correct' | 'wrong') => {
    const next = recordMasteryEvent(goal.id, nodeId, result, result === 'wrong' ? '练习错误' : undefined)
    if (next) setModel(next)
  }

  return (
    <section className="rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/60 to-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-indigo-100/70">
        <BookOpenCheck className="w-4 h-4 text-indigo-500" />
        <button onClick={() => setExpanded(value => !value)} className="flex-1 text-left">
          <span className="text-sm font-bold text-foreground">课程学习地图</span>
          <span className="block text-[10px] text-muted-foreground mt-0.5">资料 → 老师重点 → 知识主线 → 掌握度 → 今日复习</span>
        </button>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-foreground">资料角色确认</span>
              <span className="text-[10px] text-muted-foreground">低置信度不会形成强考试结论</span>
            </div>
            {documentAttachments.length === 0 ? (
              <p className="text-xs text-muted-foreground">上传课程资料后即可构建学习地图。</p>
            ) : (
              <div className="space-y-1.5">
                {documentAttachments.map(attachment => {
                  const classification = attachment.courseClassification
                  return (
                    <div key={attachment.id} className="grid grid-cols-[minmax(0,1fr)_110px] gap-2 items-center rounded-xl border border-indigo-100 bg-white px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{attachment.name}</p>
                        <p className="text-[9px] text-muted-foreground truncate">
                          {classification
                            ? `${classification.courseName}${classification.chapter ? ` · ${classification.chapter}` : ''} · 置信度 ${Math.round(classification.confidence * 100)}%`
                            : '等待识别'}
                        </p>
                      </div>
                      <select
                        value={classification?.documentType || 'other'}
                        onChange={event => correctType(attachment.id, event.target.value as CourseDocumentType)}
                        className="h-8 rounded-lg border border-indigo-100 bg-indigo-50/40 px-2 text-[11px] outline-none focus:border-indigo-300"
                        aria-label={`修正 ${attachment.name} 的资料类型`}
                      >
                        {TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={build} disabled={isBuilding || documentAttachments.every(item => !item.extractedText)} size="sm" className="h-8 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white gap-1.5">
              {isBuilding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : model ? <RefreshCw className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
              {model ? '增量更新课程模型' : '构建课程学习地图'}
            </Button>
            {model && (
              <select value={mode} onChange={event => setMode(event.target.value as StudyMode)} className="h-8 rounded-xl border border-indigo-100 bg-white px-3 text-xs">
                {MODES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            )}
          </div>

          {error && <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}

          {model && studyMap && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white border border-indigo-100 p-2"><strong className="block text-base text-indigo-600">{model.nodes.length}</strong><span className="text-[9px] text-muted-foreground">知识节点</span></div>
                <div className="rounded-xl bg-white border border-indigo-100 p-2"><strong className="block text-base text-indigo-600">{model.evidence.length}</strong><span className="text-[9px] text-muted-foreground">来源证据</span></div>
                <div className="rounded-xl bg-white border border-indigo-100 p-2"><strong className="block text-base text-indigo-600">{model.reviewQueue.length}</strong><span className="text-[9px] text-muted-foreground">今日复习</span></div>
              </div>

              <div>
                <h4 className="flex items-center gap-1.5 text-xs font-bold mb-2"><Route className="w-3.5 h-3.5 text-indigo-500" />本课知识主线</h4>
                <div className="flex flex-wrap gap-1.5">
                  {studyMap.mainline.map((item, index) => <span key={`${item}-${index}`} className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] text-indigo-700">{item}</span>)}
                </div>
              </div>

              <div className="space-y-2">
                {studyMap.items.slice(0, 12).map(item => {
                  const state = model.mastery[item.nodeId]
                  const sourceEvidence = evidenceForNode(model, item.nodeId)
                  return (
                    <details key={item.nodeId} className="group rounded-xl border border-indigo-100 bg-white open:shadow-sm">
                      <summary className="list-none cursor-pointer px-3 py-2.5 flex items-center gap-2">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${item.level === 'S' ? 'bg-red-100 text-red-600' : item.level === 'A' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-50 text-indigo-500'}`}>{item.level}</span>
                        <span className="min-w-0 flex-1">
                          <strong className="block text-xs truncate">{item.name}</strong>
                          <span className="block text-[9px] text-muted-foreground truncate">{item.learningRequirements.join(' · ')} · {item.teacherSignal}</span>
                        </span>
                        <span className="text-[10px] tabular-nums text-indigo-600">掌握 {Math.round((state?.mastery || 0.35) * 100)}%</span>
                      </summary>
                      <div className="px-3 pb-3 pt-1 space-y-2 text-[11px] border-t border-indigo-50">
                        {item.explanation && <p className="text-foreground leading-relaxed"><b>教材补全：</b>{item.explanation}</p>}
                        {item.typicalQuestions.length > 0 && <p><b>典型题型：</b>{item.typicalQuestions.join('、')}</p>}
                        {item.commonErrors.length > 0 && <p className="text-amber-700"><b>易错：</b>{item.commonErrors.join('；')}</p>}
                        <p className="text-indigo-700"><b>下一步：</b>{item.nextAction}</p>
                        <div className="space-y-1">
                          {sourceEvidence.slice(0, 3).map(evidence => (
                            <p key={evidence.id} className="text-[9px] text-muted-foreground bg-slate-50 rounded-lg px-2 py-1.5">
                              [{DOCUMENT_TYPE_LABELS[evidence.documentType]} P{evidence.pageOrSlide}] {evidence.rawExcerpt}
                            </p>
                          ))}
                        </div>
                        <div className="flex gap-1.5 pt-1">
                          <button onClick={() => updateMastery(item.nodeId, 'self_known')} className="rounded-lg border px-2 py-1 text-[10px] hover:bg-indigo-50">我会了</button>
                          <button onClick={() => updateMastery(item.nodeId, 'correct')} className="rounded-lg border border-green-200 px-2 py-1 text-[10px] text-green-600 hover:bg-green-50">练习答对</button>
                          <button onClick={() => updateMastery(item.nodeId, 'wrong')} className="rounded-lg border border-red-200 px-2 py-1 text-[10px] text-red-500 hover:bg-red-50">练习答错</button>
                        </div>
                      </div>
                    </details>
                  )
                })}
              </div>

              {model.reviewQueue.length > 0 && (
                <div>
                  <h4 className="flex items-center gap-1.5 text-xs font-bold mb-2"><Brain className="w-3.5 h-3.5 text-indigo-500" />今日最值得复习</h4>
                  <div className="space-y-1.5">
                    {model.reviewQueue.slice(0, 4).map(item => {
                      const node = model.nodes.find(candidate => candidate.id === item.nodeId)
                      return (
                        <div key={item.id} className="rounded-xl bg-indigo-50/60 px-3 py-2 text-[10px]">
                          <div className="flex items-center gap-2"><strong className="flex-1 text-indigo-900">{node?.canonicalName}</strong><span className="flex items-center gap-1 text-muted-foreground"><Clock3 className="w-3 h-3" />{item.estimatedMinutes} 分钟</span></div>
                          <p className="mt-1 text-muted-foreground">原因：{item.reason}；任务：{item.minimumTask}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
