import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  History,
  X,
  Crown,
  ArrowLeft,
  Trash2,
  BookOpen,
  NotebookPen,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { RoomBackground } from '@/components/AliceRoom/RoomBackground'
import { CharacterSprite } from '@/components/AliceRoom/CharacterSprite'
import { DialogBox } from '@/components/AliceRoom/DialogBox'
import { ChatInput } from '@/components/AliceRoom/ChatInput'
import { callDeepSeekAPI, sendAIMessage, stripDialogueTimePrefix } from '@/services/ai.service'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { useUserStore, useAIChatStore } from '@/store'
import { formatLastVisit } from '@/services/alice.service'
import {
  buildAliceContext,
  decideAliceAction,
  serializeAliceRuntimeContext,
  updateConversationState,
} from '@/services/aliceDialogue.service'
import { useAliceVoice } from '@/hooks/useAliceVoice'
import { ProfilePanel } from './ProfilePanel'
import { VoiceSettingsPanel } from './VoiceSettingsPanel'
import { DiaryPanel } from './DiaryPanel'
import {
  loadProfile,
  saveProfile,
  shouldAnalyze,
  analyzeConversation,
  buildRoomPromptFromProfile,
  type AliceProfile,
} from '@/services/aliceProfile.service'
import {
  type AliceExpression,
  ALICE_EXPRESSIONS,
  getExpressionImages,
  inferExpressionFromReply,
  EXPRESSION_RESET_DELAY,
} from '@/assets/alice'
import AliceCharacter from '@/assets/alice-character.png'
import type { AIMessage } from '@/types'
import {
  recordRelationshipResponse,
  recordRelationshipUserMessage,
  seedRelationshipFromLegacyProfile,
} from '@/services/aliceRelationship.service'
import {
  hydrateRelationshipStoreFromCloud,
  syncRelationshipStoreToCloud,
} from '@/services/aliceRelationshipCloud.service'
import {
  buildDiaryFallback,
  buildDiaryPrompt,
  buildShareRuntimePrompt,
  recordSharedStory,
  recordShareReaction,
  shouldWriteAliceDiary,
  upsertDiaryEntry,
} from '@/services/aliceLife.service'
import {
  hydrateAliceLifeFromCloud,
  prepareAliceShare,
  syncAliceLifeToCloud,
} from '@/services/aliceLifeCloud.service'

// 生成智能问候语（根据历史和上次来访时间）
function buildGreeting(
  userName: string,
  lastVisitInfo?: string,
  hasHistory?: boolean
): string {
  const hour = new Date().getHours()
  const isLate = hour >= 22 || hour < 6
  const isMorning = hour >= 6 && hour < 10

  // 久违回来
  if (lastVisitInfo && !lastVisitInfo.includes('今天')) {
    const variants = [
      `${lastVisitInfo}没见。最近还好吗？🌸`,
      `你来啦。最近过得怎么样？`,
      `${lastVisitInfo}没见了，正好想听听你的近况。☕`,
    ]
    return variants[Math.floor(Math.random() * variants.length)]
  }

  // 今天已经聊过了
  if (lastVisitInfo?.includes('今天') && hasHistory) {
    const variants = [
      `又来了。今天心情还好吗？`,
      `嗯，又见面了。有什么想说的吗？`,
      `回来啦。今天还好吧？`,
    ]
    return variants[Math.floor(Math.random() * variants.length)]
  }

  // 第一次 or 很久没来
  if (isLate) {
    return `这么晚了还没睡。我在呢，慢慢来，想说什么就说。🌙`
  }
  if (isMorning) {
    return `早呀，${userName}。新的一天开始了，先来跟我说说话吧。`
  }

  const defaults = [
    `你来啦。我刚把桌边收拾好，正适合安安静静聊一会儿。最近过得怎么样？🌸`,
    `嗯，来了。我刚好在这里。最近过得怎么样？`,
    `你来了。我正想着今天会不会听到一点新鲜事。有什么想聊的吗？`,
  ]
  return defaults[Math.floor(Math.random() * defaults.length)]
}

export function RoomPage() {
  const navigate = useNavigate()
  const { user, isDemo } = useUserStore()
  const {
    messages: allMessages,
    addMessage,
    saveToDb,
    clearMessages,
    markVisit,
    lastVisit,
  } = useAIChatStore()

  // 从 store 取 alice 的历史消息
  const persistedMessages = useMemo(
    () => (allMessages['alice'] || []).filter(message => message.scene === 'HOME'),
    [allMessages]
  )

  // 上次访问时间
  const lastVisitTimestamp = lastVisit['alice']
  const lastVisitInfo = useMemo(() => formatLastVisit(lastVisitTimestamp), [lastVisitTimestamp])

  // 动态人物档案（从 localStorage 加载）
  const [profile, setProfile] = useState<AliceProfile>(() => loadProfile())
  const [showProfilePanel, setShowProfilePanel] = useState(false)
  const [showVoiceSettings, setShowVoiceSettings] = useState(false)
  const [showDiary, setShowDiary] = useState(false)

  useEffect(() => {
    const userId = user?.id || 'demo'
    if (user && !isDemo) {
      void hydrateRelationshipStoreFromCloud(userId).then(() => {
        const seeded = seedRelationshipFromLegacyProfile(userId, profile)
        void syncRelationshipStoreToCloud(seeded)
      })
      return
    }
    seedRelationshipFromLegacyProfile(userId, profile)
  }, [profile, user, isDemo])

  useEffect(() => {
    if (user && !isDemo) void hydrateAliceLifeFromCloud(user.id)
  }, [user, isDemo])

  // 构建初始问候（只在组件挂载时确定一次）
  const initialGreeting = useMemo(() => {
    const userName = user?.nickname || '朋友'
    return buildGreeting(
      userName,
      lastVisitInfo,
      persistedMessages.length > 0
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 只在挂载时确定一次

  // 对话状态
  const [currentExpression, setCurrentExpression] = useState<AliceExpression | null>('proud')
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(true)
  const {
    enabled: voiceEnabled,
    isSpeaking: isVoiceSpeaking,
    isDesigning: isVoiceDesigning,
    supported: voiceSupported,
    source: voiceSource,
    lastError: voiceError,
    settings: voiceSettings,
    setEnabled: setVoiceEnabled,
    updateSettings: updateVoiceSettings,
    resetSettings: resetVoiceSettings,
    previewCustomVoice,
    speak: speakAsAlice,
    cancel: cancelAliceVoice,
  } = useAliceVoice()

  // 当前对话框显示文本（打字机效果用）
  const [activeDialogText, setActiveDialogText] = useState(initialGreeting)

  // 历史面板
  const [showHistory, setShowHistory] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // 表情自动恢复计时器
  const expressionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 标记本次访问
  useEffect(() => {
    markVisit('alice')
    // 打字机开始播放初始问候
    const greetingTimer = setTimeout(() => {
      speakAsAlice(initialGreeting, 'proud')
    }, 450)
    return () => clearTimeout(greetingTimer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 清理计时器
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
    cancelAliceVoice()
  }, [cancelAliceVoice])

  // 表情图片（用于历史面板头像）
  const expressionImages = getExpressionImages()

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
    setExpressionWithReset('thinking')

    // 把用户消息写入持久化 store
    const userMsg: Omit<AIMessage, 'id' | 'timestamp'> = {
      characterId: 'alice',
      content: userMessage,
      isUser: true,
      scene: 'HOME',
    }
    addMessage('alice', userMsg)
    if (user && !isDemo) saveToDb(user.id, 'alice', userMessage, true, 'HOME')

    try {
      const userId = user?.id || 'demo'
      const lifeAfterReaction = recordShareReaction(userId, userMessage)
      void syncAliceLifeToCloud(lifeAfterReaction)
      const relationshipStore = recordRelationshipUserMessage({
        userId,
        scene: 'HOME',
        message: userMessage,
      })
      void syncRelationshipStoreToCloud(relationshipStore)

      // 构建发给 AI 的历史（用最新的 store 数据，不包含刚刚加进去的那条，手动附加）
      const currentHistory: AIMessage[] = [
        ...persistedMessages,
        { ...userMsg, id: `u-tmp-${Date.now()}`, timestamp: new Date().toISOString() }
      ]

      // 从档案构建系统提示词（包含性格、说话方式、AI分析的隐藏洞察）
      const systemPrompt = buildRoomPromptFromProfile(
        profile,
        user?.nickname || '朋友',
        lastVisitInfo || undefined
      )

      const aliceContext = buildAliceContext({
        scene: 'HOME',
        user: { id: user?.id || 'demo', name: user?.nickname || '朋友' },
        messages: currentHistory,
      })
      const dialogueDecision = decideAliceAction(userMessage, aliceContext)
      updateConversationState(aliceContext, dialogueDecision, userMessage)
      const shareCandidate = dialogueDecision.socialIntent === 'VENT'
        ? null
        : await prepareAliceShare(userId, userMessage)
      const runtimeContext = serializeAliceRuntimeContext(aliceContext, dialogueDecision)
        + (shareCandidate ? buildShareRuntimePrompt(shareCandidate) : '')

      const response = await sendAIMessage({
        characterId: 'alice',
        userId: user?.id || 'demo',
        userName: user?.nickname || '朋友',
        scene: 'HOME',
        customSystemPrompt: systemPrompt,
        messageHistory: currentHistory,
        runtimeContext,
      })
      if (shareCandidate) {
        const lifeAfterShare = recordSharedStory(userId, shareCandidate)
        void syncAliceLifeToCloud(lifeAfterShare)
      }
      const relationshipAfterResponse = recordRelationshipResponse(
        user?.id || 'demo',
        aliceContext.relationship,
        'HOME',
      )
      void syncRelationshipStoreToCloud(relationshipAfterResponse)

      // 推断表情
      const inferredExpression = inferExpressionFromReply(response)
      setExpressionWithReset(inferredExpression)

      // AI 回复写入持久化 store
      addMessage('alice', {
        characterId: 'alice',
        content: response,
        isUser: false,
        scene: 'HOME',
      })
      if (user && !isDemo) saveToDb(user.id, 'alice', response, false, 'HOME')

      setActiveDialogText(response)
      setIsSpeaking(true)
      speakAsAlice(response, inferredExpression, dialogueDecision.voiceState)

      const diaryHistory: AIMessage[] = [
        ...currentHistory,
        {
          id: `a-diary-${Date.now()}`,
          timestamp: new Date().toISOString(),
          characterId: 'alice',
          content: response,
          isUser: false,
          scene: 'HOME',
        },
      ]
      if (shouldWriteAliceDiary(userId, diaryHistory)) {
        void callDeepSeekAPI([
          { role: 'system', content: '只完成私人日记写作，不解释要求。' },
          { role: 'user', content: buildDiaryPrompt(user?.nickname || '朋友', diaryHistory) },
        ], 360).then(content => {
          const diaryContent = content || buildDiaryFallback(user?.nickname || '朋友', userMessage, response)
          const diaryStore = upsertDiaryEntry({
            userId,
            content: diaryContent,
            title: /开心|成功|喜欢|搞定/.test(userMessage) ? '值得开心的一天' : '今天的小事',
            mood: /开心|成功|喜欢|搞定/.test(userMessage) ? 'sunny'
              : /难过|累|烦|害怕/.test(userMessage) ? 'thoughtful' : 'soft',
          })
          void syncAliceLifeToCloud(diaryStore)
        }).catch(() => {
          const diaryStore = upsertDiaryEntry({
            userId,
            content: buildDiaryFallback(user?.nickname || '朋友', userMessage, response),
          })
          void syncAliceLifeToCloud(diaryStore)
        })
      }

      // ── 后台：递增消息计数 + 自动分析用户偏好（完全隐藏，用户无感知）──
      const updatedProfile: AliceProfile = {
        ...profile,
        messagesSinceLastAnalysis: profile.messagesSinceLastAnalysis + 2, // 一问一答算2条
      }

      if (shouldAnalyze(updatedProfile)) {
        // 构建包含最新回复的完整历史
        const analysisHistory: AIMessage[] = [
          ...currentHistory,
          {
            id: `a-tmp-${Date.now()}`,
            timestamp: new Date().toISOString(),
            characterId: 'alice',
            content: response,
            isUser: false,
            scene: 'HOME',
          },
        ]

        // 后台分析，不 await，不阻塞对话
        analyzeConversation(analysisHistory, updatedProfile)
          .then((result) => {
            if (result) {
              const analyzedProfile: AliceProfile = {
                ...updatedProfile,
                userInsight: result.userInsight,
                preferenceTags: result.preferenceTags,
                memoryNotes: result.memoryNotes,
                memoryEntries: result.memoryEntries,
                lastAnalyzedAt: new Date().toISOString(),
                messagesSinceLastAnalysis: 0,
              }
              setProfile(analyzedProfile)
              saveProfile(analyzedProfile)
            } else {
              // 分析失败，只保存计数器（下次再试）
              setProfile(updatedProfile)
              saveProfile(updatedProfile)
            }
          })
          .catch(() => {
            saveProfile(updatedProfile)
          })
      } else {
        setProfile(updatedProfile)
        saveProfile(updatedProfile)
      }
    } catch {
      const errText = '抱歉，通讯系统出了点小问题。请稍后再试呢。'
      addMessage('alice', {
        characterId: 'alice',
        content: errText,
        isUser: false,
        scene: 'HOME',
      })
      setActiveDialogText(errText)
      setExpressionWithReset('sad')
      setIsSpeaking(true)
      speakAsAlice(errText, 'sad')
    } finally {
      setIsLoading(false)
    }
  }, [inputValue, isLoading, persistedMessages, user, isDemo, profile, lastVisitInfo, addMessage, saveToDb, setExpressionWithReset, speakAsAlice])

  // 清除对话历史
  const handleClearHistory = useCallback(() => {
    clearMessages('alice')
    setShowClearConfirm(false)
    setShowHistory(false)
    const resetText = '嗯……之前说的都清掉了。从头开始也挺好的，想聊什么呢？'
    setActiveDialogText(resetText)
    setIsSpeaking(true)
    speakAsAlice(resetText, 'shy')

    // 重置消息计数器（保留 AI 已分析的偏好数据）
    const resetProfile = { ...profile, messagesSinceLastAnalysis: 0 }
    setProfile(resetProfile)
    saveProfile(resetProfile)
  }, [clearMessages, profile, speakAsAlice])

  const handleVoiceToggle = useCallback(() => {
    const nextEnabled = !voiceEnabled
    setVoiceEnabled(nextEnabled)
    if (nextEnabled && activeDialogText && !isLoading) {
      speakAsAlice(activeDialogText, currentExpression)
    }
  }, [
    voiceEnabled,
    setVoiceEnabled,
    activeDialogText,
    isLoading,
    speakAsAlice,
    currentExpression,
  ])

  const loadingDialogText = isLoading ? '...' : activeDialogText

  return createPortal(
    <div className="fixed inset-0 overflow-hidden z-[60]">
      {/* 背景层 */}
      <RoomBackground />

      {/* 角色立绘 */}
      <CharacterSprite
        expression={currentExpression}
        isSpeaking={isSpeaking || isVoiceSpeaking}
        onClick={handleSpriteClick}
      />

      {/* 表情标签 */}
      <AnimatePresence>
        {currentExpression && ALICE_EXPRESSIONS[currentExpression] && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.8 }}
            className="absolute z-20 left-1/2 -translate-x-1/2"
            style={{ bottom: 'calc(22% + 55vh)' }}
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

      {/* 右上角 - 标题 & 档案 & 历史按钮 */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/70 backdrop-blur-sm shadow-sm border border-pink-200/30">
          <Crown className="w-4 h-4 text-pink-400" />
          <span className="text-xs font-semibold text-pink-700">深圳 · 艾莉丝的小屋</span>
        </div>
        {voiceSupported && (
          <button
            onClick={handleVoiceToggle}
            className="p-2 rounded-full bg-white/70 backdrop-blur-sm shadow-sm border border-pink-200/30 hover:bg-white/90 transition-colors"
            title={
              voiceEnabled
                ? '关闭艾莉丝语音'
                : '开启艾莉丝语音'
            }
            aria-label={voiceEnabled ? '关闭艾莉丝语音' : '开启艾莉丝语音'}
            aria-pressed={voiceEnabled}
          >
            {voiceEnabled ? (
              <Volume2 className={`w-4 h-4 text-pink-600 ${isVoiceSpeaking ? 'animate-pulse' : ''}`} />
            ) : (
              <VolumeX className="w-4 h-4 text-pink-400" />
            )}
          </button>
        )}
        <button
          onClick={() => setShowVoiceSettings(true)}
          className="p-2 rounded-full bg-white/70 backdrop-blur-sm shadow-sm border border-pink-200/30 hover:bg-white/90 transition-colors"
          title="定制艾莉丝声线"
          aria-label="定制艾莉丝声线"
        >
          <SlidersHorizontal className="w-4 h-4 text-pink-600" />
        </button>
        <button
          onClick={() => setShowDiary(true)}
          className="p-2 rounded-full bg-white/70 backdrop-blur-sm shadow-sm border border-pink-200/30 hover:bg-white/90 transition-colors"
          title="艾莉丝的日记"
          aria-label="艾莉丝的日记"
        >
          <NotebookPen className="w-4 h-4 text-pink-600" />
        </button>
        <button
          onClick={() => setShowProfilePanel(true)}
          className="p-2 rounded-full bg-white/70 backdrop-blur-sm shadow-sm border border-pink-200/30 hover:bg-white/90 transition-colors"
          title="人物档案"
        >
          <BookOpen className="w-4 h-4 text-pink-600" />
        </button>
        <button
          onClick={() => setShowHistory(true)}
          className="p-2 rounded-full bg-white/70 backdrop-blur-sm shadow-sm border border-pink-200/30 hover:bg-white/90 transition-colors"
        >
          <History className="w-4 h-4 text-pink-600" />
        </button>
      </div>

      {/* 底部对话框区域 */}
      <div
        className="absolute left-0 right-0 z-20 flex flex-col items-center gap-3 pointer-events-auto"
        style={{ bottom: '6%' }}
      >
        <DialogBox
          text={loadingDialogText}
          expression={currentExpression}
          isTyping={isSpeaking || isLoading}
          onSkip={() => setIsSpeaking(false)}
          onTextComplete={handleTextComplete}
        />
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
                <div>
                  <h3 className="text-sm font-bold text-pink-800">对话记录</h3>
                  {persistedMessages.length > 0 && (
                    <p className="text-xs text-pink-400 mt-0.5">共 {persistedMessages.length} 条 · 跨session保存</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {persistedMessages.length > 0 && (
                    <button
                      onClick={() => setShowClearConfirm(true)}
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-red-300 hover:text-red-400"
                      title="清除记录"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setShowHistory(false)}
                    className="p-1.5 rounded-lg hover:bg-pink-50 transition-colors"
                  >
                    <X className="w-4 h-4 text-pink-400" />
                  </button>
                </div>
              </div>

              {/* 清除确认 */}
              <AnimatePresence>
                {showClearConfirm && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mx-4 my-2 p-3 rounded-xl bg-red-50/80 border border-red-100">
                      <p className="text-xs text-red-600 mb-2">清除后艾莉丝将不再记得之前的对话，确定吗？</p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleClearHistory}
                          className="flex-1 py-1.5 rounded-lg bg-red-400 text-white text-xs font-medium hover:bg-red-500 transition-colors"
                        >
                          清除
                        </button>
                        <button
                          onClick={() => setShowClearConfirm(false)}
                          className="flex-1 py-1.5 rounded-lg bg-pink-100 text-pink-700 text-xs font-medium hover:bg-pink-200 transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 历史消息列表 */}
              <div className="overflow-y-auto max-h-[55vh] p-4 space-y-3">
                {persistedMessages.length === 0 ? (
                  <div className="text-center py-8 text-pink-300/60 text-sm">
                    还没有对话记录
                  </div>
                ) : (
                  persistedMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-2.5 ${msg.isUser ? 'flex-row-reverse' : ''}`}
                    >
                      {!msg.isUser && (
                        <div className="w-7 h-7 rounded-full overflow-hidden border border-pink-300/30 shrink-0">
                          <img
                            src={getAvatarSrc(null)}
                            alt="艾莉丝"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div
                        className={`max-w-[75%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                          msg.isUser
                            ? 'bg-gradient-to-r from-pink-400 to-pink-500 text-white rounded-tr-sm'
                            : 'bg-pink-50/80 text-pink-900/80 rounded-tl-sm'
                        }`}
                      >
                        {msg.isUser ? (
                          <span className="whitespace-pre-wrap">{msg.content}</span>
                        ) : (
                          <MarkdownRenderer content={stripDialogueTimePrefix(msg.content)} className="text-sm" />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 角色声线工坊 */}
      <AnimatePresence>
        {showVoiceSettings && (
          <VoiceSettingsPanel
            settings={voiceSettings}
            source={voiceSource}
            isDesigning={isVoiceDesigning}
            error={voiceError}
            onChange={updateVoiceSettings}
            onPreview={previewCustomVoice}
            onReset={resetVoiceSettings}
            onClose={() => setShowVoiceSettings(false)}
          />
        )}
      </AnimatePresence>

      {/* 艾莉丝的日记 */}
      <AnimatePresence>
        {showDiary && (
          <DiaryPanel
            userId={user?.id || 'demo'}
            onClose={() => setShowDiary(false)}
          />
        )}
      </AnimatePresence>

      {/* 人物档案面板 */}
      <AnimatePresence>
        {showProfilePanel && (
          <ProfilePanel
            profile={profile}
            userId={user?.id || 'demo'}
            onSave={(p) => {
              setProfile(p)
              saveProfile(p)
            }}
            onClose={() => setShowProfilePanel(false)}
          />
        )}
      </AnimatePresence>
    </div>,
    document.body
  )
}
