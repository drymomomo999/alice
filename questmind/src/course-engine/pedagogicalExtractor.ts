import type { CourseDocument, PedagogicalBlock, PedagogicalBlockType } from './types'
import { stableId } from './utils'

function classifyLine(line: string, index: number): PedagogicalBlockType {
  const text = line.trim()
  if (/^(总结|小结|本章小结|summary|review)\b/i.test(text)) return 'summary'
  if (/(注意|重点|必考|易错|警告|warning|important)/i.test(text)) return 'warning'
  if (/(例\s*\d*|例题|example|案例)/i.test(text)) return 'example'
  if (/(练习|作业|思考题|exercise|question|\?\s*$|？\s*$)/i.test(text)) return 'exercise'
  if (/(证明|推导|derive|proof|步骤\s*[一二三四五六七八九十\d]+)/i.test(text) || /[=⇒→].*[=⇒→]/.test(text)) return 'derivation'
  if (/[=≈≠≤≥∑∫√]|\b[A-Za-z]\s*=\s*[^，。]+/.test(text)) return 'formula'
  if (index === 0 || text.length <= 28 && !/[，。；：,.]/.test(text)) return 'title'
  return 'body'
}

export function extractPedagogicalBlocks(document: CourseDocument): PedagogicalBlock[] {
  const pages = document.text.split(/\n\s*---\s*\n/g)
  const blocks: PedagogicalBlock[] = []
  pages.forEach((page, pageIndex) => {
    const lines = page.split(/\n+/).map(line => line.trim()).filter(line => line.length >= 2)
    lines.forEach((line, order) => {
      const type = classifyLine(line, order)
      blocks.push({
        id: stableId('block', `${document.id}:${pageIndex + 1}:${order}:${line}`),
        documentId: document.id,
        pageOrSlide: pageIndex + 1,
        order,
        type,
        text: line.slice(0, 800),
        visualEmphasis: type === 'title' ? 0.9 : /重点|必考|注意|important/i.test(line) ? 0.8 : 0.2,
      })
    })
  })
  return blocks
}
