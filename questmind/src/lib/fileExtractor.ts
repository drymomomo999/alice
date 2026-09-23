/**
 * 客户端文件文字提取工具
 *
 * 支持：TXT/MD（直接读取）、PDF（pdf.js 智能分段）、DOCX（mammoth）、PPTX（逐页 XML）
 * 图片：不提取文字，用户可手动输入描述
 *
 * PDF 改进（2026-06-01）：
 *  - 利用 textItem 的 y 坐标聚合"行"，消除 PPT 转 PDF 碎片化乱序问题
 *  - 过滤版权行（Copyright ©）、页码行（仅有数字/字母）、极短碎片
 *  - 截断上限从 3000 提升到 10000 字符，保留更多教材内容
 */

const MAX_EXTRACTED_LENGTH = 10000

/**
 * 从文件中提取文字内容
 * @returns 提取的文字（截断至 MAX_EXTRACTED_LENGTH），图片或提取失败返回 null
 */
export interface FileExtractionOptions {
  maxLength?: number
  maxPages?: number
}

export async function extractTextFromFile(file: File, options: FileExtractionOptions = {}): Promise<string | null> {
  const maxLength = options.maxLength || MAX_EXTRACTED_LENGTH
  try {
    if (file.type === 'text/plain' || file.type === 'text/markdown' || /\.txt$|\.md$/i.test(file.name)) {
      return truncate(await file.text(), maxLength)
    }
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      const text = await extractPdfText(file, options.maxPages)
      return truncate(text, maxLength)
    }
    if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      /\.docx$/i.test(file.name)
    ) {
      const text = await extractDocxText(file)
      return truncate(text, maxLength)
    }
    if (/\.pptx$/i.test(file.name)) {
      const text = await extractPptxText(file, options.maxPages)
      return truncate(text, maxLength)
    }
    // 图片或其他类型：不提取文字
    return null
  } catch (e) {
    console.error('Text extraction failed for', file.name, e)
    return null
  }
}

function truncate(text: string, maxLength = MAX_EXTRACTED_LENGTH): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '\n...[内容已截断]'
}

// ────────────────────────────────────────────────────────────────────────────
// PDF 文字提取（智能分段版）
// ────────────────────────────────────────────────────────────────────────────

/** Y 坐标相差在此阈值内视为同一行（单位：PDF 点） */
const SAME_LINE_Y_THRESHOLD = 3

/** 行间距超过此值视为新段落 */
const PARAGRAPH_GAP_THRESHOLD = 14

/** 单行字符数少于此值且不含空格 → 认为是碎片噪声 */
const MIN_LINE_CHARS = 3

/** 需要过滤的噪声模式 */
const NOISE_PATTERNS: RegExp[] = [
  /^copyright\s*©/i,
  /^©\s*\d{4}/i,
  /^all rights reserved/i,
  /^pearson education/i,
  /^\d+\s*of\s*\d+$/, // "1 of 5"
  /^slide\s*\d+$/i,   // "Slide 3"
  /^\s*\d+\s*$/,      // 纯页码
]

interface TextItem {
  str: string
  transform: number[] // [scaleX, skewX, skewY, scaleY, x, y]
  width: number
  height: number
}

/** 将一页的 textItems 按 y 坐标聚合成行，再按行间距判段落 */
function buildPageText(items: TextItem[]): string {
  if (items.length === 0) return ''

  // 1. 按 y 坐标降序排（PDF 坐标原点在左下，y 越大越靠上）
  const sorted = [...items].sort((a, b) => {
    const yA = a.transform[5]
    const yB = b.transform[5]
    // y 相近 → 同行，按 x 升序
    if (Math.abs(yA - yB) < SAME_LINE_Y_THRESHOLD) {
      return a.transform[4] - b.transform[4]
    }
    return yB - yA
  })

  // 2. 聚合到"行"
  type Line = { y: number; texts: string[] }
  const lines: Line[] = []
  for (const item of sorted) {
    const y = item.transform[5]
    const last = lines[lines.length - 1]
    if (last && Math.abs(last.y - y) < SAME_LINE_Y_THRESHOLD) {
      last.texts.push(item.str)
    } else {
      lines.push({ y, texts: [item.str] })
    }
  }

  // 3. 行 → 字符串，过滤噪声
  const lineStrings: string[] = []
  for (const line of lines) {
    const text = line.texts.join('').trim()
    if (!text) continue
    if (text.length < MIN_LINE_CHARS && !/[\u4e00-\u9fa5]/.test(text)) continue
    if (NOISE_PATTERNS.some(p => p.test(text))) continue
    lineStrings.push(text)
  }

  // 4. 行 → 段落（根据 y 间距判断是否换段）
  // 重新用原始 y 值计算间距
  const lineYs = lines
    .map(l => l.texts.join('').trim())
    .map((_, i) => lines[i].y)

  const paragraphTexts: string[] = []
  let currentParagraph: string[] = []
  let prevY: number | null = null

  for (let i = 0; i < lineStrings.length; i++) {
    const text = lineStrings[i]
    const currY = lineYs[i] ?? 0

    if (prevY !== null) {
      const gap = prevY - currY
      if (gap > PARAGRAPH_GAP_THRESHOLD) {
        // 段落间距
        if (currentParagraph.length > 0) {
          paragraphTexts.push(currentParagraph.join(' '))
          currentParagraph = []
        }
      }
    }
    currentParagraph.push(text)
    prevY = currY
  }
  if (currentParagraph.length > 0) {
    paragraphTexts.push(currentParagraph.join(' '))
  }

  return paragraphTexts.join('\n\n')
}

async function extractPdfText(file: File, requestedMaxPages?: number): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const maxPages = Math.min(pdf.numPages, requestedMaxPages || 20)
  const pageTexts: string[] = []

  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = buildPageText(content.items as TextItem[])
    pageTexts.push(`--- Slide ${i} ---\n${pageText.trim() || '[本页未提取到可读文字，可能是图片或空白页]'}`)
  }

  return pageTexts.join('\n\n')
}

// ────────────────────────────────────────────────────────────────────────────
// DOCX 文字提取
// ────────────────────────────────────────────────────────────────────────────

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

// ────────────────────────────────────────────────────────────────────────────
// PPTX 文字提取（按幻灯片顺序保留页码）
// ────────────────────────────────────────────────────────────────────────────

async function extractPptxText(file: File, requestedMaxSlides?: number): Promise<string> {
  return extractPptxTextFromArrayBuffer(await file.arrayBuffer(), requestedMaxSlides)
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
}

function extractXmlValues(xml: string, tags: string[]): string[] {
  const pattern = tags.map(tag => tag.replace(':', '\\:')).join('|')
  return [...xml.matchAll(new RegExp(`<(?:${pattern})(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:${pattern})>`, 'gi'))]
    .map(match => decodeXmlText(match[1]).trim())
    .filter(Boolean)
}

function resolvePptxTarget(sourceName: string, target: string): string {
  const segments = `${sourceName.slice(0, sourceName.lastIndexOf('/') + 1)}${target}`.split('/')
  const resolved: string[] = []
  for (const segment of segments) {
    if (!segment || segment === '.') continue
    if (segment === '..') resolved.pop()
    else resolved.push(segment)
  }
  return resolved.join('/')
}

export async function extractPptxTextFromArrayBuffer(arrayBuffer: ArrayBuffer, requestedMaxSlides?: number): Promise<string> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(arrayBuffer)
  const slideNames = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0))
    .slice(0, requestedMaxSlides || 40)
  const pages: string[] = []
  for (const name of slideNames) {
    const xml = await zip.file(name)?.async('string')
    if (!xml) continue
    const lines = extractXmlValues(xml, ['a:t', 'm:t'])
    const slideNumber = Number(name.match(/slide(\d+)\.xml/i)?.[1] || pages.length + 1)
    const sections: string[] = []
    if (lines.length) sections.push(`[幻灯片文字]\n${lines.join('\n')}`)

    const relationName = name.replace('/slides/', '/slides/_rels/') + '.rels'
    const relationsXml = await zip.file(relationName)?.async('string')
    if (relationsXml) {
      const targets = [...relationsXml.matchAll(/<Relationship\b[^>]*\bTarget="([^"]+)"[^>]*>/gi)]
        .map(match => decodeXmlText(match[1]))
      const relatedValues: string[] = []
      const notes: string[] = []
      for (const target of targets) {
        const relatedName = resolvePptxTarget(name, target)
        const relatedXml = await zip.file(relatedName)?.async('string')
        if (!relatedXml) continue
        if (/\/notesSlides\//i.test(relatedName)) {
          notes.push(...extractXmlValues(relatedXml, ['a:t', 'm:t']))
        } else if (/\/(?:charts|diagrams)\//i.test(relatedName)) {
          relatedValues.push(...extractXmlValues(relatedXml, ['a:t', 'm:t', 'c:f', 'c:v']))
        }
      }
      const uniqueRelated = [...new Set(relatedValues)].filter(value => !lines.includes(value))
      const uniqueNotes = [...new Set(notes)].filter(value => !lines.includes(value) && !/^\d+$/.test(value))
      if (uniqueRelated.length) sections.push(`[图表或关系图中的可识别数据]\n${uniqueRelated.join('\n')}`)
      if (uniqueNotes.length) sections.push(`[讲者备注]\n${uniqueNotes.join('\n')}`)
    }
    pages.push(`--- Slide ${slideNumber} ---\n${sections.join('\n\n') || '[本页未提取到可读文字，可能是图片或空白页]'}`)
  }
  return pages.join('\n\n')
}
