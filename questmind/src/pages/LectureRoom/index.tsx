import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Upload, Loader2 } from 'lucide-react'
import { useGoalsStore, useUserStore } from '@/store'
import {
  generateLecture,
  sendAIMessage,
  buildGoalContextString,
  buildSourceDocuments,
  type LectureMode,
} from '@/services/ai.service'
import { AlicePet, type PetMessage } from './AlicePet'
import { PdfPageRenderer } from './PdfPageRenderer'

/** 讲解模式菜单配置 */
const LECTURE_MODES: { key: string; label: string; icon: string }[] = [
  { key: 'overview',   label: '梳理知识框架', icon: '📖' },
  { key: 'chapter',    label: '讲解当前章节', icon: '📚' },
  { key: 'keypoints',  label: '提炼考试重点', icon: '🔑' },
  { key: 'example',    label: '举一个实际例子', icon: '💡' },
  { key: 'quiz_prep',  label: '来考考我', icon: '✏️' },
]

/** 连续讲解流检测关键词 */
const CONTINUE_PATTERNS = [
  '继续', '接着讲', '再深入', '再讲讲', '继续讲', '往下讲',
  '再详细一点', '展开说说', '详细讲讲', '多说一点',
  '换一个例子', '换个例子', '再举个例子', '还有呢',
  '没听懂', '没理解', '没搞懂', '再解释', '重新讲',
]

export function LectureRoomPage() {
  const { goalId } = useParams<{ goalId: string }>()
  const navigate = useNavigate()
  const { goals } = useGoalsStore()
  const { user } = useUserStore()

  const goal = goals.find(g => g.id === goalId)

  // 文档内容状态
  const [activeDocIndex, setActiveDocIndex] = useState(0)

  // 聊天状态
  const [messages, setMessages] = useState<PetMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // 获取有 URL 的文档附件（用于 PDF 渲染）
  const docAttachments = goal?.attachments?.filter(a => a.type === 'document') || []
  const activeDoc = docAttachments[activeDocIndex] || null

  // Blob URL 加载（绕过 CSP 和 X-Frame-Options）
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  // 文档切换时下载 PDF 为 Blob
  useEffect(() => {
    if (!activeDoc?.url) {
      setPdfBlobUrl(null)
      setPdfError(null)
      return
    }

    let cancelled = false
    const loadPdf = async () => {
      setPdfLoading(true)
      setPdfError(null)
      try {
        const resp = await fetch(activeDoc!.url!)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const blob = await resp.blob()
        if (cancelled) return
        // 清理旧 blob URL
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
        const url = URL.createObjectURL(blob)
        blobUrlRef.current = url
        setPdfBlobUrl(url)
      } catch (e) {
        if (!cancelled) setPdfError(e instanceof Error ? e.message : '加载失败')
      } finally {
        if (!cancelled) setPdfLoading(false)
      }
    }
    loadPdf()
    return () => {
      cancelled = true
    }
  }, [activeDoc?.url, activeDoc?.id])

  // 组件卸载时清理 blob URL
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  // 连续讲解流：获取最近一条讲解消息
  const getLastLectureContent = useCallback((): string | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'alice' && messages[i].isLecture && messages[i].content.length > 20) {
        return messages[i].content
      }
    }
    return null
  }, [messages])

  // 检测连续讲解流
  const isContinueLecture = useCallback((text: string): boolean => {
    const trimmed = text.trim()
    return CONTINUE_PATTERNS.some(p => trimmed.includes(p))
  }, [])

  // 获取源文档
  const getLectureOptions = useCallback((mode: LectureMode, priorContent?: string | null) => {
    if (!goal) return null
    const goalContext = buildGoalContextString(goal)
    const sourceDocs = buildSourceDocuments(goal)
    const focusedSubGoal = goal.subGoals?.find(sg => !sg.completed)
    return {
      goalTitle: goal.title,
      goalContext,
      subGoalTitle: focusedSubGoal?.title,
      mode,
      userName: user?.nickname || '你',
      priorExchange: priorContent ? priorContent.slice(0, 1500) : undefined,
      sourceDocuments: sourceDocs.length > 0 ? sourceDocs : undefined,
    }
  }, [goal, user])

  // 初始欢迎消息
  useEffect(() => {
    if (!goal) return
    if (messages.length > 0) return

    const docHint = docAttachments.length > 0
      ? `我已经读了你上传的${docAttachments.length}份文档，随时可以讲解。`
      : '你可以先上传文档，我讲解时会引用具体内容。'

    setMessages([{
      id: 'welcome',
      role: 'alice',
      content: `欢迎来到「${goal.title}」的讲解房间！${docHint}\n\n点左下角的 ✨ 选择讲解方式，也可以直接问我问题。`,
    }])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal?.id])

  // 触发讲解模式
  const handleLectureMode = useCallback(async (key: string) => {
    if (!goal || isLoading) return
    setIsLoading(true)

    const mode = key as LectureMode
    const modeLabel = LECTURE_MODES.find(m => m.key === key)?.label || ''

    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: modeLabel,
    }])

    try {
      const lastLecture = getLastLectureContent()
      const options = getLectureOptions(mode, lastLecture)
      if (!options) throw new Error('无法构建讲解参数')

      const response = await generateLecture(options)
      setMessages(prev => [...prev, {
        id: `ai-lecture-${Date.now()}`,
        role: 'alice',
        content: response,
        isLecture: true,
      }])
    } catch {
      setMessages(prev => [...prev, {
        id: `ai-err-${Date.now()}`,
        role: 'alice',
        content: '讲解功能暂时不可用，请稍后再试。',
      }])
    } finally {
      setIsLoading(false)
    }
  }, [goal, isLoading, getLastLectureContent, getLectureOptions])

  // 发送普通消息
  const handleSend = useCallback(async () => {
    const text = inputValue.trim()
    if (!text || isLoading) return

    setInputValue('')
    setIsLoading(true)

    const userMsg: PetMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    }
    setMessages(prev => [...prev, userMsg])

    try {
      // 连续讲解流检测
      const lastLecture = getLastLectureContent()
      if (isContinueLecture(text) && lastLecture && goal) {
        const options = getLectureOptions('chapter', lastLecture)
        if (options) {
          const response = await generateLecture(options)
          setMessages(prev => [...prev, {
            id: `ai-lecture-${Date.now()}`,
            role: 'alice',
            content: response,
            isLecture: true,
          }])
          return
        }
      }

      // 普通聊天
      const messageHistory = messages
        .filter(m => m.id !== 'welcome')
        .slice(-10)
        .concat(userMsg)
        .map(m => ({
          id: m.id,
          characterId: 'alice' as const,
          content: m.content,
          timestamp: new Date().toISOString(),
          isUser: m.role === 'user',
        }))

      const selectedGoalContext = goal ? buildGoalContextString(goal) : undefined

      const response = await sendAIMessage({
        characterId: 'alice',
        userId: user?.id || 'demo',
        userName: user?.nickname || '来访者',
        currentGoals: goal ? [goal.title] : [],
        selectedGoalContext,
        messageHistory,
      })

      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        role: 'alice',
        content: response,
      }])
    } catch {
      setMessages(prev => [...prev, {
        id: `ai-err-${Date.now()}`,
        role: 'alice',
        content: '抱歉，通讯系统出了点小问题。请稍后再试呢。',
      }])
    } finally {
      setIsLoading(false)
    }
  }, [inputValue, isLoading, messages, goal, user, isContinueLecture, getLastLectureContent, getLectureOptions])

  // 目标不存在
  if (!goal) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sakura-light/10 to-white flex flex-col items-center justify-center">
        <p className="text-sm text-muted-foreground mb-4">找不到该目标</p>
        <button
          onClick={() => navigate('/goals')}
          className="text-xs text-sakura hover:text-sakura-dark transition-colors"
        >
          返回目标列表
        </button>
      </div>
    )
  }

  return (
    <div className="h-screen overflow-hidden bg-[#f5f5f5] flex flex-col">
      {/* ===== 顶部导航栏 ===== */}
      <header className="shrink-0 z-30 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3">
        <button
          onClick={() => navigate('/goals')}
          className="shrink-0 w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-gray-900 truncate">{goal.title}</h1>
          <p className="text-[10px] text-gray-400">
            {docAttachments.length > 0
              ? `${docAttachments.length} 份文档 · 进度 ${goal.progress}%`
              : `进度 ${goal.progress}%`
            }
          </p>
        </div>

        {/* 文档切换标签 */}
        {docAttachments.length > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            {docAttachments.map((doc, idx) => (
              <button
                key={doc.id}
                onClick={() => setActiveDocIndex(idx)}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors flex items-center gap-1 ${
                  idx === activeDocIndex
                    ? 'bg-sakura/15 text-sakura font-medium'
                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
              >
                <FileText className="w-3 h-3" />
                {doc.name.split('.').slice(0, -1).join('.').slice(0, 12)}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* ===== PDF 阅读区 ===== */}
      <main className="flex-1 overflow-hidden min-h-0">
        {activeDoc?.url ? (
          pdfLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="w-8 h-8 text-sakura animate-spin" />
              <p className="text-sm text-gray-400">正在下载文档...</p>
            </div>
          ) : pdfError ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
                <FileText className="w-7 h-7 text-red-400" />
              </div>
              <div className="text-center max-w-xs px-6">
                <p className="text-sm text-gray-700 font-medium mb-1">文档加载失败</p>
                <p className="text-xs text-gray-400 leading-relaxed">{pdfError}</p>
              </div>
            </div>
          ) : (
            <PdfPageRenderer
              pdfUrl={pdfBlobUrl}
              fileName={activeDoc.name}
            />
          )
        ) : activeDoc && !activeDoc.url ? (
          /* 有附件但没有公开 URL（未登录本地场景） */
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center">
              <FileText className="w-7 h-7 text-amber-400" />
            </div>
            <div className="text-center max-w-xs px-6">
              <p className="text-sm text-gray-700 font-medium mb-1">无法预览此文档</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                登录账号后上传的文档支持在线预览。当前文件未存储到云端，艾莉丝仍可基于提取的文字进行讲解。
              </p>
            </div>
          </div>
        ) : (
          /* 没有任何文档 */
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-14 h-14 rounded-2xl bg-sakura/10 flex items-center justify-center">
              <Upload className="w-7 h-7 text-sakura/50" />
            </div>
            <div className="text-center max-w-xs px-6">
              <p className="text-sm text-gray-700 font-medium mb-1">还没有上传文档</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                返回目标详情页上传 PDF 或 Word 文档，艾莉丝就能边读边讲解。
              </p>
            </div>
            <button
              onClick={() => navigate('/goals')}
              className="mt-2 px-4 py-2 rounded-xl text-xs font-medium bg-sakura/15 text-sakura hover:bg-sakura/25 transition-colors"
            >
              返回上传文档
            </button>
          </div>
        )}
      </main>

      {/* ===== 艾莉丝桌宠浮窗（右下角） ===== */}
      <AlicePet
        messages={messages}
        isTyping={isLoading}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSend={handleSend}
        lectureModes={LECTURE_MODES}
        onLectureMode={handleLectureMode}
      />
    </div>
  )
}
