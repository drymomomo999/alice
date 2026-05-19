/**
 * 艾莉丝聊天面板 — 右栏 AI 助手
 *
 * 替换原来的静态展示面板，提供交互式聊天功能。
 * 选中目标时自动发送上下文消息，用户可自由追问。
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Sparkles, Loader2, Crown } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useUserStore, useGoalsStore, useAIChatStore } from '@/store'
import { sendAIMessage, buildGoalContextString } from '@/services/ai.service'
import type { Goal, AIMessage } from '@/types'
import AliceCharacter from '@/assets/alice-character.png'

// ============================================================
// 类型
// ============================================================
interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  timestamp: Date
}

interface AliceChatPanelProps {
  selectedGoal: Goal | null
}

// 预设快捷提问
const QUICK_QUESTIONS = [
  '给我一些关于这个目标的学习建议',
  '今天的学习重点是什么？',
  '有什么高效的学习方法推荐？',
  '帮我梳理一下这个目标的知识框架',
]

// 格式化时间
function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// ============================================================
// 组件
// ============================================================
export function AliceChatPanel({ selectedGoal }: AliceChatPanelProps) {
  const { user, isDemo } = useUserStore()
  const { goals } = useGoalsStore()
  const { messages: aiMessages, addMessage, saveToDb } = useAIChatStore()

  // 聊天状态
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([
    {
      id: 'greeting',
      role: 'ai',
      content: '欢迎来到我们的领地。选择一个目标，我会全程陪伴你完成的。🌹',
      timestamp: new Date(),
    },
  ])
  const [prevGoalId, setPrevGoalId] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [localMessages])

  // 选中目标变化时，自动发送上下文消息
  useEffect(() => {
    if (!selectedGoal) return
    if (selectedGoal.id === prevGoalId) return
    setPrevGoalId(selectedGoal.id)

    const contextMsg: ChatMessage = {
      id: `context-${Date.now()}`,
      role: 'ai',
      content: `看来你正在执行「${selectedGoal.title}」（进度 ${selectedGoal.progress}%）。有什么需要我帮忙的吗？✨`,
      timestamp: new Date(),
    }
    setLocalMessages(prev => [...prev, contextMsg])
  }, [selectedGoal, prevGoalId])

  // 发送消息
  const handleSend = useCallback(async (messageText?: string) => {
    const text = messageText || inputValue.trim()
    if (!text || isLoading) return

    setInputValue('')
    setIsLoading(true)

    // 添加用户消息
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    }
    setLocalMessages(prev => [...prev, userMsg])

    // 保存到 store 和数据库
    addMessage('alice', { content: text, isUser: true, characterId: 'alice' })
    if (user && !isDemo) {
      saveToDb(user.id, 'alice', text, true)
    }

    try {
      const activeGoals = goals.filter(g => g.status === 'active').map(g => g.title)
      // 将选中目标信息作为额外上下文注入
      const goalContext = selectedGoal
        ? `当前关注目标：${selectedGoal.title}（进度${selectedGoal.progress}%，${selectedGoal.status}）`
        : undefined

      // 构建目标的详细上下文（description + context + 附件文字）
      const selectedGoalContext = selectedGoal
        ? buildGoalContextString(selectedGoal)
        : undefined

      // 构建消息历史
      const messageHistory = localMessages
        .filter(m => m.id !== 'greeting' && !m.id.startsWith('context-'))
        .slice(-10)
        .concat(userMsg)
        .map(m => ({
          id: m.id,
          characterId: 'alice' as const,
          content: m.content,
          timestamp: m.timestamp.toISOString(),
          isUser: m.role === 'user',
        }))

      const response = await sendAIMessage({
        characterId: 'alice',
        userId: user?.id || 'demo',
        userName: user?.nickname || '来访者',
        userLevel: Math.floor((user?.coins || 0) / 100) + 1,
        userStreak: user?.streak || 0,
        currentGoals: goalContext ? [goalContext, ...activeGoals] : activeGoals,
        selectedGoalContext,
        messageHistory,
      })

      // 添加 AI 回复
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: response,
        timestamp: new Date(),
      }
      setLocalMessages(prev => [...prev, aiMsg])

      // 保存到 store 和数据库
      addMessage('alice', { content: response, isUser: false, characterId: 'alice' })
      if (user && !isDemo) {
        saveToDb(user.id, 'alice', response, false)
      }
    } catch {
      const errMsg: ChatMessage = {
        id: `ai-err-${Date.now()}`,
        role: 'ai',
        content: '抱歉，领地的通讯系统出现了些许异常。请稍后再试。',
        timestamp: new Date(),
      }
      setLocalMessages(prev => [...prev, errMsg])
    } finally {
      setIsLoading(false)
    }
  }, [inputValue, isLoading, localMessages, goals, user, isDemo, selectedGoal, addMessage, saveToDb])

  // 快捷提问
  const handleQuickAsk = useCallback(() => {
    if (!selectedGoal || isLoading) return
    const question = QUICK_QUESTIONS[Math.floor(Math.random() * QUICK_QUESTIONS.length)]
    handleSend(question)
  }, [selectedGoal, isLoading, handleSend])

  // Enter 发送
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

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
            <span className="text-[9px] font-semibold text-sakura">克伦威尔领地</span>
          </div>
        </div>
        {selectedGoal && (
          <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-sakura-pale/40 text-[10px] text-sakura truncate">
            📌 关注：{selectedGoal.title}
          </div>
        )}
      </div>

      {/* ===== Messages ===== */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {localMessages.map((msg) => (
            <div key={msg.id}>
              {msg.role === 'ai' ? (
                // AI 消息 - 左对齐
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full overflow-hidden border border-sakura-light/30 shrink-0 mt-0.5">
                    <img src={AliceCharacter} alt="艾莉丝" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="bg-sakura-pale/40 rounded-2xl rounded-tl-sm p-2.5">
                      <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <p className="text-[9px] text-muted-foreground/50 mt-0.5 ml-1">{formatTime(msg.timestamp)}</p>
                  </div>
                </div>
              ) : (
                // 用户消息 - 右对齐
                <div className="flex justify-end">
                  <div className="max-w-[85%]">
                    <div className="bg-gradient-to-r from-sakura-pink to-peach-orange text-white rounded-2xl rounded-tr-sm p-2.5">
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <p className="text-[9px] text-muted-foreground/50 mt-0.5 text-right mr-1">{formatTime(msg.timestamp)}</p>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* 加载中动画 */}
          {isLoading && (
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

      {/* ===== Input ===== */}
      <div className="p-3 border-t border-sakura-light/20 bg-white/60">
        <div className="flex items-center gap-2">
          {/* 快捷提问按钮 */}
          {selectedGoal && (
            <button
              onClick={handleQuickAsk}
              disabled={isLoading}
              className="shrink-0 p-2 rounded-xl bg-lavender-light/20 text-lavender hover:bg-lavender-light/40 disabled:opacity-40 transition-all"
              title="AI 学习建议"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedGoal ? `问艾莉丝关于"${selectedGoal.title}"的问题...` : '与艾莉丝交谈...'}
            disabled={isLoading}
            className="flex-1 px-3 py-2 text-xs rounded-xl bg-sakura-pale/20 border border-sakura-light/30 placeholder:text-muted-foreground/50 focus:border-sakura-pink focus:outline-none focus:ring-1 focus:ring-sakura-pink/20 transition-all"
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !inputValue.trim()}
            className="shrink-0 p-2 rounded-xl bg-gradient-to-r from-sakura-pink to-peach-orange text-white disabled:opacity-40 transition-all"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}
