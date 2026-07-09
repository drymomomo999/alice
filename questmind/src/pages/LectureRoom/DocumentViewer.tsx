import { useMemo } from 'react'

interface DocumentViewerProps {
  text: string
  className?: string
}

/**
 * 文档内容渲染器
 * 将 extractedText 渲染为可阅读的排版内容
 *
 * 改进（2026-06-01）：
 *  - 支持页面分隔符（---），渲染为分割线
 *  - 优化 PPT 转 PDF 场景下的标题识别（全大写行、短句行等）
 *  - 过滤残留噪声行
 */
export function DocumentViewer({ text, className = '' }: DocumentViewerProps) {
  const paragraphs = useMemo(() => parseDocument(text), [text])

  if (!text.trim()) {
    return (
      <div className={`flex items-center justify-center py-20 ${className}`}>
        <p className="text-sm text-muted-foreground italic">暂无文档内容</p>
      </div>
    )
  }

  return (
    <div className={`prose-custom ${className}`}>
      {paragraphs.map((block, idx) => {
        switch (block.type) {
          case 'heading':
            return (
              <h2 key={idx} className="text-base font-bold text-foreground mt-8 mb-3 pb-1.5 border-b border-sakura/20">
                {block.content}
              </h2>
            )
          case 'subheading':
            return (
              <h3 key={idx} className="text-sm font-semibold text-foreground/90 mt-5 mb-2">
                {block.content}
              </h3>
            )
          case 'paragraph':
            return (
              <p key={idx} className="text-sm leading-7 text-foreground/80 mb-3">
                {block.content}
              </p>
            )
          case 'listitem':
            return (
              <li key={idx} className="text-sm leading-7 text-foreground/80 mb-1 ml-6 list-disc">
                {block.content}
              </li>
            )
          case 'divider':
            return (
              <div key={idx} className="my-6 flex items-center gap-2">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-sakura/30 to-transparent" />
                <span className="text-[10px] text-muted-foreground/40 px-2">· · ·</span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-sakura/30 to-transparent" />
              </div>
            )
          case 'empty':
            return <div key={idx} className="h-2" />
          default:
            return (
              <p key={idx} className="text-sm leading-7 text-foreground/80 mb-3">
                {block.content}
              </p>
            )
        }
      })}
    </div>
  )
}

// ── 文档解析 ─────────────────────────────────────────────────────────────────

type BlockType = 'heading' | 'subheading' | 'paragraph' | 'listitem' | 'divider' | 'empty'

interface TextBlock {
  type: BlockType
  content: string
}

/** 残留噪声行 — 在 DocumentViewer 层再过滤一次 */
const NOISE_FILTER: RegExp[] = [
  /^copyright\s*©/i,
  /^©\s*\d{4}/i,
  /^all rights reserved/i,
  /^pearson education/i,
  /^\d+\s*of\s*\d+$/i,
]

/** 章节标题正则（中英文通用）*/
const HEADING_PATTERNS = [
  /^第[一二三四五六七八九十百千\d]+[章篇节部回]\s*.+/,
  /^Chapter\s+\d+.*/i,
  /^CHAPTER\s+\d+.*/,
  /^[一二三四五六七八九十]+[、.．]\s*.+/,
  /^\d+[、.．]\s*.+/,
]

/** 小节标题正则 */
const SUBHEADING_PATTERNS = [
  /^\d+\.\d+\s*.+/,
  /^[一二三四五六七八九十]+[.．]\d+\s*.+/,
]

/** 列表项正则 */
const LIST_PATTERNS = [
  /^[-•▪▫▸▹●○◆◇★☆►▶]\s+.+/,
  /^\(\d+\)\s+.+/,
]

/**
 * 判断是否是 PPT 风格的主标题行：
 * - 全大写英文，长度 ≤ 60
 * - 末尾没有句号（标题不以标点结束）
 */
function isPptHeading(line: string): boolean {
  if (line.length > 80) return false
  if (/[.!?。！？]$/.test(line)) return false
  // 全大写且含字母
  if (/^[A-Z0-9\s\-&:,()]+$/.test(line) && /[A-Z]{2,}/.test(line)) return true
  return false
}

function parseDocument(text: string): TextBlock[] {
  const lines = text.split(/\n/)
  const blocks: TextBlock[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()

    // 分隔线（由 fileExtractor 插入的 ---）
    if (line === '---') {
      blocks.push({ type: 'divider', content: '' })
      continue
    }

    // 空行
    if (!line) {
      // 避免连续多个空行
      const last = blocks[blocks.length - 1]
      if (!last || last.type !== 'empty') {
        blocks.push({ type: 'empty', content: '' })
      }
      continue
    }

    // 噪声过滤
    if (NOISE_FILTER.some(p => p.test(line))) continue

    // 章节标题
    if (HEADING_PATTERNS.some(p => p.test(line))) {
      blocks.push({ type: 'heading', content: cleanHeading(line) })
      continue
    }

    // 小节标题
    if (SUBHEADING_PATTERNS.some(p => p.test(line))) {
      blocks.push({ type: 'subheading', content: cleanHeading(line) })
      continue
    }

    // 列表项
    if (LIST_PATTERNS.some(p => p.test(line))) {
      blocks.push({ type: 'listitem', content: cleanListItem(line) })
      continue
    }

    // PPT 风格主标题（全大写短句）
    if (isPptHeading(line)) {
      blocks.push({ type: 'heading', content: line })
      continue
    }

    // 普通段落
    blocks.push({ type: 'paragraph', content: line })
  }

  return blocks
}

function cleanHeading(line: string): string {
  return line
    .replace(/^[一二三四五六七八九十百千\d]+[章篇节部回]\s*/, '')
    .replace(/^Chapter\s+\d+\s*/i, '')
    .replace(/^CHAPTER\s+\d+\s*/, '')
    .replace(/^[一二三四五六七八九十]+[、.．]\s*/, '')
    .replace(/^\d+[、.．]\s*/, '')
    .trim()
}

function cleanListItem(line: string): string {
  return line.replace(/^[-•▪▫▸▹●○◆◇★☆►▶]\s+/, '').replace(/^\(\d+\)\s+/, '').trim()
}
