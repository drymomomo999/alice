/**
 * 客户端文件文字提取工具
 *
 * 支持：TXT/MD（直接读取）、PDF（pdf.js 智能分段）、DOCX（mammoth）
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
export async function extractTextFromFile(file: File): Promise<string | null> {
  try {
    if (file.type === 'text/plain' || file.type === 'text/markdown' || /\.txt$|\.md$/i.test(file.name)) {
      return truncate(await file.text())
    }
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      const text = await extractPdfText(file)
      return truncate(text)
    }
    if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      /\.docx$/i.test(file.name)
    ) {
      const text = await extractDocxText(file)
      return truncate(text)
    }
    // 图片或其他类型：不提取文字
    return null
  } catch (e) {
    console.error('Text extraction failed for', file.name, e)
    return null
  }
}

function truncate(text: string): string {
  if (text.length <= MAX_EXTRACTED_LENGTH) return text
  return text.slice(0, MAX_EXTRACTED_LENGTH) + '\n...[内容已截断]'
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

async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const maxPages = Math.min(pdf.numPages, 20) // 上限 20 页（PPT 通常 20-40 张）
  const pageTexts: string[] = []

  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = buildPageText(content.items as TextItem[])
    if (pageText.trim()) {
      pageTexts.push(pageText)
    }
  }

  return pageTexts.join('\n\n---\n\n')
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
