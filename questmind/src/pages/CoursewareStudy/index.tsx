import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpenCheck,
  Brain,
  CheckCircle2,
  ChevronRight,
  FileUp,
  GraduationCap,
  Lightbulb,
  Loader2,
  RefreshCcw,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react'
import { useUserStore } from '@/store'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { Progress } from '@/components/ui/progress'
import {
  createCoursewareStudy,
  deleteCoursewareStudy,
  generateDetailedPointExplanation,
  hydrateCoursewareStudies,
  loadCoursewareStudies,
  updateKnowledgePointProgress,
} from '@/courseware/service'
import type { CoursewareKnowledgePoint, CoursewareStudy, KnowledgePointProgress } from '@/courseware/types'
import { PageLessons } from './PageLessons'

type ViewTab = 'overview' | 'outline' | 'points' | 'pages'

const PROGRESS_LABELS: Record<KnowledgePointProgress, string> = {
  NOT_STARTED: '未开始',
  LEARNING: '学习中',
  MASTERED: '已掌握',
  REVIEW: '待复习',
}

const PROGRESS_STYLES: Record<KnowledgePointProgress, string> = {
  NOT_STARTED: 'bg-gray-100 text-gray-500',
  LEARNING: 'bg-blue-50 text-blue-600',
  MASTERED: 'bg-emerald-50 text-emerald-600',
  REVIEW: 'bg-amber-50 text-amber-600',
}

function nextProgress(progress: KnowledgePointProgress): KnowledgePointProgress {
  if (progress === 'NOT_STARTED') return 'LEARNING'
  if (progress === 'LEARNING' || progress === 'REVIEW') return 'MASTERED'
  return 'REVIEW'
}

function PointDetail({
  point,
  generating,
  revealed,
  onGenerate,
  onProgress,
  onReveal,
}: {
  point: CoursewareKnowledgePoint
  generating: boolean
  revealed: boolean
  onGenerate: () => void
  onProgress: () => void
  onReveal: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${PROGRESS_STYLES[point.progress]}`}>
              {PROGRESS_LABELS[point.progress]}
            </span>
            {point.sourceSlides.map(slide => (
              <span key={slide} className="px-2 py-1 rounded-full bg-sakura-pale text-sakura text-[11px]">第 {slide} 页</span>
            ))}
          </div>
          <h2 className="text-xl font-bold text-gray-900">{point.title}</h2>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">{point.summary}</p>
        </div>
        <button
          onClick={onProgress}
          className="shrink-0 px-4 py-2 rounded-xl bg-white border border-sakura-light text-sm font-medium text-sakura hover:bg-sakura-pale transition-colors"
        >
          {point.progress === 'MASTERED' ? '加入复习' : point.progress === 'NOT_STARTED' ? '开始学习' : '标记掌握'}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <section className="rounded-2xl bg-white border border-sakura-light/50 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-800 mb-2"><Brain className="w-4 h-4 text-sakura" />核心理解</div>
          <p className="text-sm text-gray-600 leading-7">{point.explanation}</p>
        </section>
        <section className="rounded-2xl bg-white border border-amber-100 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-800 mb-2"><Lightbulb className="w-4 h-4 text-amber-500" />为什么重要</div>
          <p className="text-sm text-gray-600 leading-7">{point.whyItMatters}</p>
        </section>
      </div>

      {(point.prerequisites.length > 0 || point.commonMistakes.length > 0) && (
        <div className="grid md:grid-cols-2 gap-3">
          <section className="rounded-2xl bg-indigo-50/60 p-4">
            <h3 className="text-sm font-bold text-indigo-800 mb-2">先修连接</h3>
            <ul className="space-y-1 text-sm text-indigo-700">
              {(point.prerequisites.length ? point.prerequisites : ['无明确先修要求']).map(item => <li key={item}>• {item}</li>)}
            </ul>
          </section>
          <section className="rounded-2xl bg-rose-50/60 p-4">
            <h3 className="text-sm font-bold text-rose-800 mb-2">容易踩坑</h3>
            <ul className="space-y-1 text-sm text-rose-700">
              {point.commonMistakes.map(item => <li key={item}>• {item}</li>)}
            </ul>
          </section>
        </div>
      )}

      <section className="rounded-2xl bg-gradient-to-br from-sakura-pale/70 to-lavender-light/30 border border-sakura-light/60 p-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="text-sm font-bold text-gray-800">理解检查</h3>
          <button onClick={onReveal} className="text-xs font-medium text-sakura hover:underline">{revealed ? '收起答案' : '查看答案要点'}</button>
        </div>
        <p className="text-sm text-gray-700 leading-7">{point.checkQuestion}</p>
        {revealed && <p className="mt-3 pt-3 border-t border-sakura-light/50 text-sm text-gray-600 leading-7">{point.checkAnswer}</p>}
      </section>

      <section className="rounded-2xl bg-white border border-sakura-light/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold text-gray-800">艾莉丝详细讲解</h3>
            <p className="text-xs text-gray-400 mt-1">根据这份课件的对应页面，补充直观理解、条件、例子和误区。</p>
          </div>
          <button
            onClick={onGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-sakura to-peach text-white text-sm font-semibold shadow-sm disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : point.detailedExplanation ? <RefreshCcw className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            {point.detailedExplanation ? '重新讲解' : '生成详细讲解'}
          </button>
        </div>
        {point.detailedExplanation ? (
          <MarkdownRenderer content={point.detailedExplanation} className="prose-p:text-sm prose-li:text-sm" />
        ) : (
          <p className="text-sm text-gray-400 py-4 text-center">点击后会围绕“{point.title}”展开，不会重做整份学习计划。</p>
        )}
      </section>
    </div>
  )
}

export function CoursewareStudyPage() {
  const { user } = useUserStore()
  const userId = user?.id || 'demo'
  const inputRef = useRef<HTMLInputElement>(null)
  const [studies, setStudies] = useState<CoursewareStudy[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [selectedPointId, setSelectedPointId] = useState<string>()
  const [tab, setTab] = useState<ViewTab>('overview')
  const [uploading, setUploading] = useState(false)
  const [generatingPointId, setGeneratingPointId] = useState<string>()
  const [revealedPointId, setRevealedPointId] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    const loaded = loadCoursewareStudies(userId)
    setStudies(loaded)
    setSelectedId(current => current && loaded.some(item => item.id === current) ? current : loaded[0]?.id)
    void hydrateCoursewareStudies(userId).then(hydrated => {
      setStudies(hydrated)
      setSelectedId(current => current && hydrated.some(item => item.id === current) ? current : hydrated[0]?.id)
    })
  }, [userId])

  const selected = studies.find(item => item.id === selectedId)
  const selectedPoint = selected?.analysis.knowledgePoints.find(item => item.id === selectedPointId)
  const mastered = selected?.analysis.knowledgePoints.filter(point => point.progress === 'MASTERED').length || 0
  const progress = selected?.analysis.knowledgePoints.length ? Math.round(mastered / selected.analysis.knowledgePoints.length * 100) : 0

  useEffect(() => {
    if (!selected) return
    setSelectedPointId(current => current && selected.analysis.knowledgePoints.some(point => point.id === current) ? current : selected.analysis.suggestedPath[0] || selected.analysis.knowledgePoints[0]?.id)
  }, [selected])

  const orderedPoints = useMemo(() => {
    if (!selected) return []
    const byId = new Map(selected.analysis.knowledgePoints.map(point => [point.id, point]))
    return selected.analysis.suggestedPath.map(id => byId.get(id)).filter(Boolean) as CoursewareKnowledgePoint[]
  }, [selected])

  const refreshStudy = (next: CoursewareStudy) => {
    setStudies(current => [next, ...current.filter(item => item.id !== next.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
    setSelectedId(next.id)
  }

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setUploading(true)
    setError(undefined)
    try {
      const study = await createCoursewareStudy(file, userId)
      refreshStudy(study)
      setTab('overview')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '课件解析失败，请稍后再试。')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleProgress = (point: CoursewareKnowledgePoint) => {
    if (!selected) return
    refreshStudy(updateKnowledgePointProgress(selected, point.id, nextProgress(point.progress)))
  }

  const handleGenerate = async (point: CoursewareKnowledgePoint) => {
    if (!selected) return
    setGeneratingPointId(point.id)
    setError(undefined)
    try {
      refreshStudy(await generateDetailedPointExplanation(selected, point.id))
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : '详细讲解生成失败。')
    } finally {
      setGeneratingPointId(undefined)
    }
  }

  const handleDelete = (study: CoursewareStudy) => {
    if (!window.confirm(`确定删除《${study.analysis.title}》的精学记录吗？`)) return
    deleteCoursewareStudy(study)
    const next = studies.filter(item => item.id !== study.id)
    setStudies(next)
    if (selectedId === study.id) setSelectedId(next[0]?.id)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <input ref={inputRef} type="file" accept=".ppt,.pptx,.pdf,.docx,.txt,.md" className="hidden" onChange={event => void handleFiles(event.target.files)} />

      <header className="rounded-3xl bg-white/90 border border-sakura-light/50 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sakura-pink/20 to-lavender/30 flex items-center justify-center">
              <BookOpenCheck className="w-6 h-6 text-sakura" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">课件精学</h1>
              <p className="text-sm text-gray-500 mt-1">一份课件一个学习档案，逐个知识点真正学懂。</p>
            </div>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-sakura to-peach text-white text-sm font-bold shadow-md shadow-sakura-pink/20 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            {uploading ? '正在拆解课件…' : '上传新课件'}
          </button>
        </div>
        {error && <div className="mt-4 px-4 py-3 rounded-xl bg-red-50 text-red-600 text-sm">{error}</div>}
      </header>

      <div className="grid lg:grid-cols-[260px_minmax(0,1fr)] gap-4">
        <aside className="rounded-3xl bg-white/90 border border-sakura-light/50 p-3 h-fit">
          <div className="px-2 py-2 text-xs font-bold text-gray-400 tracking-wider">我的课件</div>
          {studies.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-gray-400">上传第一份 PPTX，开始本周学习。</div>
          ) : (
            <div className="space-y-1">
              {studies.map(study => {
                const count = study.analysis.knowledgePoints.length
                const done = study.analysis.knowledgePoints.filter(point => point.progress === 'MASTERED').length
                return (
                  <button
                    key={study.id}
                    onClick={() => setSelectedId(study.id)}
                    className={`w-full text-left rounded-2xl p-3 transition-colors group ${selectedId === study.id ? 'bg-sakura-pale text-gray-900' : 'hover:bg-gray-50 text-gray-600'}`}
                  >
                    <div className="flex items-start gap-2">
                      <GraduationCap className="w-4 h-4 mt-0.5 text-sakura shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{study.analysis.title}</p>
                        <p className="text-[11px] text-gray-400 mt-1">{done}/{count} 个知识点已掌握</p>
                      </div>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={event => { event.stopPropagation(); handleDelete(study) }}
                        onKeyDown={event => { if (event.key === 'Enter') { event.stopPropagation(); handleDelete(study) } }}
                        className="p-1 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400"
                        aria-label="删除课件"
                      ><Trash2 className="w-3.5 h-3.5" /></span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </aside>

        {!selected ? (
          <main className="min-h-[480px] rounded-3xl bg-white/80 border border-dashed border-sakura-light flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 rounded-3xl bg-sakura-pale flex items-center justify-center mb-4"><FileUp className="w-7 h-7 text-sakura" /></div>
            <h2 className="font-bold text-gray-800">从这一周的课件开始</h2>
            <p className="text-sm text-gray-400 mt-2 max-w-md leading-6">支持 PPTX、PDF、DOCX、TXT 和 MD。系统会生成知识大纲、学习目标、逐知识点讲解和理解检查。</p>
            <button onClick={() => inputRef.current?.click()} className="mt-5 px-5 py-2.5 rounded-2xl bg-sakura text-white text-sm font-semibold">选择课件</button>
          </main>
        ) : (
          <main className="rounded-3xl bg-white/90 border border-sakura-light/50 overflow-hidden">
            <div className="p-5 border-b border-sakura-light/40">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-sakura font-semibold mb-1">{selected.analysis.courseHint}</p>
                  <h2 className="text-xl font-bold text-gray-900">{selected.analysis.title}</h2>
                  <p className="text-xs text-gray-400 mt-1 truncate max-w-xl">来源：{selected.fileName}</p>
                </div>
                <div className="w-52">
                  <div className="flex justify-between text-xs mb-2"><span className="text-gray-400">知识点掌握</span><span className="font-bold text-sakura">{progress}%</span></div>
                  <Progress value={progress} className="h-2 bg-sakura-pale" indicatorClassName="bg-gradient-to-r from-sakura to-peach" />
                </div>
              </div>
              <div className="flex gap-1 mt-5 bg-gray-50 rounded-2xl p-1 w-fit">
                {([
                  ['overview', '课件概览'],
                  ['pages', '逐页精讲'],
                  ['outline', '知识大纲'],
                  ['points', '知识点精讲'],
                ] as [ViewTab, string][]).map(([key, label]) => (
                  <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === key ? 'bg-white text-sakura shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>{label}</button>
                ))}
              </div>
            </div>

            <div className="p-5">
              {tab === 'pages' && <PageLessons key={selected.id} study={selected} onUpdate={refreshStudy} />}
              {tab === 'overview' && (
                <div className="space-y-5">
                  <section className="rounded-2xl bg-gradient-to-br from-sakura-pale/70 to-white p-5">
                    <h3 className="font-bold text-gray-800 mb-2">这份课件在讲什么</h3>
                    <p className="text-sm text-gray-600 leading-7">{selected.analysis.summary}</p>
                  </section>
                  <section>
                    <div className="flex items-center gap-2 mb-3"><Target className="w-4 h-4 text-sakura" /><h3 className="font-bold text-gray-800">学完以后，你应该能够</h3></div>
                    <div className="grid md:grid-cols-2 gap-3">
                      {selected.analysis.learningObjectives.map((objective, index) => (
                        <div key={objective} className="flex gap-3 rounded-2xl border border-sakura-light/40 p-4">
                          <span className="w-7 h-7 rounded-full bg-sakura-pale text-sakura text-xs font-bold flex items-center justify-center shrink-0">{index + 1}</span>
                          <p className="text-sm text-gray-600 leading-6">{objective}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                  <button onClick={() => setTab('outline')} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gray-900 text-white text-sm font-semibold">按知识大纲开始学习 <ChevronRight className="w-4 h-4" /></button>
                </div>
              )}

              {tab === 'outline' && (
                <div className="space-y-4">
                  {selected.analysis.sections.map((section, index) => (
                    <section key={section.id} className="rounded-2xl border border-sakura-light/50 overflow-hidden">
                      <div className="flex gap-3 bg-gray-50/80 p-4">
                        <span className="w-8 h-8 rounded-xl bg-white text-sakura font-bold text-sm flex items-center justify-center shadow-sm">{index + 1}</span>
                        <div><h3 className="font-bold text-gray-800">{section.title}</h3><p className="text-sm text-gray-500 mt-1">{section.summary}</p></div>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {section.knowledgePointIds.map(id => selected.analysis.knowledgePoints.find(point => point.id === id)).filter(Boolean).map(point => (
                          <button key={point!.id} onClick={() => { setSelectedPointId(point!.id); setTab('points') }} className="w-full flex items-center gap-3 p-4 text-left hover:bg-sakura-pale/40">
                            {point!.progress === 'MASTERED' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <div className="w-4 h-4 rounded-full border-2 border-gray-200" />}
                            <span className="flex-1 text-sm text-gray-700">{point!.title}</span>
                            <ChevronRight className="w-4 h-4 text-gray-300" />
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}

              {tab === 'points' && selectedPoint && (
                <div className="grid xl:grid-cols-[220px_minmax(0,1fr)] gap-5">
                  <nav className="space-y-1">
                    {orderedPoints.map((point, index) => (
                      <button key={point.id} onClick={() => setSelectedPointId(point.id)} className={`w-full text-left rounded-xl px-3 py-2.5 text-sm flex items-center gap-2 ${selectedPoint.id === point.id ? 'bg-sakura-pale text-sakura font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <span className="text-[10px] w-5 text-center">{index + 1}</span><span className="truncate flex-1">{point.title}</span>
                      </button>
                    ))}
                  </nav>
                  <PointDetail
                    point={selectedPoint}
                    generating={generatingPointId === selectedPoint.id}
                    revealed={revealedPointId === selectedPoint.id}
                    onGenerate={() => void handleGenerate(selectedPoint)}
                    onProgress={() => handleProgress(selectedPoint)}
                    onReveal={() => setRevealedPointId(current => current === selectedPoint.id ? undefined : selectedPoint.id)}
                  />
                </div>
              )}
            </div>
          </main>
        )}
      </div>
    </div>
  )
}
