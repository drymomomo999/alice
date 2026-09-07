import type { CourseDocumentInput, DocumentClassification, CourseDocumentType } from './types'
import { clamp } from './utils'

const TYPE_RULES: Array<{ type: CourseDocumentType; patterns: RegExp[]; reason: string }> = [
  { type: 'syllabus_exam_scope', patterns: [/考试大纲|考试范围|考核要求|syllabus|exam scope/i], reason: '文件名或内容包含考试范围信号' },
  { type: 'past_exam', patterns: [/往年|真题|期末|期中|试卷|past exam|mock exam/i], reason: '文件名或内容呈现试卷或真题特征' },
  { type: 'mistake_set', patterns: [/错题|订正|易错题|mistake|error log/i], reason: '文件名或内容包含错题记录特征' },
  { type: 'homework', patterns: [/作业|homework|assignment|problem set|习题课作业/i], reason: '文件名或内容包含作业特征' },
  { type: 'tutorial_exercises', patterns: [/习题|练习|exercise|tutorial|题库/i], reason: '文件名或内容包含练习资料特征' },
  { type: 'lecture_slides', patterns: [/课件|讲义|第\s*\d+\s*讲|lecture|slides?|ppt/i], reason: '文件名或内容包含讲次或课件特征' },
  { type: 'lecture_notes', patterns: [/课堂笔记|听课笔记|笔记|notes?/i], reason: '文件名或内容包含课堂笔记特征' },
  { type: 'textbook', patterns: [/教材|教科书|chapter|第\s*[一二三四五六七八九十\d]+\s*章|textbook/i], reason: '文件名或内容包含教材章节特征' },
]

function inferCourseName(input: CourseDocumentInput, fallback: string): string {
  if (input.classification?.courseName) return input.classification.courseName
  const source = `${input.name}\n${input.text.slice(0, 300)}`
  const bookTitle = source.match(/[《〈]([^》〉]{2,30})[》〉]/)?.[1]
  if (bookTitle) return bookTitle.trim()
  const cleaned = input.name
    .replace(/\.[^.]+$/, '')
    .replace(/第\s*[一二三四五六七八九十百\d]+\s*[章节讲课]/g, '')
    .replace(/(课件|讲义|教材|作业|习题|试卷|笔记|lecture|chapter|slides?)/gi, '')
    .replace(/[_\-—]+/g, ' ')
    .trim()
  return cleaned.length >= 2 && cleaned.length <= 30 ? cleaned : fallback
}

export function classifyDocument(input: CourseDocumentInput, courseNameFallback = '未归类课程'): DocumentClassification {
  const sample = `${input.name}\n${input.text.slice(0, 2400)}`
  const scores = new Map<CourseDocumentType, { score: number; reasons: string[] }>()
  TYPE_RULES.forEach(rule => {
    const hits = rule.patterns.filter(pattern => pattern.test(sample)).length
    if (hits > 0) scores.set(rule.type, { score: 0.56 + Math.min(0.34, hits * 0.12), reasons: [rule.reason] })
  })

  const shortLineRatio = input.text
    ? input.text.split(/\n+/).filter(Boolean).filter(line => line.trim().length < 45).length / Math.max(1, input.text.split(/\n+/).filter(Boolean).length)
    : 0
  const hasSpecificNonSlideType = [...scores.keys()].some(type => type !== 'lecture_slides' && type !== 'textbook')
  if (/\.pdf$/i.test(input.name) && shortLineRatio > 0.65 && !hasSpecificNonSlideType) {
    const prior = scores.get('lecture_slides') || { score: 0, reasons: [] }
    scores.set('lecture_slides', { score: Math.max(prior.score, 0.72), reasons: [...prior.reasons, '短行密集，符合 PDF 导出课件排版'] })
  }

  const selected = [...scores.entries()].sort((a, b) => b[1].score - a[1].score)[0]
  const inferredType = selected?.[0] || 'other'
  const overrideType = input.classification?.documentType
  const pageCount = Math.max(1, input.text.split(/\n\s*---\s*\n/g).length)
  const chinese = (input.text.match(/[\u4e00-\u9fff]/g) || []).length
  const latin = (input.text.match(/[a-z]/gi) || []).length
  const language = chinese > latin * 1.2 ? 'zh' : latin > chinese * 1.2 ? 'en' : 'mixed'
  const chapter = input.classification?.chapter || sample.match(/第\s*([一二三四五六七八九十百\d]+)\s*([章节讲课])/u)?.[0]
  const corrected = Boolean(input.classification?.correctedByUser && overrideType)

  return {
    documentType: overrideType || inferredType,
    courseName: inferCourseName(input, courseNameFallback),
    chapter,
    language,
    pageCount,
    confidence: corrected ? 1 : clamp(input.classification?.confidence ?? selected?.[1].score ?? 0.35),
    reasons: corrected ? ['用户已手动确认资料类型'] : selected?.[1].reasons || ['未发现足够类型信号，暂归为其他资料'],
    correctedByUser: corrected,
  }
}
