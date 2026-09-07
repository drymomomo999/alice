import { useCallback, useEffect, useRef, useState } from 'react'
import { Window, getCurrentWindow } from '@tauri-apps/api/window'
import { emitTo } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { Mic, MicOff, Radio } from 'lucide-react'
import {
  EXPRESSION_RESET_DELAY,
  type AliceExpression,
  getExpressionImages,
  inferExpressionFromReply,
} from '@/assets/alice'
import AliceCharacter from '@/assets/alice-character.png'
import { useAIChatStore, useUserStore } from '@/store'
import { sendAIMessage } from '@/services/ai.service'
import { buildRoomPromptFromProfile, rememberVoiceInput } from '@/services/aliceProfile.service'
import {
  buildAliceContext,
  decideAliceAction,
  serializeAliceRuntimeContext,
  updateConversationState,
} from '@/services/aliceDialogue.service'
import {
  loadRelationshipStore,
  recordRelationshipResponse,
  recordRelationshipUserMessage,
} from '@/services/aliceRelationship.service'
import {
  hydrateRelationshipStoreFromCloud,
  syncRelationshipStoreToCloud,
} from '@/services/aliceRelationshipCloud.service'
import {
  createSpeechRecognition,
  speechRecognitionErrorMessage,
  splitAtCommand,
  TASK_END_PHRASE,
  TASK_START_PHRASE,
  type SpeechRecognitionLike,
} from '@/services/speechInput.service'
import type { AIMessage } from '@/types'
import './pet.css'

const isTauri = () => '__TAURI_INTERNALS__' in window

const IDLE_LINES = [
  '我就在这里陪着你。',
  '坐久了吗？记得活动一下肩颈呀。',
  '今天也辛苦了。',
  '需要我的时候，摸摸我的头就好。',
]

function greeting(name?: string) {
  const hour = new Date().getHours()
  const suffix = name ? `，${name}` : ''
  if (hour < 6) return `还没休息吗${suffix}？`
  if (hour < 11) return `早上好${suffix}。`
  if (hour < 14) return `中午好${suffix}。`
  if (hour < 19) return `下午好${suffix}。`
  return `晚上好${suffix}。`
}

export function DesktopPetPage() {
  const user = useUserStore(state => state.user)
  const isDemo = useUserStore(state => state.isDemo)
  const [line, setLine] = useState<string | null>(() => greeting(user?.nickname))
  const [activeExpression, setActiveExpression] = useState<AliceExpression | null>(null)
  const [isHappy, setIsHappy] = useState(false)
  const [isHeld, setIsHeld] = useState(false)
  const [effect, setEffect] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [voiceMode, setVoiceMode] = useState<'alice' | 'task'>('alice')
  const [liveTranscript, setLiveTranscript] = useState('')
  const [isProcessingVoice, setIsProcessingVoice] = useState(false)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const didDrag = useRef(false)
  const lineTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const dropTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const silenceTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const shouldListenRef = useRef(false)
  const taskModeRef = useRef(false)
  const pendingTextRef = useRef('')
  const processingRef = useRef(false)
  const expressionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const expressionImages = getExpressionImages()
  const currentExpression = activeExpression
  const currentSprite = currentExpression ? expressionImages[currentExpression] : AliceCharacter

  const speak = useCallback((text: string, duration = 4200) => {
    setLine(text)
    if (lineTimer.current) clearTimeout(lineTimer.current)
    lineTimer.current = setTimeout(() => setLine(null), duration)
  }, [])

  const showExpression = useCallback((expression: AliceExpression | null, duration = EXPRESSION_RESET_DELAY) => {
    if (expressionTimer.current) {
      clearTimeout(expressionTimer.current)
      expressionTimer.current = null
    }

    setActiveExpression(expression)
    if (!expression) return

    expressionTimer.current = setTimeout(() => {
      setActiveExpression(null)
      expressionTimer.current = null
    }, duration)
  }, [])

  useEffect(() => {
    document.documentElement.classList.add('desktop-pet-document')
    document.body.classList.add('desktop-pet-document')
    lineTimer.current = setTimeout(() => setLine(null), 5000)

    let unlistenMoved: (() => void) | undefined
    if (isTauri()) {
      void getCurrentWindow().onMoved(() => {
        if (!didDrag.current) return
        if (dropTimer.current) clearTimeout(dropTimer.current)
        dropTimer.current = setTimeout(() => {
          didDrag.current = false
          setIsHeld(false)
          showExpression('shy', 2400)
          speak('放在这里吗？好呀。', 3000)
        }, 180)
      }).then(dispose => { unlistenMoved = dispose })
    }

    const idleTimer = window.setInterval(() => {
      speak(IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)], 3800)
    }, 90_000)

    return () => {
      document.documentElement.classList.remove('desktop-pet-document')
      document.body.classList.remove('desktop-pet-document')
      unlistenMoved?.()
      window.clearInterval(idleTimer)
      if (lineTimer.current) clearTimeout(lineTimer.current)
      if (dropTimer.current) clearTimeout(dropTimer.current)
      if (silenceTimer.current) clearTimeout(silenceTimer.current)
      if (expressionTimer.current) clearTimeout(expressionTimer.current)
      shouldListenRef.current = false
      recognitionRef.current?.abort()
    }
  }, [showExpression, speak])

  const saveChatMessage = useCallback(async (content: string, isUser: boolean) => {
    const message: Omit<AIMessage, 'id' | 'timestamp'> = {
      characterId: 'alice', content, isUser, scene: 'HOME',
    }
    useAIChatStore.getState().addMessage('alice', message)
    if (user && !isDemo) {
      await useAIChatStore.getState().saveToDb(user.id, 'alice', content, isUser, 'HOME')
    }
    return message
  }, [user, isDemo])

  // 桌宠云同步：挂载时拉一次，丢失/不一致时自动对齐到本地 store
  useEffect(() => {
    if (!user || isDemo) return
    void hydrateRelationshipStoreFromCloud(user.id).catch(error => {
      console.error('[DesktopPet] 云端关系数据拉取失败:', error)
    })
  }, [user, isDemo])

  // 把当前桌宠用户关系状态推送到云端（fire-and-forget；失败保留本地，下次重试）
  const pushRelationship = useCallback(() => {
    if (!user || isDemo) return
    const store = loadRelationshipStore(user.id)
    void syncRelationshipStoreToCloud(store).catch(error => {
      console.warn('[DesktopPet] 关系数据云同步失败，下次写操作将重试:', error)
    })
  }, [user, isDemo])

  const submitAliceVoice = useCallback(async (rawText: string) => {
    const text = rawText.trim()
    if (!text || processingRef.current) return
    processingRef.current = true
    setIsProcessingVoice(true)
    showExpression('thinking', 7000)
    speak(`我听到了：“${text}”`, 5000)

    const profile = rememberVoiceInput(text, 'voice')
    const history = (useAIChatStore.getState().messages.alice || [])
      .filter(message => message.scene === 'HOME')
    const userMessage = await saveChatMessage(text, true)
    const messageHistory: AIMessage[] = [
      ...history,
      { ...userMessage, id: `voice-${Date.now()}`, timestamp: new Date().toISOString() },
    ]
    recordRelationshipUserMessage({
      userId: user?.id || 'demo',
      scene: 'HOME',
      message: text,
    })
    pushRelationship()
    const aliceContext = buildAliceContext({
      scene: 'HOME',
      user: { id: user?.id || 'demo', name: user?.nickname || '朋友' },
      messages: messageHistory,
    })
    const dialogueDecision = decideAliceAction(text, aliceContext)
    updateConversationState(aliceContext, dialogueDecision, text)

    try {
      const response = await sendAIMessage({
        characterId: 'alice',
        userId: user?.id || 'demo',
        userName: user?.nickname || '朋友',
        scene: 'HOME',
        customSystemPrompt: buildRoomPromptFromProfile(profile, user?.nickname || '朋友'),
        messageHistory,
        runtimeContext: serializeAliceRuntimeContext(aliceContext, dialogueDecision),
      })
      recordRelationshipResponse(user?.id || 'demo', aliceContext.relationship, 'HOME')
      pushRelationship()
      await saveChatMessage(response, false)
      showExpression(inferExpressionFromReply(response) ?? 'happy', 7200)
      speak(response, 8000)
    } catch {
      showExpression('sad', 5200)
      speak('内容已经替你记住了，不过我现在没能接通对话服务。', 6000)
    } finally {
      processingRef.current = false
      setIsProcessingVoice(false)
    }
  }, [saveChatMessage, showExpression, speak, user])

  const publishCodexTask = useCallback(async (rawText: string) => {
    const task = rawText.trim()
    if (!task) {
      speak('任务内容还是空的，请再说一次“发布任务”。', 5000)
      return
    }

    rememberVoiceInput(task, 'codex-task')
    await saveChatMessage(`[Codex 任务] ${task}`, true)
    setIsProcessingVoice(true)
    showExpression('proud', 6500)
    try {
      if (!isTauri()) throw new Error('Codex task launching requires the desktop app')
      await invoke('launch_codex_task', { prompt: task })
      speak('任务已发布，Codex 正在新任务里执行。', 6500)
    } catch (error) {
      console.error('[DesktopPet] 发布 Codex 任务失败:', error)
      showExpression('sad', 5200)
      speak('任务内容已经记住了，但这次没能打开 Codex。', 6500)
    } finally {
      setIsProcessingVoice(false)
    }
  }, [saveChatMessage, showExpression, speak])

  const finishOrdinaryInput = useCallback(() => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current)
    const text = pendingTextRef.current.trim()
    pendingTextRef.current = ''
    setLiveTranscript('')
    if (text) void submitAliceVoice(text)
  }, [submitAliceVoice])

  const processFinalSpeech = useCallback((chunk: string) => {
    pendingTextRef.current = `${pendingTextRef.current}${chunk}`.trim()

    if (!taskModeRef.current) {
      const taskStart = splitAtCommand(pendingTextRef.current, TASK_START_PHRASE)
      if (taskStart) {
        if (taskStart.before) void submitAliceVoice(taskStart.before)
        taskModeRef.current = true
        setVoiceMode('task')
        pendingTextRef.current = taskStart.after
        speak('好，请继续说任务内容，说“就这样”后我会发布。', 5500)
      }
    }

    if (taskModeRef.current) {
      const taskEnd = splitAtCommand(pendingTextRef.current, TASK_END_PHRASE)
      if (taskEnd) {
        const task = taskEnd.before
        taskModeRef.current = false
        shouldListenRef.current = false
        pendingTextRef.current = ''
        setVoiceMode('alice')
        setLiveTranscript('')
        recognitionRef.current?.stop()
        void publishCodexTask(task)
        return
      }
    } else {
      if (silenceTimer.current) clearTimeout(silenceTimer.current)
      silenceTimer.current = setTimeout(finishOrdinaryInput, 1600)
    }

    setLiveTranscript(pendingTextRef.current)
  }, [finishOrdinaryInput, publishCodexTask, speak, submitAliceVoice])

  const startVoiceInput = useCallback(() => {
    if (processingRef.current || isProcessingVoice) return
    let recognition = recognitionRef.current
    if (!recognition) {
      recognition = createSpeechRecognition()
      recognitionRef.current = recognition
    }
    if (!recognition) {
      speak('当前系统不支持语音识别，请更新 WebView2 后再试。', 6500)
      return
    }

    pendingTextRef.current = ''
    taskModeRef.current = false
    shouldListenRef.current = true
    setVoiceMode('alice')
    setLiveTranscript('')
    showExpression('surprised', 3200)

    recognition.onstart = () => {
      setIsListening(true)
      showExpression('thinking', 4200)
      speak('我在听。说“发布任务”可以交给 Codex。', 4800)
    }
    recognition.onresult = event => {
      let finalText = ''
      let interimText = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result[0]?.transcript || ''
        if (result.isFinal) finalText += transcript
        else interimText += transcript
      }
      if (finalText) processFinalSpeech(finalText)
      setLiveTranscript(`${pendingTextRef.current}${interimText}`.trim())
    }
    recognition.onerror = event => {
      if (event.error === 'aborted') return
      shouldListenRef.current = false
      setIsListening(false)
      showExpression('sad', 4200)
      speak(speechRecognitionErrorMessage(event.error), 5500)
    }
    recognition.onend = () => {
      if (shouldListenRef.current && taskModeRef.current) {
        window.setTimeout(() => {
          try { recognitionRef.current?.start() } catch { shouldListenRef.current = false }
        }, 180)
        return
      }
      setIsListening(false)
      if (!taskModeRef.current) finishOrdinaryInput()
    }

    try {
      recognition.start()
    } catch {
      shouldListenRef.current = false
      showExpression('sad', 4200)
      speak('麦克风正在准备中，请稍后再试。', 4500)
    }
  }, [finishOrdinaryInput, isProcessingVoice, processFinalSpeech, showExpression, speak])

  const stopVoiceInput = useCallback(() => {
    shouldListenRef.current = false
    if (taskModeRef.current) {
      taskModeRef.current = false
      pendingTextRef.current = ''
      setVoiceMode('alice')
      setLiveTranscript('')
      showExpression('shy', 2800)
      speak('已取消这次任务发布。', 4000)
    } else {
      finishOrdinaryInput()
    }
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [finishOrdinaryInput, showExpression, speak])

  const openMain = useCallback(async () => {
    if (!isTauri()) {
      window.location.hash = '/'
      return
    }
    const main = await Window.getByLabel('main')
    if (!main) return
    await main.show()
    await main.unminimize()
    await main.setFocus()
    await emitTo('main', 'desktop-pet:navigate', '/')
  }, [])

  const petHead = () => {
    setEffect('♡')
    setIsHappy(true)
    showExpression('happy', 2800)
    speak('嗯……摸摸头很舒服。', 3500)
    window.setTimeout(() => setEffect(''), 900)
    window.setTimeout(() => setIsHappy(false), 1100)
  }

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    pointerStart.current = { x: event.clientX, y: event.clientY }
    didDrag.current = false
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const start = pointerStart.current
    if (!start || !isTauri() || didDrag.current) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) {
      didDrag.current = true
      setIsHeld(true)
      setLine(null)
      showExpression('surprised', 1600)
      void getCurrentWindow().startDragging()
    }
  }

  const onPointerUp = () => {
    pointerStart.current = null
    if (!didDrag.current) void openMain()
  }

  return (
    <main className="desktop-pet">
      {line && (
        <button className="pet-bubble" onClick={() => setLine(null)} aria-label="关闭对话">
          {line}
        </button>
      )}

      {(isListening || liveTranscript) && (
        <div className={`pet-listening-status ${voiceMode === 'task' ? 'is-task' : ''}`}>
          <Radio aria-hidden="true" />
          <span>{voiceMode === 'task' ? '正在记录 Codex 任务' : '正在听你说'}</span>
          {liveTranscript && <small>{liveTranscript}</small>}
        </div>
      )}

      <button
        className={`pet-mic-button ${isListening ? 'is-listening' : ''} ${voiceMode === 'task' ? 'is-task' : ''}`}
        onClick={isListening ? stopVoiceInput : startVoiceInput}
        disabled={isProcessingVoice}
        aria-label={isListening ? '停止语音输入' : '开始语音输入'}
        title={isListening ? '停止语音输入' : '语音输入；说“发布任务”可唤起 Codex'}
      >
        {isListening ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
      </button>

      <div
        className={`pet-character ${isHappy ? 'is-happy' : ''} ${isHeld ? 'is-held' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { pointerStart.current = null }}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') void openMain()
        }}
        role="button"
        tabIndex={0}
        aria-label="艾莉丝桌宠，单击打开 QuestMind，拖动可以移动；左下角可以语音输入"
      >
        {effect && <span className="pet-effect">{effect}</span>}
        {isHeld && <span className="pet-held-effect">!</span>}
        <img
          key={currentExpression}
          className="pet-character-image"
          src={currentSprite}
          alt="Q版艾莉丝"
          draggable={false}
        />
        <span className="pet-shadow" />

        <button
          className="pet-head-hitbox"
          aria-label="摸摸艾莉丝的头"
          title="摸摸头"
          onPointerDown={event => event.stopPropagation()}
          onPointerUp={event => event.stopPropagation()}
          onClick={event => {
            event.stopPropagation()
            petHead()
          }}
        />
      </div>
    </main>
  )
}
