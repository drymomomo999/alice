/**
 * 艾莉丝聊天面板 — 右栏 AI 助手（升级版）
 *
 * 新增功能：
 * - 讲解模式（NotebookLM 风格）：4 种入口（概览/章节讲解/考点/举例）
 * - 速记卡功能：选中章节一键生成 Flashcard，支持翻牌
 * - 智能快捷菜单：替换原来的随机快捷提问按钮
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Sparkles, Loader2, Crown, BookOpen, Target, Lightbulb, HelpCircle, ChevronDown, X, RotateCcw, CheckCircle, XCircle, Paperclip } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { useUserStore, useGoalsStore, useAIChatStore } from '@/store'
import {
  sendAIMessage,
  buildGoalContextString,
  generateLecture,
  generateFlashcards,
  buildSourceDocuments,
  type LectureMode,
  type Flashcard,
} from '@/services/ai.service'
import type { Goal } from '@/types'
import AliceCharacter from '@/assets/alice-character.png'

// ============================================================
// 类型
// ============================================================
interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  timestamp: Date
  isLecture?: boolean   // 讲解模式消息标记
  images?: string[]     // base64 data URL 数组（多模态输入）
}

interface AliceChatPanelProps {
  selectedGoal: Goal | null
}

// 快捷菜单选项
interface QuickAction {
  id: LectureMode | 'flashcard'
  icon: React.ReactNode
  label: string
  description: string
  color: string
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'overview',
    icon: <BookOpen className="w-3.5 h-3.5" />,
    label: '讲解知识框架',
    description: '梳理整体脉络，建立知识体系',
    color: 'text-purple-500',
  },
  {
    id: 'chapter',
    icon: <Target className="w-3.5 h-3.5" />,
    label: '讲解当前章节',
    description: '深入解析选中的子目标内容',
    color: 'text-blue-500',
  },
  {
    id: 'keypoints',
    icon: <Sparkles className="w-3.5 h-3.5" />,
    label: '考试/核心重点',
    description: '提炼高频考点和核心知识',
    color: 'text-amber-500',
  },
  {
    id: 'example',
    icon: <Lightbulb className="w-3.5 h-3.5" />,
    label: '举一个实际例子',
    description: '用生活场景帮助理解抽象概念',
    color: 'text-green-500',
  },
  {
    id: 'quiz_prep',
    icon: <HelpCircle className="w-3.5 h-3.5" />,
    label: '来考考我',
    description: '通过提问检验理解，发现薄弱点',
    color: 'text-pink-500',
  },
  {
    id: 'flashcard',
    icon: <RotateCcw className="w-3.5 h-3.5" />,
    label: '生成速记卡',
    description: '一键生成可翻牌的知识速记卡',
    color: 'text-indigo-500',
  },
]

// 格式化时间
function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// ============================================================
// 速记卡组件
// ============================================================
function FlashcardViewer({ cards, onClose }: { cards: Flashcard[]; onClose: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [known, setKnown] = useState<Set<string>>(new Set())
  const [unknown, setUnknown] = useState<Set<string>>(new Set())

  const card = cards[currentIndex]
  const total = cards.length
  const knownCount = known.size
  const unknownCount = unknown.size

  const handleKnow = () => {
    setKnown(prev => new Set([...prev, card.id]))
    setUnknown(prev => { const s = new Set(prev); s.delete(card.id); return s })
    if (currentIndex < total - 1) { setCurrentIndex(i => i + 1); setIsFlipped(false) }
  }

  const handleUnknow = () => {
    setUnknown(prev => new Set([...prev, card.id]))
    setKnown(prev => { const s = new Set(prev); s.delete(card.id); return s })
    if (currentIndex < total - 1) { setCurrentIndex(i => i + 1); setIsFlipped(false) }
  }

  const difficultyColor = card.difficulty === 'easy' ? 'text-green-500' : card.difficulty === 'medium' ? 'text-amber-500' : 'text-red-500'
  const difficultyLabel = card.difficulty === 'easy' ? '基础' : card.difficulty === 'medium' ? '进阶' : '挑战'

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-sakura-light/20">
        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <RotateCcw className="w-3.5 h-3.5 text-indigo-500" />
          速记卡 {currentIndex + 1}/{total}
        </span>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-green-500 flex items-center gap-0.5"><CheckCircle className="w-3 h-3" />{knownCount}</span>
          <span className="text-red-400 flex items-center gap-0.5"><XCircle className="w-3 h-3" />{unknownCount}</span>
          <button onClick={onClose} className="p-0.5 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 卡片区域 */}
      <div className="flex-1 flex flex-col items-center justify-center p-3 gap-3">
        {/* 进度条 */}
        <div className="w-full h-1 bg-sakura-pale/40 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-sakura-pink to-peach-orange rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex) / total) * 100}%` }}
          />
        </div>

        {/* 难度标签 */}
        <div className={`text-[10px] font-medium ${difficultyColor}`}>{difficultyLabel}</div>

        {/* 卡片本体 */}
        <button
          onClick={() => setIsFlipped(f => !f)}
          className="w-full min-h-[100px] rounded-xl border border-sakura-light/30 bg-sakura-pale/20 hover:bg-sakura-pale/40 transition-all p-3 text-left cursor-pointer"
        >
          {!isFlipped ? (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">正面 · 点击翻转</p>
              <p className="text-xs font-medium text-foreground leading-relaxed">{card.front}</p>
            </div>
          ) : (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">背面 · 点击翻转</p>
              <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{card.back}</p>
            </div>
          )}
        </button>

        {/* 操作按钮 */}
        {isFlipped && currentIndex < total - 1 ? (
          <div className="flex gap-2 w-full">
            <button
              onClick={handleUnknow}
              className="flex-1 py-1.5 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 text-[11px] transition-all flex items-center justify-center gap-1"
            >
              <XCircle className="w-3 h-3" />还不会
            </button>
            <button
              onClick={handleKnow}
              className="flex-1 py-1.5 rounded-lg border border-green-200 text-green-500 hover:bg-green-50 text-[11px] transition-all flex items-center justify-center gap-1"
            >
              <CheckCircle className="w-3 h-3" />背熟了
            </button>
          </div>
        ) : isFlipped && currentIndex === total - 1 ? (
          <div className="flex gap-2 w-full">
            <button
              onClick={handleUnknow}
              className="flex-1 py-1.5 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 text-[11px] transition-all flex items-center justify-center gap-1"
            >
              <XCircle className="w-3 h-3" />还不会
            </button>
            <button
              onClick={handleKnow}
              className="flex-1 py-1.5 rounded-lg border border-green-200 text-green-500 hover:bg-green-50 text-[11px] transition-all flex items-center justify-center gap-1"
            >
              <CheckCircle className="w-3 h-3" />全部完成
            </button>
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">点击卡片查看答案</p>
        )}

        {/* 已完成提示 */}
        {currentIndex === total - 1 && (known.has(card.id) || unknown.has(card.id)) && (
          <div className="w-full p-2.5 rounded-lg bg-sakura-pale/30 text-center">
            <p className="text-[11px] text-foreground font-medium">全部 {total} 张卡片已复习 ✓</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              掌握 {knownCount} 张 · 需要复习 {unknownCount} 张
            </p>
            <button
              onClick={() => { setCurrentIndex(0); setIsFlipped(false); setKnown(new Set()); setUnknown(new Set()) }}
              className="mt-2 text-[11px] text-sakura hover:underline"
            >
              重新开始
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// 主组件
// ============================================================
export function AliceChatPanel({ selectedGoal }: AliceChatPanelProps) {
  const { user, isDemo } = useUserStore()
  const { goals } = useGoalsStore()
  const { addMessage, saveToDb } = useAIChatStore()

  // 聊天状态
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([
    {
      id: 'greeting',
      role: 'ai',
      content: '你好呀。选择一个目标吧，我会在这里陪着你完成的。🌸',
      timestamp: new Date(),
    },
  ])
  const [prevGoalId, setPrevGoalId] = useState<string | null>(null)

  // 快捷菜单
  const [showQuickMenu, setShowQuickMenu] = useState(false)

  // 速记卡模式
  const [flashcardMode, setFlashcardMode] = useState(false)
  const [flashcards, setFlashcards] = useState<Flashcard[]>([])
  const [isGeneratingCards, setIsGeneratingCards] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const quickMenuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 多模态输入：待发送的图片（base64 data URL）
  const [pendingImages, setPendingImages] = useState<string[]>([])

  // 自动滚动到底部
  useEffect(() => {
    if (!flashcardMode) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [localMessages, flashcardMode])

  // 点击外部关闭快捷菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (quickMenuRef.current && !quickMenuRef.current.contains(e.target as Node)) {
        setShowQuickMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 选中目标变化时，自动发送上下文消息
  useEffect(() => {
    if (!selectedGoal) return
    if (selectedGoal.id === prevGoalId) return
    setPrevGoalId(selectedGoal.id)
    setFlashcardMode(false)

    const hasDocs = selectedGoal.attachments?.some(a => a.type === 'document' && a.extractedText)
    const docHint = hasDocs
      ? '我已经读了你上传的文档，可以直接开始讲解。'
      : '如果你有教材PDF或文档，可以上传到目标详情中，我讲解时会引用具体内容。'

    const contextMsg: ChatMessage = {
      id: `context-${Date.now()}`,
      role: 'ai',
      content: `看来你正在执行「${selectedGoal.title}」（进度 ${selectedGoal.progress}%）。有什么需要我帮忙的吗？${docHint}\n\n你可以点下方的 ✨ 按钮，让我帮你讲解这门课的内容。`,
      timestamp: new Date(),
    }
    setLocalMessages(prev => [...prev, contextMsg])
  }, [selectedGoal, prevGoalId])

  // 连续讲解流检测 — 判断用户消息是否是在要求"继续/深入/换角度"
  const CONTINUE_PATTERNS = [
    '继续', '接着讲', '再深入', '再讲讲', '继续讲', '往下讲',
    '再详细一点', '展开说说', '详细讲讲', '多说一点',
    '换一个例子', '换个例子', '再举个例子', '还有呢',
    '没听懂', '没理解', '没搞懂', '再解释', '重新讲',
  ]

  const isContinueLecture = useCallback((text: string): boolean => {
    const trimmed = text.trim()
    return CONTINUE_PATTERNS.some(p => trimmed.includes(p))
  }, [])

  // 获取最近一条讲解消息（用于连续流衔接）
  const getLastLectureContent = useCallback((): string | null => {
    for (let i = localMessages.length - 1; i >= 0; i--) {
      const msg = localMessages[i]
      if (msg.role === 'ai' && msg.isLecture && msg.content.length > 20) {
        return msg.content
      }
    }
    return null
  }, [localMessages])

  // 获取当前目标的源文档
  const getSourceDocs = useCallback((): { goalContext: string; sourceDocs: ReturnType<typeof buildSourceDocuments> } => {
    if (!selectedGoal) return { goalContext: '', sourceDocs: [] }
    const goalContext = buildGoalContextString(selectedGoal)
    const sourceDocs = buildSourceDocuments(selectedGoal)
    return { goalContext, sourceDocs }
  }, [selectedGoal])

  // 多模态：处理图片上传
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return
      if (file.size > 5 * 1024 * 1024) {
        alert('图片大小不能超过 5MB')
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        setPendingImages(prev => [...prev, dataUrl])
      }
      reader.readAsDataURL(file)
    })
    // 清空 input，允许重复选择同一文件
    e.target.value = ''
  }, [])

  const removePendingImage = useCallback((idx: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== idx))
  }, [])

  // 发送普通消息
  const handleSend = useCallback(async (messageText?: string) => {
    const text = messageText || inputValue.trim()
    const images = [...pendingImages]
    // 没有文字且没有图片时，不发送
    if ((!text && images.length === 0) || isLoading) return

    setInputValue('')
    setPendingImages([])
    setIsLoading(true)
    setShowQuickMenu(false)

    // 构建 AI 可读的消息内容（图片以文字描述形式传入）
    const aiReadableContent = images.length > 0
      ? `${text}${text ? '\n' : ''}[用户分享了 ${images.length} 张图片]`
      : text

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text || '(分享图片)',
      timestamp: new Date(),
      images: images.length > 0 ? images : undefined,
    }
    setLocalMessages(prev => [...prev, userMsg])

    addMessage('alice', { content: aiReadableContent, isUser: true, characterId: 'alice' })
    if (user && !isDemo) saveToDb(user.id, 'alice', aiReadableContent, true)

    try {
      // === 连续讲解流检测 ===
      // 如果用户说"继续"/"再深入"等，且有最近的讲解记录，自动切换为连续讲解模式
      const lastLecture = getLastLectureContent()
      if (isContinueLecture(text) && lastLecture && selectedGoal) {
        const { goalContext, sourceDocs } = getSourceDocs()
        const focusedSubGoal = selectedGoal.subGoals?.find(sg => !sg.completed)

        const response = await generateLecture({
          goalTitle: selectedGoal.title,
          goalContext,
          subGoalTitle: focusedSubGoal?.title,
          mode: 'chapter',
          userName: user?.nickname || '你',
          priorExchange: lastLecture.slice(0, 1500),
          sourceDocuments: sourceDocs.length > 0 ? sourceDocs : undefined,
        })

        const aiMsg: ChatMessage = {
          id: `ai-lecture-${Date.now()}`,
          role: 'ai',
          content: response,
          timestamp: new Date(),
          isLecture: true,
        }
        setLocalMessages(prev => [...prev, aiMsg])
        addMessage('alice', { content: response, isUser: false, characterId: 'alice' })
        if (user && !isDemo) saveToDb(user.id, 'alice', response, false)
        return
      }

      // === 普通聊天模式 ===
      const activeGoals = goals.filter(g => g.status === 'active').map(g => g.title)
      const goalContext = selectedGoal
        ? `当前关注目标：${selectedGoal.title}（进度${selectedGoal.progress}%，${selectedGoal.status}）`
        : undefined
      const selectedGoalContext = selectedGoal ? buildGoalContextString(selectedGoal) : undefined

      const messageHistory = localMessages
        .filter(m => m.id !== 'greeting' && !m.id.startsWith('context-'))
        .slice(-20)
        .concat(userMsg)
        .map(m => ({
          id: m.id,
          characterId: 'alice' as const,
          content: m.images && m.images.length > 0
            ? `${m.content === '(分享图片)' ? '' : m.content + '\n'}[用户分享了 ${m.images.length} 张图片]`
            : m.content,
          timestamp: m.timestamp.toISOString(),
          isUser: m.role === 'user',
        }))

      const response = await sendAIMessage({
        characterId: 'alice',
        userId: user?.id || 'demo',
        userName: user?.nickname || '来访者',
        currentGoals: goalContext ? [goalContext, ...activeGoals] : activeGoals,
        selectedGoalContext,
        messageHistory,
      })

      const aiMsg: ChatMessage = { id: `ai-${Date.now()}`, role: 'ai', content: response, timestamp: new Date() }
      setLocalMessages(prev => [...prev, aiMsg])
      addMessage('alice', { content: response, isUser: false, characterId: 'alice' })
      if (user && !isDemo) saveToDb(user.id, 'alice', response, false)
    } catch {
      setLocalMessages(prev => [...prev, {
        id: `ai-err-${Date.now()}`,
        role: 'ai',
        content: '抱歉，通讯系统出了点小问题。请稍后再试呢。',
        timestamp: new Date(),
      }])
    } finally {
      setIsLoading(false)
    }
  }, [inputValue, isLoading, localMessages, goals, user, isDemo, selectedGoal, addMessage, saveToDb, isContinueLecture, getLastLectureContent, getSourceDocs, pendingImages])

  // 触发讲解模式
  const handleLecture = useCallback(async (mode: LectureMode) => {
    if (!selectedGoal || isLoading) return
    setShowQuickMenu(false)
    setIsLoading(true)
    setFlashcardMode(false)

    const modeLabels: Record<LectureMode, string> = {
      overview:   '帮我梳理一下整体的知识框架',
      chapter:    `讲解一下现在这个部分的内容`,
      keypoints:  '告诉我考试/核心重点有哪些',
      example:    '举一个具体的实际例子帮我理解',
      quiz_prep:  '来考考我，看看我有没有真的理解',
    }

    // 先显示用户"说了什么"
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: modeLabels[mode],
      timestamp: new Date(),
    }
    setLocalMessages(prev => [...prev, userMsg])

    try {
      const { goalContext, sourceDocs } = getSourceDocs()
      const focusedSubGoal = selectedGoal.subGoals?.find(sg => !sg.completed)
      const lastLecture = getLastLectureContent()

      const response = await generateLecture({
        goalTitle: selectedGoal.title,
        goalContext,
        subGoalTitle: focusedSubGoal?.title,
        mode,
        userName: user?.nickname || '你',
        priorExchange: lastLecture ? lastLecture.slice(0, 1500) : undefined,
        sourceDocuments: sourceDocs.length > 0 ? sourceDocs : undefined,
      })

      const aiMsg: ChatMessage = {
        id: `ai-lecture-${Date.now()}`,
        role: 'ai',
        content: response,
        timestamp: new Date(),
        isLecture: true,
      }
      setLocalMessages(prev => [...prev, aiMsg])
    } catch {
      setLocalMessages(prev => [...prev, {
        id: `ai-err-${Date.now()}`,
        role: 'ai',
        content: '讲解功能暂时不可用，请稍后再试。',
        timestamp: new Date(),
      }])
    } finally {
      setIsLoading(false)
    }
  }, [selectedGoal, isLoading, user, getSourceDocs, getLastLectureContent])

  // 触发速记卡生成
  const handleFlashcard = useCallback(async () => {
    if (!selectedGoal || isGeneratingCards) return
    setShowQuickMenu(false)
    setIsGeneratingCards(true)

    try {
      const focusedSubGoal = selectedGoal.subGoals?.find(sg => !sg.completed)
      const chapterTitle = focusedSubGoal?.title || selectedGoal.title

      // 尝试从附件中找到对应文本
      const chapterContent = selectedGoal.attachments
        ?.filter(a => a.type === 'document' && a.extractedText)
        .map(a => a.extractedText)
        .join('\n\n') || ''

      const cards = await generateFlashcards({
        goalTitle: selectedGoal.title,
        chapterTitle,
        chapterContent,
        count: 5,
      })

      setFlashcards(cards)
      setFlashcardMode(true)
    } catch {
      setLocalMessages(prev => [...prev, {
        id: `ai-err-${Date.now()}`,
        role: 'ai',
        content: '速记卡生成失败，请稍后再试。',
        timestamp: new Date(),
      }])
    } finally {
      setIsGeneratingCards(false)
    }
  }, [selectedGoal, isGeneratingCards])

  const handleQuickAction = useCallback((actionId: LectureMode | 'flashcard') => {
    if (actionId === 'flashcard') {
      handleFlashcard()
    } else {
      handleLecture(actionId as LectureMode)
    }
  }, [handleFlashcard, handleLecture])

  // Enter 发送
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const isAnyLoading = isLoading || isGeneratingCards

  return (
    <div className="w-72 shrink-0 rounded-2xl border border-sakura-light/30 bg-white/90 overflow-hidden shadow-sm flex flex-col">
      {/* ===== Header ===== */}
      <div className="p-3 border-b border-sakura-light/20 bg-gradient-to-r from-sakura-pale/30 to-lavender-light/20">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl overflow-hidden border-2 border-sakura-light/40 shadow-sm">
            <img src={AliceCharacter} alt="艾莉丝" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-foreground">艾莉丝</p>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              AI 学习伙伴
            </p>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-sakura-pale/40">
            <Crown className="w-3 h-3 text-sakura" />
            <span className="text-[9px] font-semibold text-sakura">深圳 · 小窝</span>
          </div>
        </div>
        {selectedGoal && (
          <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-sakura-pale/40 text-[10px] text-sakura truncate">
            📌 {selectedGoal.title}
          </div>
        )}
      </div>

      {/* ===== 内容区域（聊天 or 速记卡） ===== */}
      {flashcardMode && flashcards.length > 0 ? (
        <FlashcardViewer
          cards={flashcards}
          onClose={() => setFlashcardMode(false)}
        />
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-3">
            {localMessages.map((msg) => (
              <div key={msg.id}>
                {msg.role === 'ai' ? (
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full overflow-hidden border border-sakura-light/30 shrink-0 mt-0.5">
                      <img src={AliceCharacter} alt="艾莉丝" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`rounded-2xl rounded-tl-sm p-2.5 ${msg.isLecture ? 'bg-lavender-light/15 border border-lavender-light/30' : 'bg-sakura-pale/40'}`}>
                        {msg.isLecture && (
                          <div className="flex items-center gap-1 mb-1.5">
                            <BookOpen className="w-3 h-3 text-lavender" />
                            <span className="text-[9px] font-medium text-lavender">讲解模式</span>
                          </div>
                        )}
                        <MarkdownRenderer content={msg.content} className="text-xs text-foreground" />
                      </div>
                      <p className="text-[9px] text-muted-foreground/50 mt-0.5 ml-1">{formatTime(msg.timestamp)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <div className="max-w-[85%]">
                      <div className="bg-gradient-to-r from-sakura-pink to-peach-orange text-white rounded-2xl rounded-tr-sm p-2.5">
                        {msg.images && msg.images.length > 0 && (
                          <div className={`grid gap-1.5 mb-1.5 ${msg.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                            {msg.images.map((img, i) => (
                              <img
                                key={i}
                                src={img}
                                alt={`图片${i + 1}`}
                                className="rounded-lg max-h-32 w-full object-cover"
                              />
                            ))}
                          </div>
                        )}
                        {msg.content && msg.content !== '(分享图片)' && (
                          <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>
                      <p className="text-[9px] text-muted-foreground/50 mt-0.5 text-right mr-1">{formatTime(msg.timestamp)}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* 加载中动画 */}
            {isAnyLoading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full overflow-hidden border border-sakura-light/30 shrink-0">
                  <img src={AliceCharacter} alt="艾莉丝" className="w-full h-full object-cover" />
                </div>
                <div className="bg-sakura-pale/40 rounded-2xl rounded-tl-sm p-2.5">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-sakura-pink/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-sakura-pink/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-sakura-pink/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      )}

      {/* ===== 输入区 ===== */}
      <div className="p-3 border-t border-sakura-light/20 bg-white/60 relative">
        {/* 快捷菜单浮层 */}
        {showQuickMenu && selectedGoal && (
          <div
            ref={quickMenuRef}
            className="absolute bottom-full left-3 right-3 mb-1 bg-white rounded-xl border border-sakura-light/30 shadow-lg overflow-hidden z-10"
          >
            <div className="px-3 py-2 border-b border-sakura-light/15">
              <p className="text-[10px] font-medium text-muted-foreground">选择讲解方式</p>
            </div>
            {QUICK_ACTIONS.map(action => (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action.id)}
                disabled={isAnyLoading}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-sakura-pale/20 transition-all disabled:opacity-40 text-left"
              >
                <span className={action.color}>{action.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-foreground">{action.label}</p>
                  <p className="text-[9px] text-muted-foreground truncate">{action.description}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 图片预览区 */}
        {pendingImages.length > 0 && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {pendingImages.map((img, idx) => (
              <div key={idx} className="relative group">
                <img src={img} alt={`预览${idx + 1}`} className="w-14 h-14 rounded-lg object-cover border border-sakura-light/30" />
                <button
                  onClick={() => removePendingImage(idx)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-90 hover:opacity-100"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 隐藏的文件输入 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          className="hidden"
        />

        <div className="flex items-center gap-2">
          {/* 快捷菜单触发按钮 */}
          {selectedGoal && (
            <button
              onClick={() => setShowQuickMenu(v => !v)}
              disabled={isAnyLoading}
              className={`shrink-0 p-2 rounded-xl transition-all disabled:opacity-40 flex items-center gap-0.5 ${showQuickMenu ? 'bg-lavender-light/40 text-lavender' : 'bg-lavender-light/20 text-lavender hover:bg-lavender-light/40'}`}
              title="讲解模式"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <ChevronDown className={`w-2.5 h-2.5 transition-transform ${showQuickMenu ? 'rotate-180' : ''}`} />
            </button>
          )}

          {/* 图片上传按钮 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isAnyLoading}
            className="shrink-0 p-2 rounded-xl bg-sakura-pale/20 text-sakura-pink hover:bg-sakura-pale/40 transition-all disabled:opacity-40"
            title="上传图片"
          >
            <Paperclip className="w-3.5 h-3.5" />
          </button>

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedGoal ? `问艾莉丝关于"${selectedGoal.title}"...` : '与艾莉丝交谈...'}
            disabled={isAnyLoading}
            className="flex-1 px-3 py-2 text-xs rounded-xl bg-sakura-pale/20 border border-sakura-light/30 placeholder:text-muted-foreground/50 focus:border-sakura-pink focus:outline-none focus:ring-1 focus:ring-sakura-pink/20 transition-all"
          />
          <button
            onClick={() => handleSend()}
            disabled={isAnyLoading || (!inputValue.trim() && pendingImages.length === 0)}
            className="shrink-0 p-2 rounded-xl bg-gradient-to-r from-sakura-pink to-peach-orange text-white disabled:opacity-40 transition-all"
          >
            {isAnyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}
