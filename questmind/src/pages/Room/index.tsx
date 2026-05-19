import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { History, X, Crown, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { RoomBackground } from '@/components/AliceRoom/RoomBackground'
import { CharacterSprite } from '@/components/AliceRoom/CharacterSprite'
import { DialogBox } from '@/components/AliceRoom/DialogBox'
import { ChatInput } from '@/components/AliceRoom/ChatInput'
import { sendAIMessage } from '@/services/ai.service'
import { useUserStore, useGoalsStore } from '@/store'
import {
  type AliceExpression,
  ALICE_EXPRESSIONS,
  getExpressionImages,
  inferExpressionFromReply,
  EXPRESSION_RESET_DELAY,
} from '@/assets/alice'
import AliceCharacter from '@/assets/alice-character.png'

// 对话消息类型
interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  timestamp: Date
  expression?: AliceExpression | null
}

// 初始问候消息
const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'greeting',
    role: 'ai',
    content: '欢迎来到我的领地。无论您带来了什么困惑，这里都有属于它的秩序。🌹',
    timestamp: new Date(),
    expression: 'proud',
  },
]

export function RoomPage() {
  const navigate = useNavigate()
  const { user } = useUserStore()
  const { goals } = useGoalsStore()

  // 对话状态
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES)
  const [currentExpression, setCurrentExpression] = useState<AliceExpression | null>('proud')
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)

  // 当前显示的对话（打字机用的文本）
  const [activeDialogText, setActiveDialogText] = useState(INITIAL_MESSAGES[0].content)

  // 历史面板
  const [showHistory, setShowHistory] = useState(false)

  // 表情自动恢复
  const expressionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 清理表情恢复计时器
  useEffect(() => {
    return () => {
      if (expressionTimerRef.current) {
        clearTimeout(expressionTimerRef.current)
      }
    }
  }, [])

  // 切换表情并设置自动恢复
  const setExpressionWithReset = useCallback((expr: AliceExpression | null) => {
    setCurrentExpression(expr)
    if (expressionTimerRef.current) {
      clearTimeout(expressionTimerRef.current)
    }
    if (expr) {
      expressionTimerRef.current = setTimeout(() => {
        setCurrentExpression(null)
      }, EXPRESSION_RESET_DELAY)
    }
  }, [])

  // 打字机完成回调
  const handleTextComplete = useCallback(() => {
    setIsSpeaking(false)
  }, [])

  // 点击立绘跳过打字机
  const handleSpriteClick = useCallback(() => {
    setIsSpeaking(false)
  }, [])

  // 获取表情图片（用于历史面板）
  const expressionImages = getExpressionImages()

  // 获取小头像图片
  const getAvatarSrc = (expression: AliceExpression | null | undefined): string => {
    if (!expression) return AliceCharacter
    return expressionImages[expression] || AliceCharacter
  }

  // 发送消息
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage = inputValue.trim()
    setInputValue('')
    setIsLoading(true)
    setIsSpeaking(true)

    // 艾莉丝切换到思考表情
    setExpressionWithReset('thinking')

    // 添加用户消息
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])

    try {
      const activeGoals = goals.filter(g => g.status === 'active').map(g => g.title)
      // 包含当前用户消息的历史，确保 AI 能看到本次输入
      const historyWithCurrent = [
        ...messages.filter(m => m.id !== 'greeting'),
        userMsg,
      ].slice(-11)
      const response = await sendAIMessage({
        characterId: 'alice',
        userId: user?.id || 'demo',
        userName: user?.nickname || '来访者',
        userLevel: Math.floor((user?.coins || 0) / 100) + 1,
        userStreak: user?.streak || 0,
        currentGoals: activeGoals,
        messageHistory: historyWithCurrent.map(m => ({
          id: m.id,
          characterId: 'alice' as const,
          content: m.content,
          timestamp: m.timestamp.toISOString(),
          isUser: m.role === 'user',
        })),
      })

      // 根据 AI 回复推断表情
      const inferredExpression = inferExpressionFromReply(response)
      setExpressionWithReset(inferredExpression)

      // 添加 AI 回复消息
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: response,
        timestamp: new Date(),
        expression: inferredExpression,
      }
      setMessages(prev => [...prev, aiMsg])

      // 设置打字机文本
      setActiveDialogText(response)
      setIsSpeaking(true)
    } catch {
      const aiMsg: ChatMessage = {
        id: `ai-err-${Date.now()}`,
        role: 'ai',
        content: '抱歉，领地的通讯系统出现了些许异常。请稍后再试。',
        timestamp: new Date(),
        expression: 'sad',
      }
      setMessages(prev => [...prev, aiMsg])
      setActiveDialogText(aiMsg.content)
      setExpressionWithReset('sad')
      setIsSpeaking(true)
    } finally {
      setIsLoading(false)
    }
  }, [inputValue, isLoading, messages, goals, user, setExpressionWithReset])

  // 加载中的等待文本
  const loadingDialogText = isLoading
    ? '...'
    : activeDialogText

  return createPortal(
    <div className="fixed inset-0 overflow-hidden z-[60]">
      {/* 背景层 — pointer-events-none 防止拦截点击 */}
      <RoomBackground />

      {/* 角色立绘 */}
      <CharacterSprite
        expression={currentExpression}
        isSpeaking={isSpeaking}
        onClick={handleSpriteClick}
      />

      {/* 表情标签 - 角色旁边浮动 */}
      <AnimatePresence>
        {currentExpression && ALICE_EXPRESSIONS[currentExpression] && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.8 }}
            className="absolute z-20 left-1/2 -translate-x-1/2"
            style={{
              bottom: 'calc(22% + 62vh)',
            }}
          >
            <span className="text-xs bg-white/80 backdrop-blur-sm rounded-full px-2.5 py-1 shadow-md border border-pink-200/40">
              {ALICE_EXPRESSIONS[currentExpression].emoji} {ALICE_EXPRESSIONS[currentExpression].label}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 左上角 - 返回按钮 */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-4 left-4 z-30 flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/70 backdrop-blur-sm shadow-sm border border-pink-200/30 hover:bg-white/90 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 text-pink-600" />
        <span className="text-xs font-medium text-pink-700">返回</span>
      </button>

      {/* 右上角 - 历史按钮 & 皇冠标识 */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/70 backdrop-blur-sm shadow-sm border border-pink-200/30">
          <Crown className="w-4 h-4 text-pink-400" />
          <span className="text-xs font-semibold text-pink-700">克伦威尔领地</span>
        </div>
        <button
          onClick={() => setShowHistory(true)}
          className="p-2 rounded-full bg-white/70 backdrop-blur-sm shadow-sm border border-pink-200/30 hover:bg-white/90 transition-colors"
        >
          <History className="w-4 h-4 text-pink-600" />
        </button>
      </div>

      {/* 底部对话框区域 — pointer-events-auto 确保可交互 */}
      <div className="absolute left-0 right-0 z-20 flex flex-col items-center gap-3 pointer-events-auto"
        style={{ bottom: '6%' }}
      >
        {/* 对话框 */}
        <DialogBox
          text={loadingDialogText}
          expression={currentExpression}
          isTyping={isSpeaking || isLoading}
          onSkip={() => setIsSpeaking(false)}
          onTextComplete={handleTextComplete}
        />

        {/* 输入区域 */}
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          disabled={isLoading}
          placeholder="与艾莉丝交谈..."
        />
      </div>

      {/* 对话历史面板 */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
            onClick={() => setShowHistory(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-md max-h-[70vh] mx-4 rounded-2xl overflow-hidden shadow-2xl"
              style={{
                background: 'rgba(255, 250, 247, 0.95)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(220, 170, 150, 0.2)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 历史面板标题 */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-pink-100/50">
                <h3 className="text-sm font-bold text-pink-800">对话记录</h3>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-1.5 rounded-lg hover:bg-pink-50 transition-colors"
                >
                  <X className="w-4 h-4 text-pink-400" />
                </button>
              </div>

              {/* 历史消息列表 */}
              <div className="overflow-y-auto max-h-[55vh] p-4 space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    {msg.role === 'ai' && (
                      <div className="w-7 h-7 rounded-full overflow-hidden border border-pink-300/30 shrink-0">
                        <img
                          src={getAvatarSrc(msg.expression)}
                          alt="艾莉丝"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div
                      className={`max-w-[75%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                        msg.role === 'ai'
                          ? 'bg-pink-50/80 text-pink-900/80 rounded-tl-sm'
                          : 'bg-gradient-to-r from-pink-400 to-pink-500 text-white rounded-tr-sm'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {messages.length <= 1 && (
                  <div className="text-center py-8 text-pink-300/60 text-sm">
                    还没有更多对话记录
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  )
}
