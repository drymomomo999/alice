/**
 * PDF 页面渲染器
 *
 * 使用 pdfjs-dist canvas 渲染 PDF 页面，替代 <iframe> 方案。
 * Android WebView 不支持 iframe 内 PDF，此组件提供跨平台一致的 PDF 阅读体验。
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Loader2, FileText, ZoomIn, ZoomOut } from 'lucide-react'

interface PdfPageRendererProps {
  /** PDF 文件的 blob URL 或远程 URL */
  pdfUrl: string | null
  /** PDF 文件名（显示用） */
  fileName?: string
}

export function PdfPageRenderer({ pdfUrl, fileName = '文档' }: PdfPageRendererProps) {
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 初始化 pdfjs worker（仅一次）
  useEffect(() => {
    import('pdfjs-dist').then(pdfjsLib => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs'
    })
  }, [])

  // 加载 PDF 文档
  useEffect(() => {
    if (!pdfUrl) {
      setPdfDoc(null)
      setNumPages(0)
      setCurrentPage(1)
      setError(null)
      setRenderError(null)
      return
    }

    let cancelled = false
    const loadPdf = async () => {
      setLoading(true)
      setError(null)
      setRenderError(null)
      try {
        const pdfjsLib = await import('pdfjs-dist')
        const pdf = await pdfjsLib.getDocument({
          url: pdfUrl,
          cMapUrl: undefined,
          cMapPacked: false,
          standardFontDataUrl: undefined,
        }).promise

        if (cancelled) return
        setPdfDoc(pdf)
        setNumPages(pdf.numPages)
        setCurrentPage(1)
      } catch (e) {
        if (cancelled) return
        console.error('[PdfPageRenderer] 加载失败:', e)
        setError(e instanceof Error ? e.message : 'PDF 加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadPdf()

    return () => { cancelled = true }
  }, [pdfUrl])

  // 自适应 scale：根据容器宽度计算最佳缩放
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth
        // 留出左右 padding (32px = 16*2)
        const availWidth = w - 32
        // 默认 scale = 1.2，但最大不超过容器宽度的 95%
        const autoScale = Math.min(1.2, (availWidth - 16) / 595) // A4 width ≈ 595pt
        setScale(autoScale >= 0.5 ? autoScale : 0.5)
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // 渲染当前页
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    try {
      setRenderError(null)
      const page = await pdfDoc.getPage(currentPage)
      const viewport = page.getViewport({ scale })

      // 设置 canvas 物理尺寸（考虑 devicePixelRatio 避免模糊）
      const pixelRatio = window.devicePixelRatio || 1
      canvas.width = viewport.width * pixelRatio
      canvas.height = viewport.height * pixelRatio
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

      await page.render({ canvasContext: ctx, viewport }).promise
    } catch (e) {
      console.error('[PdfPageRenderer] 渲染失败:', e)
      setRenderError('页面渲染失败')
    }
  }, [pdfDoc, currentPage, scale])

  useEffect(() => {
    renderPage()
  }, [renderPage])

  // 翻页
  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= numPages) {
      setCurrentPage(page)
    }
  }, [numPages])

  // 缩放
  const zoomIn = () => setScale(s => Math.min(s + 0.2, 3.0))
  const zoomOut = () => setScale(s => Math.max(s - 0.2, 0.4))

  // ============================================================
  // 状态：无 URL / 加载中 / 错误 / 正常
  // ============================================================

  if (!pdfUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-14 h-14 rounded-2xl bg-sakura/10 flex items-center justify-center">
          <FileText className="w-7 h-7 text-sakura/50" />
        </div>
        <p className="text-sm text-muted-foreground">暂无文档</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="w-8 h-8 text-sakura animate-spin" />
        <p className="text-sm text-muted-foreground">正在加载文档...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
          <FileText className="w-7 h-7 text-red-400" />
        </div>
        <p className="text-sm font-medium text-gray-700">文档加载失败</p>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">{error}</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full flex flex-col">
      {/* === 工具栏 === */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <span className="text-xs text-gray-500 truncate max-w-[120px]">{fileName}</span>

        <div className="flex items-center gap-3">
          {/* 缩放 */}
          <button
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center disabled:opacity-30 transition-colors"
          >
            <ZoomOut className="w-3.5 h-3.5 text-gray-500" />
          </button>
          <span className="text-[10px] text-gray-400 w-8 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={zoomIn}
            disabled={scale >= 3.0}
            className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center disabled:opacity-30 transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5 text-gray-500" />
          </button>

          <div className="w-px h-4 bg-gray-200" />

          {/* 翻页 */}
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-[10px] text-gray-500 tabular-nums min-w-[40px] text-center">
            {currentPage}/{numPages}
          </span>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= numPages}
            className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* === Canvas 渲染区域 === */}
      <div className="flex-1 overflow-auto bg-gray-100 flex justify-center p-4 min-h-0">
        {renderError ? (
          <div className="flex flex-col items-center justify-center gap-3">
            <p className="text-sm text-red-500">{renderError}</p>
            <button
              onClick={renderPage}
              className="px-3 py-1.5 text-xs rounded-lg bg-sakura/15 text-sakura hover:bg-sakura/25 transition-colors"
            >
              重新渲染
            </button>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="shadow-lg bg-white"
          />
        )}
      </div>
    </div>
  )
}
