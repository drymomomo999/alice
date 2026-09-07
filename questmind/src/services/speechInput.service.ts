export interface SpeechRecognitionAlternativeLike {
  transcript: string
}

export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: SpeechRecognitionAlternativeLike
}

export interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number
  readonly results: ArrayLike<SpeechRecognitionResultLike>
}

export interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string
}

export interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onstart: (() => void) | null
  onend: (() => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  start(): void
  stop(): void
  abort(): void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

export function createSpeechRecognition(): SpeechRecognitionLike | null {
  const speechWindow = window as SpeechRecognitionWindow
  const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
  if (!Recognition) return null

  const recognition = new Recognition()
  recognition.lang = 'zh-CN'
  recognition.continuous = true
  recognition.interimResults = true
  return recognition
}

export function speechRecognitionErrorMessage(error: string): string {
  if (error === 'not-allowed' || error === 'service-not-allowed') return '需要先允许麦克风权限。'
  if (error === 'audio-capture') return '没有找到可用的麦克风。'
  if (error === 'network') return '语音识别服务暂时无法连接。'
  if (error === 'no-speech') return '我没有听清，再说一次好吗？'
  return '语音识别暂时不可用。'
}

export const TASK_START_PHRASE = '发布任务'
export const TASK_END_PHRASE = '就这样'

/** 去掉语音识别常见的标点和空格，便于稳定识别口令。 */
export function normalizeCommandText(text: string): string {
  return text.replace(/[\s，。！？、,.!?；;：:]/g, '')
}

/** 在保留原文的同时，按忽略标点后的口令切分文本。 */
export function splitAtCommand(text: string, phrase: string): { before: string; after: string } | null {
  const ignored = /[\s，。！？、,.!?；;：:]/
  const boundaryPunctuation = /^[\s，。！？、,.!?；;：:]+|[\s，。！？、,.!?；;：:]+$/g
  const normalizedChars: string[] = []
  const sourceIndexes: number[] = []

  Array.from(text).forEach((char, index) => {
    if (!ignored.test(char)) {
      normalizedChars.push(char)
      sourceIndexes.push(index)
    }
  })

  const start = normalizedChars.join('').indexOf(normalizeCommandText(phrase))
  if (start < 0) return null
  const endIndex = sourceIndexes[start + normalizeCommandText(phrase).length - 1]
  return {
    before: Array.from(text).slice(0, sourceIndexes[start]).join('').replace(boundaryPunctuation, '').trim(),
    after: Array.from(text).slice(endIndex + 1).join('').replace(boundaryPunctuation, '').trim(),
  }
}
