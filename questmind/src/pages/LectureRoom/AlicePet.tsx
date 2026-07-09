import { useState, useCallback, useRef, useEffect } from 'react'
import { ChevronDown, ChevronUp, Send, Sparkles, Loader2 } from 'lucide-react'
import { useTypewriter } from '@/hooks/useTypewriter'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import {
  inferExpressionFromReply,
  getExpressionImages,
  EXPRESSION_RESET_DELAY,
  type AliceExpression,
} from '@/assets/alice'

export interface PetMessage {
  id: string
  role: 'user' | 'alice'
  content: string
  isLecture?: boolean
}

interface AlicePetProps {
  messages: PetMessage[]
  isTyping: boolean
  inputValue: string
  onInputChange: (v: string) => void
  onSend: () => void
  lectureModes?: { key: string; label: string; icon: string }[]
  onLectureMode?: (key: string) => void
}

/**
 * 右下角桌宠浮窗
 * 小头像 + 气泡对话 + 输入框，可收起/展开
 */
export function AlicePet({
  messages,
  isTyping,
  inputValue,
  onInputChange,
  onSend,
  lectureModes,
  onLectureMode,
}: AlicePetProps) {
  const [expanded, setExpanded] = useState(true)
  const [showMenu, setShowMenu] = useState(false)

  // 表情系统
  const [expression, setExpression] = useState<AliceExpression | null>(null)
  const expressionTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const exprImages = getExpressionImages()

  // 获取最新 AI 消息用于打字机和表情
  const latestAIMsg = messages.length > 0 && messages[messages.length - 1].role === 'alice'
    ? messages[messages.length - 1]
    : null

  // 打字机效果
  const { displayText, isComplete: typingDone, isTyping: isTypewriting, skip } = useTypewriter({
    text: latestAIMsg?.content || '',
    speed: 35,
    punctuationPause: 100,
  })

  // 收起/展开时停止打字机
  const handleToggle = useCallback(() => {
    if (expanded && !typingDone && isTypewriting) skip()
    setExpanded(v => !v)
    setShowMenu(false)
  }, [expanded, typingDone, isTypewriting, skip])

  // AI 回复完成时推断表情
  useEffect(() => {
    if (latestAIMsg && typingDone) {
      const inferred = inferExpressionFromReply(latestAIMsg.content)
      setExpression(inferred)

      if (expressionTimer.current) clearTimeout(expressionTimer.current)
      expressionTimer.current = setTimeout(() => setExpression(null), EXPRESSION_RESET_DELAY)
    }
  }, [latestAIMsg, typingDone])

  // 发送时切到 thinking 表情
  const handleSend = useCallback(() => {
    if (isTyping) return
    setExpression('thinking')
    onSend()
  }, [isTyping, onSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // 渲染头像
  const avatarSrc = expression ? exprImages[expression] : '/alice-character.png'

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {/* === 展开状态：气泡 + 菜单 + 输入框 === */}
      {expanded && (
        <div className="w-80 flex flex-col gap-2 animate-in slide-in-from-bottom-2 duration-200">
          {/* 消息列表 */}
          <div className="max-h-48 overflow-y-auto rounded-xl bg-white/90 backdrop-blur-md border border-sakura/20 p-3 space-y-2 shadow-lg">
            {messages.length === 0 && !isTyping && (
              <p className="text-[11px] text-muted-foreground italic">你可以问我关于这篇文档的任何问题~</p>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={msg.role === 'user' ? 'flex justify-end' : ''}>
                {msg.role === 'alice' && (
                  <div className="text-[11px] leading-relaxed text-foreground/85 bg-sakura/10 rounded-lg px-2.5 py-1.5">
                    <MarkdownRenderer content={msg.content} className="text-[11px]" />
                  </div>
                )}
                {msg.role === 'user' && (
                  <div className="text-[11px] leading-relaxed text-foreground bg-lavender/15 rounded-lg px-2.5 py-1.5 max-w-[80%]">
                    {msg.content}
                  </div>
                )}
              </div>
            ))}
            {/* AI 正在回复（加载态） */}
            {isTyping && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin text-sakura" />
                艾莉丝正在思考...
              </div>
            )}
            {/* 打字机效果（最新消息 = AI 且正在打字中） */}
            {isTypewriting && !isTyping && latestAIMsg && (
              <div className="text-[11px] leading-relaxed text-foreground/85 bg-sakura/10 rounded-lg px-2.5 py-1.5">
                {displayText}
                <span className="inline-block w-0.5 h-3 bg-sakura/60 ml-0.5 animate-pulse" />
              </div>
            )}
          </div>

          {/* 输入框 */}
          <div className="flex items-center gap-1.5">
            {lectureModes && (
              <button
                onClick={() => setShowMenu(v => !v)}
                className="shrink-0 w-7 h-7 rounded-lg bg-sakura/15 hover:bg-sakura/25 flex items-center justify-center transition-colors"
                title="讲解菜单"
              >
                <Sparkles className="w-3.5 h-3.5 text-sakura" />
              </button>
            )}
            <input
              value={inputValue}
              onChange={e => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="继续问艾莉丝..."
              className="flex-1 h-8 text-xs rounded-lg bg-white/90 border border-sakura/15 px-2.5 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-sakura/30"
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isTyping}
              className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-sakura to-sakura-dark flex items-center justify-center disabled:opacity-40 transition-opacity"
            >
              <Send className="w-3.5 h-3.5 text-white" />
            </button>
          </div>

          {/* 讲解菜单下拉 */}
          {showMenu && lectureModes && (
            <div className="rounded-xl bg-white/95 backdrop-blur-md border border-sakura/15 p-1 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
              {lectureModes.map(mode => (
                <button
                  key={mode.key}
                  onClick={() => {
                    onLectureMode?.(mode.key)
                    setShowMenu(false)
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-foreground/80 hover:bg-sakura/10 rounded-lg transition-colors"
                >
                  <span>{mode.icon}</span>
                  <span>{mode.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* === 头像按钮（始终可见） === */}
      <button
        onClick={handleToggle}
        className="shrink-0 relative group"
      >
        {/* 未读提示 */}
        {!expanded && messages.length > 0 && messages[messages.length - 1].role === 'alice' && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-sakura rounded-full flex items-center justify-center">
            <span className="text-[8px] text-white font-bold">!</span>
          </div>
        )}

        <img
          src={avatarSrc}
          alt="艾莉丝"
          className={`w-14 h-14 rounded-full border-2 border-sakura/40 shadow-lg object-cover transition-all group-hover:scale-105 group-hover:border-sakura/60 ${
            expression ? 'ring-2 ring-sakura/20' : ''
          }`}
        />

        {/* 收起/展开图标 */}
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white border border-sakura/20 flex items-center justify-center shadow">
          {expanded
            ? <ChevronDown className="w-3 h-3 text-sakura" />
            : <ChevronUp className="w-3 h-3 text-sakura" />
          }
        </div>
      </button>
    </div>
  )
}
