import { callDeepSeekAPI, type ChatCompletionMessage } from '@/services/ai.service'
import { extractTextFromFile } from '@/lib/fileExtractor'
import { isSupabaseConfigured, supabase } from '@/services/supabase'
import { normalizeCoursewareAnalysis, splitCoursewareSlides, stableCoursewareId } from './analyzer'
import { buildPageLecturePrompt } from './pageLecture'
import { canRenderPptxPreview, deletePptxPreview, renderPptxPreview } from './slidePreview'
import type { CoursewareAnalysis, CoursewareFileType, CoursewareKnowledgePoint, CoursewareStudy, KnowledgePointProgress } from './types'

const STORAGE_KEY = 'questmind-courseware-study-v1'

function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(cleaned)
}

function fileType(file: File): CoursewareFileType {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'pptx') return 'pptx'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  return 'text'
}

export function loadCoursewareStudies(userId: string): CoursewareStudy[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as CoursewareStudy[]
    return Array.isArray(parsed) ? parsed.filter(item => item.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : []
  } catch {
    return []
  }
}

function loadAllStudies(): CoursewareStudy[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAllStudies(studies: CoursewareStudy[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(studies.slice(0, 80)))
}

function scheduleCloudSave(study: CoursewareStudy): void {
  if (!isSupabaseConfigured() || !study.userId || study.userId === 'demo') return
  void supabase.from('courseware_studies').upsert({
    external_id: study.id,
    user_id: study.userId,
    file_name: study.fileName,
    file_type: study.fileType,
    file_size: study.fileSize,
    source_text: study.sourceText,
    analysis_json: study.analysis,
    created_at: study.createdAt,
    updated_at: study.updatedAt,
  }, { onConflict: 'user_id,external_id' }).then(({ error }) => {
    if (error) console.warn('[courseware] cloud save skipped:', error.message)
  })
}

export function saveCoursewareStudy(study: CoursewareStudy): CoursewareStudy {
  const all = loadAllStudies()
  const next = all.some(item => item.id === study.id) ? all.map(item => item.id === study.id ? study : item) : [study, ...all]
  writeAllStudies(next)
  scheduleCloudSave(study)
  return study
}

export function deleteCoursewareStudy(study: CoursewareStudy): void {
  writeAllStudies(loadAllStudies().filter(item => item.id !== study.id))
  if (study.slidePreview?.id) deletePptxPreview(study.slidePreview.id)
  if (!isSupabaseConfigured() || !study.userId || study.userId === 'demo') return
  void supabase.from('courseware_studies').delete().eq('user_id', study.userId).eq('external_id', study.id).then(({ error }) => {
    if (error) console.warn('[courseware] cloud delete skipped:', error.message)
  })
}

export async function hydrateCoursewareStudies(userId: string): Promise<CoursewareStudy[]> {
  const local = loadCoursewareStudies(userId)
  if (!isSupabaseConfigured() || !userId || userId === 'demo') return local
  const { data, error } = await supabase
    .from('courseware_studies')
    .select('external_id,user_id,file_name,file_type,file_size,source_text,analysis_json,created_at,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) {
    console.warn('[courseware] cloud hydrate skipped:', error.message)
    return local
  }
  const remote = (data || []).map(row => ({
    id: String(row.external_id),
    userId: String(row.user_id),
    fileName: String(row.file_name),
    fileType: row.file_type as CoursewareFileType,
    fileSize: Number(row.file_size || 0),
    sourceText: String(row.source_text || ''),
    analysis: row.analysis_json as CoursewareAnalysis,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  } satisfies CoursewareStudy))
  const merged = [...loadAllStudies()]
  remote.forEach(study => {
    const index = merged.findIndex(item => item.id === study.id)
    if (index < 0) merged.push(study)
    else if (merged[index].updatedAt < study.updatedAt) merged[index] = {
      ...study,
      slidePreview: merged[index].slidePreview,
      slidePreviewError: merged[index].slidePreviewError,
    }
  })
  writeAllStudies(merged)
  return loadCoursewareStudies(userId)
}

async function requestAnalysis(fileName: string, text: string): Promise<CoursewareAnalysis | null> {
  const slides = splitCoursewareSlides(text)
  const prompt = `请把下面这一份课件分析成可供学生逐点学习的结构。不要制定学期计划，也不要预测考试日期。

文件名：${fileName}
课件内容：
${text.slice(0, 28000)}

只返回 JSON：
{
  "title": "课件标题",
  "courseHint": "可能所属课程",
  "summary": "100字内说明课件主线",
  "learningObjectives": ["学完后能够做什么，3到6项"],
  "sections": [{"title":"模块名","summary":"模块作用","knowledgePoints":["必须与下方知识点标题完全一致"]}],
  "knowledgePoints": [{
    "title":"具体知识点",
    "summary":"一句话定义",
    "explanation":"用学生能听懂的方式说明原理、条件和关系",
    "whyItMatters":"为什么要学",
    "sourceSlides":[1],
    "prerequisites":["先修知识"],
    "commonMistakes":["常见误区"],
    "checkQuestion":"一道能够检验理解的问题",
    "checkAnswer":"参考答案要点"
  }]
}

要求：
1. 覆盖整份课件，而不是只总结开头；当前解析到约 ${slides.length || 1} 张幻灯片。
2. 知识点应具体可讲解，不要把“目录”“总结”当知识点。
3. sourceSlides 只能填写有内容证据的页码；不确定时留空。
4. 每个知识点都要包含讲解、常见误区和理解检查。
5. 不要生成每日任务、截止日期或期末冲刺建议。`
  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: '你是课件精学分析器。你的任务是忠实拆解用户上传的单份课件，帮助学生理解，而不是生成长期目标计划。严格输出 JSON。' },
    { role: 'user', content: prompt },
  ]
  const result = await callDeepSeekAPI(messages, 8192)
  if (!result) return null
  try {
    return normalizeCoursewareAnalysis(parseJson(result), fileName, text)
  } catch (error) {
    console.warn('[courseware] structured analysis parse failed, using local fallback:', error)
    return null
  }
}

export async function createCoursewareStudy(file: File, userId: string): Promise<CoursewareStudy> {
  if (/\.ppt$/i.test(file.name)) throw new Error('暂不支持旧版 .ppt，请在 PowerPoint 中另存为 .pptx 或 PDF 后上传。')
  const text = await extractTextFromFile(file, { maxLength: 500000, maxPages: 2000 })
  if (!text?.trim()) throw new Error('没有从文件中读取到文字。若课件主要由图片组成，请先导出为可搜索文字的 PDF。')
  const id = stableCoursewareId('courseware', `${userId}:${file.name}:${file.size}:${file.lastModified}`)
  const previous = loadCoursewareStudies(userId).find(item => item.id === id)
  const previewPromise = fileType(file) === 'pptx' && canRenderPptxPreview()
    ? renderPptxPreview(file, id).then(slideCount => ({ slideCount })).catch(error => ({ error: error instanceof Error ? error.message : 'PowerPoint 页面渲染失败' }))
    : Promise.resolve(undefined)
  if (previous) {
    const preview = await previewPromise
    if (!preview) return previous
    return saveCoursewareStudy({
      ...previous,
      updatedAt: new Date().toISOString(),
      slidePreview: 'slideCount' in preview ? { id, slideCount: preview.slideCount, renderer: 'powerpoint', createdAt: new Date().toISOString() } : previous.slidePreview,
      slidePreviewError: 'error' in preview ? preview.error : undefined,
    })
  }
  const [analysisResult, preview] = await Promise.all([requestAnalysis(file.name, text), previewPromise])
  const analysis = analysisResult || normalizeCoursewareAnalysis(null, file.name, text)
  const now = new Date().toISOString()
  return saveCoursewareStudy({
    id, userId, fileName: file.name, fileType: fileType(file), fileSize: file.size, sourceText: text, analysis,
    slidePreview: preview && 'slideCount' in preview ? { id, slideCount: preview.slideCount, renderer: 'powerpoint', createdAt: now } : undefined,
    slidePreviewError: preview && 'error' in preview ? preview.error : undefined,
    createdAt: now, updatedAt: now,
  })
}

export function updateKnowledgePointProgress(study: CoursewareStudy, pointId: string, progress: KnowledgePointProgress): CoursewareStudy {
  const updatedAt = new Date().toISOString()
  return saveCoursewareStudy({
    ...study,
    updatedAt,
    analysis: {
      ...study.analysis,
      knowledgePoints: study.analysis.knowledgePoints.map(point => point.id === pointId ? { ...point, progress } : point),
    },
  })
}

export async function generatePageExplanation(study: CoursewareStudy, pageNumber: number): Promise<CoursewareStudy> {
  const result = await callDeepSeekAPI([
    { role: 'system', content: '你是艾莉丝，一位耐心严谨的课程助教。围绕真实课件逐页讲清知识与教学作用，不能编造缺失内容。' },
    { role: 'user', content: buildPageLecturePrompt(study.analysis.title, study.sourceText, pageNumber) },
  ], 5000)
  if (!result?.trim()) throw new Error('这页的讲解暂时没有生成成功，可以重试，已保存的其他页不会丢失。')
  const current = loadCoursewareStudies(study.userId).find(item => item.id === study.id)
  if (!current) throw new Error('此课件已被删除，未保存本次讲解。')
  return saveCoursewareStudy({ ...current, updatedAt: new Date().toISOString(), analysis: {
    ...current.analysis, pageLectures: { ...current.analysis.pageLectures, [pageNumber]: result },
  } })
}

function sourceForPoint(study: CoursewareStudy, point: CoursewareKnowledgePoint): string {
  const slides = splitCoursewareSlides(study.sourceText)
  const selected = point.sourceSlides.length ? slides.filter(slide => point.sourceSlides.includes(slide.number)) : slides
  return selected.slice(0, 6).map(slide => `[第 ${slide.number} 页]\n${slide.text}`).join('\n\n').slice(0, 9000)
}

export async function generateDetailedPointExplanation(study: CoursewareStudy, pointId: string): Promise<CoursewareStudy> {
  const point = study.analysis.knowledgePoints.find(item => item.id === pointId)
  if (!point) return study
  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: '你是一位耐心但严谨的大学课程助教。只根据给出的课件证据讲解，不编造页码或课件内容。使用清晰 Markdown。' },
    { role: 'user', content: `请详细讲解课件《${study.analysis.title}》中的知识点“${point.title}”。\n\n课件证据：\n${sourceForPoint(study, point)}\n\n请依次说明：直观理解、严谨含义或成立条件、它与前后知识的关系、一个具体例子、常见误区、一道理解检查。引用证据时标注课件页码；若证据不足，明确指出哪部分属于通用补充知识。` },
  ]
  const result = await callDeepSeekAPI(messages, 8192)
  if (!result) throw new Error('AI 讲解暂时不可用，请检查 Edge Function 或开发环境 API 配置。')
  return saveCoursewareStudy({
    ...study,
    updatedAt: new Date().toISOString(),
    analysis: {
      ...study.analysis,
      knowledgePoints: study.analysis.knowledgePoints.map(item => item.id === pointId ? { ...item, detailedExplanation: result, progress: item.progress === 'NOT_STARTED' ? 'LEARNING' : item.progress } : item),
    },
  })
}
