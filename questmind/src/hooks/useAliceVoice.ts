import { useCallback, useEffect, useRef, useState } from 'react'
import type { AliceExpression } from '@/assets/alice'
import type { AliceVoiceState } from '@/types'
import {
  DEFAULT_ALICE_VOICE_SETTINGS,
  AliceVoiceServiceError,
  designAliceVoice,
  loadAliceVoiceSettings,
  saveAliceVoiceSettings,
  synthesizeAliceVoice,
  type AliceVoiceSettings,
} from '@/services/aliceVoice.service'

const VOICE_ENABLED_KEY = 'questmind:alice-voice-enabled'
const VOICE_PREVIEW_TEXT =
  '早上好。今天的安排我已经整理好了：十点前先处理最紧急的两项任务，其余事项我会按优先级提醒你。不过……你昨晚休息得太晚了。先喝口水，稍微缓一缓吧。别担心，剩下的交给我。'

const EXPRESSION_PROSODY: Record<
  AliceExpression,
  { rate: number; pitch: number; volume: number }
> = {
  happy: { rate: 1.02, pitch: 1.03, volume: 0.96 },
  shy: { rate: 0.91, pitch: 1.0, volume: 0.86 },
  angry: { rate: 1.01, pitch: 0.95, volume: 1 },
  surprised: { rate: 1.05, pitch: 1.06, volume: 0.98 },
  sleepy: { rate: 0.84, pitch: 0.94, volume: 0.8 },
  thinking: { rate: 0.94, pitch: 0.98, volume: 0.9 },
  proud: { rate: 0.99, pitch: 0.97, volume: 0.95 },
  sad: { rate: 0.88, pitch: 0.94, volume: 0.84 },
}

type SystemProsody = { rate: number; pitch: number; volume: number }

const VOICE_STATE_PROSODY: Record<AliceVoiceState, SystemProsody> = {
  NEUTRAL: { rate: 0.98, pitch: 0.98, volume: 0.93 },
  RELAXED: { rate: 0.95, pitch: 0.98, volume: 0.9 },
  HAPPY: { rate: 1.03, pitch: 1.03, volume: 0.96 },
  SERIOUS: { rate: 0.98, pitch: 0.94, volume: 0.95 },
  CONCERNED: { rate: 0.9, pitch: 0.95, volume: 0.84 },
  PLAYFUL: { rate: 1.04, pitch: 1.01, volume: 0.95 },
  FOCUSED: { rate: 1, pitch: 0.96, volume: 0.94 },
  SOFT: { rate: 0.88, pitch: 0.95, volume: 0.8 },
}

function getInitialEnabled(): boolean {
  try {
    return localStorage.getItem(VOICE_ENABLED_KEY) !== 'false'
  } catch {
    return true
  }
}

function chooseFallbackVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null

  const preferredNames = [
    'xiaoxiao', 'xiaoyi', '晓晓', '晓伊', 'tingting',
    '婷婷', 'meijia', '美佳', 'sin-ji', 'google 普通话',
  ]
  const masculineNames = ['yunxi', 'yunyang', 'yunjian', 'kangkang', 'danny']

  return [...voices]
    .map((voice) => {
      const name = voice.name.toLowerCase()
      const lang = voice.lang.toLowerCase()
      let score = lang === 'zh-cn' ? 100 : lang.startsWith('zh') ? 70 : 0
      if (voice.localService) score += 5
      const preferredIndex = preferredNames.findIndex((item) => name.includes(item))
      if (preferredIndex >= 0) score += 80 - preferredIndex * 3
      if (masculineNames.some((item) => name.includes(item))) score -= 100
      return { voice, score }
    })
    .sort((a, b) => b.score - a.score)[0]?.voice ?? null
}

function makeSpeechText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' 代码内容已显示在对话框中。 ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/[*_~>|]/g, '')
    .replace(/https?:\/\/\S+/g, '链接')
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitPerformanceText(text: string): string[] {
  const sentences = text.match(/[^。！？!?；;\n]+[。！？!?；;]?/g) ?? [text]
  return sentences.flatMap((sentence) => {
    const trimmed = sentence.trim()
    if (trimmed.length <= 72) return trimmed ? [trimmed] : []
    return trimmed.match(/[^，,、：:]+[，,、：:]?/g)?.map((part) => part.trim()).filter(Boolean) ?? [trimmed]
  })
}

function directSystemPerformance(
  text: string,
  base: SystemProsody,
  index: number,
  total: number
): SystemProsody {
  let { rate, pitch, volume } = base
  if (/[!?！？]$/.test(text)) {
    rate += text.endsWith('？') || text.endsWith('?') ? -0.02 : 0.04
    pitch += 0.035
  }
  if (/……|…/.test(text)) {
    rate -= 0.06
    pitch -= 0.015
  }
  if (/没事|别怕|不必|慢慢|休息|我会在/.test(text)) {
    rate -= 0.045
    volume -= 0.055
  }
  if (/先说好|显然|不过|但是|与其|倒不如/.test(text)) {
    rate += 0.025
    pitch -= 0.025
  }
  if (index === total - 1) rate -= 0.025
  return {
    rate: Math.min(1.18, Math.max(0.72, rate)),
    pitch: Math.min(1.18, Math.max(0.78, pitch)),
    volume: Math.min(1, Math.max(0.65, volume)),
  }
}

export type AliceVoiceSource = 'custom' | 'system' | 'idle'

export function useAliceVoice() {
  const systemSupported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [enabled, setEnabledState] = useState(getInitialEnabled)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isDesigning, setIsDesigning] = useState(false)
  const [source, setSource] = useState<AliceVoiceSource>('idle')
  const [lastError, setLastError] = useState<string | null>(null)
  const [settings, setSettingsState] = useState<AliceVoiceSettings>(loadAliceVoiceSettings)
  const enabledRef = useRef(enabled)
  const settingsRef = useRef(settings)
  const playbackIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const customUnavailableRef = useRef(false)

  const releaseAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current = null
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    playbackIdRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    releaseAudio()
    if (systemSupported) window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }, [releaseAudio, systemSupported])

  useEffect(() => cancel, [cancel])

  const persistSettings = useCallback((next: AliceVoiceSettings) => {
    settingsRef.current = next
    setSettingsState(next)
    saveAliceVoiceSettings(next)
  }, [])

  const updateSettings = useCallback((patch: Partial<AliceVoiceSettings>) => {
    persistSettings({ ...settingsRef.current, ...patch })
  }, [persistSettings])

  const playAudioBlob = useCallback(async (
    blob: Blob,
    playbackId: number
  ): Promise<void> => {
    releaseAudio()
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audioUrlRef.current = url
    audioRef.current = audio

    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve()
      audio.onerror = () => reject(new Error('定制语音播放失败'))
      audio.play().catch(reject)
    })

    if (playbackIdRef.current === playbackId) {
      releaseAudio()
    }
  }, [releaseAudio])

  const speakWithSystemVoice = useCallback((
    text: string,
    expression: AliceExpression | null,
    voiceState: AliceVoiceState,
    playbackId: number
  ) => {
    if (!systemSupported) {
      setIsSpeaking(false)
      return
    }

    const chunks = splitPerformanceText(text)
    const voice = chooseFallbackVoice(window.speechSynthesis.getVoices())
    const stateProsody = VOICE_STATE_PROSODY[voiceState]
    const expressionProsody = expression ? EXPRESSION_PROSODY[expression] : stateProsody
    const prosody = {
      rate: (stateProsody.rate * 0.7) + (expressionProsody.rate * 0.3),
      pitch: (stateProsody.pitch * 0.7) + (expressionProsody.pitch * 0.3),
      volume: (stateProsody.volume * 0.7) + (expressionProsody.volume * 0.3),
    }
    let index = 0
    setSource('system')

    const playNext = () => {
      if (playbackIdRef.current !== playbackId || !enabledRef.current) return
      const chunk = chunks[index]
      if (!chunk) {
        setIsSpeaking(false)
        return
      }
      const utterance = new SpeechSynthesisUtterance(chunk)
      const directed = directSystemPerformance(chunk, prosody, index, chunks.length)
      utterance.lang = voice?.lang || 'zh-CN'
      utterance.voice = voice
      utterance.rate = directed.rate
      utterance.pitch = directed.pitch
      utterance.volume = directed.volume
      utterance.onend = () => {
        index += 1
        playNext()
      }
      utterance.onerror = () => setIsSpeaking(false)
      window.speechSynthesis.speak(utterance)
    }

    playNext()
  }, [systemSupported])

  const speak = useCallback(async (
    markdown: string,
    expression: AliceExpression | null,
    voiceState: AliceVoiceState = 'RELAXED'
  ) => {
    if (!enabledRef.current) return
    const text = makeSpeechText(markdown)
    if (!text) return

    cancel()
    const playbackId = playbackIdRef.current + 1
    playbackIdRef.current = playbackId
    setIsSpeaking(true)
    setLastError(null)

    if (!customUnavailableRef.current) {
      const controller = new AbortController()
      abortRef.current = controller
      let customAudio: Awaited<ReturnType<typeof synthesizeAliceVoice>> | null = null
      try {
        customAudio = await synthesizeAliceVoice(
          text,
          expression,
          voiceState,
          settingsRef.current,
          controller.signal
        )
        if (playbackIdRef.current !== playbackId) return
        if (customAudio.voiceId && customAudio.voiceId !== settingsRef.current.voiceId) {
          persistSettings({ ...settingsRef.current, voiceId: customAudio.voiceId })
        }
      } catch (error) {
        if (controller.signal.aborted) return
        customUnavailableRef.current =
          error instanceof AliceVoiceServiceError &&
          (error.status === 401 || error.status === 404 || error.status === 503)
        setLastError(error instanceof Error ? error.message : '定制声线暂不可用')
      } finally {
        if (abortRef.current === controller) abortRef.current = null
      }

      if (customAudio && playbackIdRef.current === playbackId) {
        setSource('custom')
        try {
          await playAudioBlob(customAudio.blob, playbackId)
        } catch (error) {
          releaseAudio()
          setLastError(error instanceof Error ? error.message : '定制语音播放失败')
        }
        if (playbackIdRef.current === playbackId) setIsSpeaking(false)
        return
      }
    }

    if (playbackIdRef.current === playbackId) {
      speakWithSystemVoice(text, expression, voiceState, playbackId)
    }
  }, [cancel, persistSettings, playAudioBlob, releaseAudio, speakWithSystemVoice])

  const previewCustomVoice = useCallback(async () => {
    cancel()
    const playbackId = playbackIdRef.current + 1
    playbackIdRef.current = playbackId
    const controller = new AbortController()
    abortRef.current = controller
    setIsDesigning(true)
    setIsSpeaking(true)
    setLastError(null)
    let fallbackStarted = false

    try {
      const result = await designAliceVoice(settingsRef.current, controller.signal)
      if (playbackIdRef.current !== playbackId) return
      const nextSettings = {
        ...settingsRef.current,
        voiceId: result.voiceId,
      }
      persistSettings(nextSettings)
      customUnavailableRef.current = false
      setSource('custom')
      await playAudioBlob(result.blob, playbackId)
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : '声线设计失败'
        if (systemSupported) {
          fallbackStarted = true
          setLastError(`${message}；正在播放系统音色的近似试听。`)
          speakWithSystemVoice(VOICE_PREVIEW_TEXT, 'thinking', 'RELAXED', playbackId)
        } else {
          setLastError(message)
        }
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      if (playbackIdRef.current === playbackId) {
        setIsDesigning(false)
        if (!fallbackStarted) setIsSpeaking(false)
      }
    }
  }, [cancel, persistSettings, playAudioBlob, speakWithSystemVoice, systemSupported])

  const resetSettings = useCallback(() => {
    persistSettings({ ...DEFAULT_ALICE_VOICE_SETTINGS })
    customUnavailableRef.current = false
    setSource('idle')
    setLastError(null)
  }, [persistSettings])

  const setEnabled = useCallback((nextEnabled: boolean) => {
    enabledRef.current = nextEnabled
    setEnabledState(nextEnabled)
    try {
      localStorage.setItem(VOICE_ENABLED_KEY, String(nextEnabled))
    } catch {
      // 存储不可用时仍保留当前会话内的设置
    }
    if (!nextEnabled) cancel()
  }, [cancel])

  return {
    enabled,
    isSpeaking,
    isDesigning,
    supported: systemSupported || !!import.meta.env.VITE_SUPABASE_URL,
    source,
    lastError,
    settings,
    setEnabled,
    updateSettings,
    resetSettings,
    previewCustomVoice,
    speak,
    cancel,
  }
}
