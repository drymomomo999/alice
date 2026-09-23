import type { CoursewareAnalysis, CoursewareKnowledgePoint, CoursewareSection } from './types'

const GENERIC_LINES = /^(目录|contents?|overview|thank you|谢谢|本章小结|小结|学习目标|教学目标|课程目标|chapter\s*\d*)$/i

function hash(value: string): string {
  let result = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(36)
}

export function stableCoursewareId(prefix: string, value: string): string {
  return `${prefix}-${hash(value.trim().toLowerCase())}`
}

export interface SlideText {
  number: number
  text: string
}

export function splitCoursewareSlides(text: string): SlideText[] {
  const explicit = [...text.matchAll(/---\s*(?:slide|幻灯片|第)\s*(\d+)(?:\s*页)?\s*---/gi)]
  if (explicit.length) {
    return explicit.map((match, index) => ({
      number: Number(match[1]) || index + 1,
      text: text.slice((match.index || 0) + match[0].length, explicit[index + 1]?.index ?? text.length).trim(),
    })).filter(slide => slide.text)
  }
  return text.split(/\n\s*---\s*\n/g)
    .map((part, index) => ({ number: index + 1, text: part.trim() }))
    .filter(slide => slide.text)
}

function meaningfulLines(text: string): string[] {
  return text.split(/\r?\n/)
    .map(line => line.replace(/^[\s•·▪◦\-*\d.、）)]+/, '').trim())
    .filter(line => line.length >= 2 && line.length <= 80 && !GENERIC_LINES.test(line) && !/^\[.+\]$/.test(line))
}

function cleanStrings(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))].slice(0, limit)
}

function slideNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(Number).filter(item => Number.isInteger(item) && item > 0))].slice(0, 12)
}

function fallbackPoint(title: string, slideNumber: number, excerpt: string): CoursewareKnowledgePoint {
  const summary = excerpt.replace(/\s+/g, ' ').slice(0, 120) || `${title}的核心含义与使用条件`
  return {
    id: stableCoursewareId('kp', title),
    title,
    summary,
    explanation: `先明确“${title}”在本课件中的定义，再结合它出现的上下文，判断它解决的问题、成立条件和与前后知识的关系。`,
    whyItMatters: '它是理解本课件主线并完成后续应用或练习的必要环节。',
    sourceSlides: [slideNumber],
    prerequisites: [],
    commonMistakes: ['只记结论，没有同时记住适用条件', '能复述术语，但不能解释它与相邻知识点的关系'],
    checkQuestion: `不用看课件，用自己的话解释“${title}”，并举出一个它适用的场景。`,
    checkAnswer: `回答应至少包含：${title}的核心含义、一个成立条件，以及一个具体例子。`,
    progress: 'NOT_STARTED',
  }
}

export function buildFallbackCoursewareAnalysis(fileName: string, text: string): CoursewareAnalysis {
  const slides = splitCoursewareSlides(text)
  const candidates = slides.flatMap(slide => meaningfulLines(slide.text).slice(0, 2).map(line => ({ line, slide })))
  const seen = new Set<string>()
  const points: CoursewareKnowledgePoint[] = []
  for (const candidate of candidates) {
    const key = candidate.line.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    points.push(fallbackPoint(candidate.line, candidate.slide.number, candidate.slide.text))
    if (points.length >= 12) break
  }
  if (!points.length) points.push(fallbackPoint(fileName.replace(/\.[^.]+$/, ''), 1, text))

  const sections: CoursewareSection[] = []
  for (let index = 0; index < points.length; index += 4) {
    const group = points.slice(index, index + 4)
    sections.push({
      id: stableCoursewareId('section', `${fileName}:${index}`),
      title: group[0]?.title || `第 ${sections.length + 1} 部分`,
      summary: `从${group.map(point => point.title).join('、')}建立这一部分的知识链。`,
      knowledgePointIds: group.map(point => point.id),
    })
  }
  const title = fileName.replace(/\.[^.]+$/, '')
  return {
    title,
    courseHint: title,
    summary: `这份课件包含 ${slides.length || 1} 个内容单元，建议按知识大纲逐点理解并完成自测。`,
    learningObjectives: points.slice(0, 4).map(point => `能够解释并应用：${point.title}`),
    sections,
    knowledgePoints: points,
    suggestedPath: points.map(point => point.id),
  }
}

type LooseRecord = Record<string, unknown>

export function normalizeCoursewareAnalysis(raw: unknown, fileName: string, text: string): CoursewareAnalysis {
  const fallback = buildFallbackCoursewareAnalysis(fileName, text)
  if (!raw || typeof raw !== 'object') return fallback
  const source = raw as LooseRecord
  const rawPoints = Array.isArray(source.knowledgePoints) ? source.knowledgePoints : []
  const points = rawPoints.map((item, index) => {
    const record = item && typeof item === 'object' ? item as LooseRecord : {}
    const title = String(record.title || '').trim() || fallback.knowledgePoints[index]?.title || `知识点 ${index + 1}`
    const backup = fallback.knowledgePoints[index] || fallbackPoint(title, index + 1, text)
    return {
      ...backup,
      id: stableCoursewareId('kp', `${fileName}:${title}`),
      title,
      summary: String(record.summary || backup.summary).trim(),
      explanation: String(record.explanation || backup.explanation).trim(),
      whyItMatters: String(record.whyItMatters || backup.whyItMatters).trim(),
      sourceSlides: slideNumbers(record.sourceSlides).length ? slideNumbers(record.sourceSlides) : backup.sourceSlides,
      prerequisites: cleanStrings(record.prerequisites, 5),
      commonMistakes: cleanStrings(record.commonMistakes, 5).length ? cleanStrings(record.commonMistakes, 5) : backup.commonMistakes,
      checkQuestion: String(record.checkQuestion || backup.checkQuestion).trim(),
      checkAnswer: String(record.checkAnswer || backup.checkAnswer).trim(),
      progress: 'NOT_STARTED' as const,
    }
  }).slice(0, 20)
  const finalPoints = points.length ? points : fallback.knowledgePoints
  const pointByTitle = new Map(finalPoints.map(point => [point.title.toLowerCase(), point.id]))
  const pointIds = new Set(finalPoints.map(point => point.id))
  const rawSections = Array.isArray(source.sections) ? source.sections : []
  const sections = rawSections.map((item, index) => {
    const record = item && typeof item === 'object' ? item as LooseRecord : {}
    const title = String(record.title || `第 ${index + 1} 部分`).trim()
    const requested = cleanStrings(record.knowledgePoints, 10)
    const ids = requested.map(value => pointIds.has(value) ? value : pointByTitle.get(value.toLowerCase())).filter(Boolean) as string[]
    return {
      id: stableCoursewareId('section', `${fileName}:${title}`),
      title,
      summary: String(record.summary || '').trim() || `围绕${requested.join('、') || title}展开`,
      knowledgePointIds: [...new Set(ids)],
    }
  }).filter(section => section.knowledgePointIds.length).slice(0, 8)
  const finalSections = sections.length ? sections : [{
    id: stableCoursewareId('section', `${fileName}:main`),
    title: '核心内容',
    summary: '按课件顺序理解各知识点。',
    knowledgePointIds: finalPoints.map(point => point.id),
  }]
  return {
    title: String(source.title || fallback.title).trim(),
    courseHint: String(source.courseHint || fallback.courseHint).trim(),
    summary: String(source.summary || fallback.summary).trim(),
    learningObjectives: cleanStrings(source.learningObjectives, 8).length ? cleanStrings(source.learningObjectives, 8) : fallback.learningObjectives,
    sections: finalSections,
    knowledgePoints: finalPoints,
    suggestedPath: finalPoints.map(point => point.id),
  }
}
