/**
 * 客户端文件文字提取工具
 *
 * 支持：TXT/MD（直接读取）、PDF（pdf.js）、DOCX（mammoth）
 * 图片：不提取文字，用户可手动输入描述
 *
 * 提取文字截断至 3000 字符，避免 AI prompt 过长
 */

const MAX_EXTRACTED_LENGTH = 3000

/**
 * 从文件中提取文字内容
 * @returns 提取的文字（截断至 3000 字），图片或提取失败返回 null
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
    if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(file.name)) {
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

async function extractPdfText(file: File): Promise<string> {
  // 动态导入 pdfjs-dist，避免影响首屏包体积
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  let fullText = ''
  // 只提取前 10 页，控制数据量
  const maxPages = Math.min(pdf.numPages, 10)
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    fullText += content.items.map((item: any) => item.str).join(' ') + '\n'
  }
  return fullText
}

async function extractDocxText(file: File): Promise<string> {
  // 动态导入 mammoth
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}
