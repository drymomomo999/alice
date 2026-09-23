import { useEffect, useRef, useState } from 'react'
import { splitCoursewareSlides } from '@/courseware/analyzer'
import { generatePageExplanation } from '@/courseware/service'
import { loadPptxPreviewPage } from '@/courseware/slidePreview'
import type { CoursewareStudy } from '@/courseware/types'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'

export function PageLessons({ study, onUpdate }: { study: CoursewareStudy; onUpdate: (study: CoursewareStudy) => void }) {
  const pages = splitCoursewareSlides(study.sourceText)
  const [selected, setSelected] = useState(pages[0]?.number || 1)
  const [busy, setBusy] = useState<number>()
  const [error, setError] = useState('')
  const [slideImage, setSlideImage] = useState<string>()
  const [slideImageError, setSlideImageError] = useState<string>()
  const [slideImageLoading, setSlideImageLoading] = useState(false)
  const stop = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { stop.current = true; mounted.current = false } }, [])
  const page = pages.find(item => item.number === selected) || pages[0]
  const pageNumber = page?.number
  const lecture = page && study.analysis.pageLectures?.[page.number]
  useEffect(() => {
    let active = true
    setSlideImage(undefined)
    setSlideImageError(undefined)
    setSlideImageLoading(false)
    if (!pageNumber || study.fileType !== 'pptx') return () => { active = false }
    if (!study.slidePreview?.id) {
      setSlideImageError(study.slidePreviewError || '这份旧课件还没有原始页面画面，请重新上传同一份 PPTX。')
      return () => { active = false }
    }
    setSlideImageLoading(true)
    void loadPptxPreviewPage(study.slidePreview.id, pageNumber)
      .then(image => { if (active) setSlideImage(image) })
      .catch(reason => { if (active) setSlideImageError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (active) setSlideImageLoading(false) })
    return () => { active = false }
  }, [pageNumber, study.fileType, study.slidePreview?.id, study.slidePreviewError])
  const generate = async (all: boolean) => {
    if (busy !== undefined || !page) return
    stop.current = false
    setError('')
    let current = study
    const queue = all ? pages.filter(item => !study.analysis.pageLectures?.[item.number]) : [page]
    for (const item of queue) {
      if (stop.current) break
      setBusy(item.number)
      try {
        current = await generatePageExplanation(current, item.number)
        if (mounted.current) onUpdate(current)
      } catch (err) {
        if (mounted.current) setError(err instanceof Error ? err.message : '生成失败，请重试。')
        break
      }
    }
    if (mounted.current) setBusy(undefined)
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span>已讲 {pages.filter(item => study.analysis.pageLectures?.[item.number]).length} / {pages.length} 页</span>
      <button disabled={busy !== undefined} onClick={() => void generate(true)} className="rounded-xl bg-sakura px-4 py-2 text-white disabled:opacity-50">逐页生成全部讲解</button>
      {busy !== undefined && <><span role="status">正在讲第 {busy} 页…</span><button onClick={() => { stop.current = true }} className="text-sakura">讲完这页后暂停</button></>}
    </div>
    {study.sourceText.includes('[内容已截断]') && <p className="text-sm text-amber-700">这份旧档案的原文曾被截断，后续页面可能缺失。请重新上传完整课件。</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="grid md:grid-cols-[180px_minmax(0,1fr)] gap-4">
      <nav aria-label="课件页码" className="max-h-[65vh] overflow-auto space-y-1">
        {pages.map(item => <button key={item.number} onClick={() => setSelected(item.number)} className={`w-full rounded-xl p-3 text-left text-sm ${page?.number === item.number ? 'bg-sakura-pale text-sakura' : 'hover:bg-gray-50'}`}>第 {item.number} 页 {study.analysis.pageLectures?.[item.number] ? '✓' : ''}<span className="block truncate text-xs text-gray-400">{item.text.split('\n')[0]}</span></button>)}
      </nav>
      {page && <section className="min-w-0 space-y-4">
        <div className="flex justify-between items-center"><h3 className="font-bold">第 {page.number} 页精讲</h3><button disabled={busy !== undefined} onClick={() => void generate(false)} className="rounded-xl border px-3 py-2 text-sm text-sakura disabled:opacity-50">{lecture ? '重新讲这一页' : '讲解这一页'}</button></div>
        {study.fileType === 'pptx' && <section className="overflow-hidden rounded-2xl border border-gray-200 bg-[#202124] shadow-sm" aria-label={`第 ${page.number} 页原始幻灯片`}>
          {slideImageLoading ? (
            <div className="flex aspect-video items-center justify-center text-sm text-white/70">正在还原第 {page.number} 页画面…</div>
          ) : slideImage ? (
            <img src={slideImage} alt={`第 ${page.number} 页原始幻灯片`} className="block h-auto w-full object-contain" />
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/75">
              <p>暂时无法显示这一页的原始画面</p>
              <p className="text-xs text-white/50">{slideImageError || '请重新上传同一份 PPTX 生成原页画面。'}</p>
            </div>
          )}
        </section>}
        {lecture ? <MarkdownRenderer content={lecture} /> : <p className="py-8 text-sm text-gray-500">讲解将说明本页重点、在整课中的作用、前后页连接和理解检查。</p>}
        <div className="flex justify-between"><button disabled={pages[0]?.number === page.number} onClick={() => setSelected(pages[pages.indexOf(page) - 1].number)} className="text-sm text-sakura disabled:opacity-30">上一页</button><button disabled={pages[pages.length - 1]?.number === page.number} onClick={() => setSelected(pages[pages.indexOf(page) + 1].number)} className="text-sm text-sakura disabled:opacity-30">下一页</button></div>
      </section>}
    </div>
  </div>
}
