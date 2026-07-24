import { useCallback, useEffect, useRef, useState } from 'react'
import type { AliceExpression } from '@/assets/alice'
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

const EXPRESSION_PROSODY: Record<
  AliceExpression,
  { rate: number; pitch: number }
> = {
  happy: { rate: 1.0, pitch: 1.12 },
  shy: { rate: 0.9, pitch: 1.1 },
  angry: { rate: 0.96, pitch: 1.02 },
  surprised: { rate: 1.03, pitch: 1.14 },
  sleepy: { rate: 0.84, pitch: 1.02 },
  thinking: { rate: 0.9, pitch: 1.06 },
  proud: { rate: 0.95, pitch: 1.08 },
  sad: { rate: 0.86, pitch: 1.03 },
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

function splitSpeechText(text: string, maxLength = 180): string[] {
  const sentences = text.match(/[^。！？!?；;\n]+[。！？!?；;]?/g) ?? [text]
  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    if (current && current.length + sentence.length > maxLength) {
      chunks.push(current.trim())
      current = ''
    }
    if (sentence.length > maxLength) {
      for (let index = 0; index < sentence.length; index += maxLength) {
        const part = sentence.slice(index, index + maxLength).trim()
        if (part) chunks.push(part)
      }
    } else {
      current += sentence
    }
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks
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
    playbackId: number
  ) => {
    if (!systemSupported) {
      setIsSpeaking(false)
      return
    }

    const chunks = splitSpeechText(text)
    const voice = chooseFallbackVoice(window.speechSynthesis.getVoices())
    const prosody = expression
      ? EXPRESSION_PROSODY[expression]
      : { rate: 0.94, pitch: 1.08 }
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
      utterance.lang = voice?.lang || 'zh-CN'
      utterance.voice = voice
      utterance.rate = prosody.rate
      utterance.pitch = prosody.pitch
      utterance.volume = 0.92
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
    expression: AliceExpression | null
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
      speakWithSystemVoice(text, expression, playbackId)
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
        setLastError(error instanceof Error ? error.message : '声线设计失败')
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      if (playbackIdRef.current === playbackId) {
        setIsDesigning(false)
        setIsSpeaking(false)
      }
    }
  }, [cancel, persistSettings, playAudioBlob])

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
