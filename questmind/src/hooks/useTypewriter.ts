import { useState, useEffect, useRef, useCallback } from 'react'

interface UseTypewriterOptions {
  text: string
  speed?: number              // 每个字符的显示间隔（ms），默认 50
  punctuationPause?: number   // 标点符号额外停顿时间（ms），默认 150
  onComplete?: () => void     // 打字完成回调
  enabled?: boolean           // 是否启用打字效果，默认 true
}

interface UseTypewriterReturn {
  displayText: string         // 当前显示的文字
  isComplete: boolean         // 是否已完成
  isTyping: boolean           // 是否正在打字中
  skip: () => void            // 跳过动画，直接显示全文
  reset: () => void           // 重置动画
}

// 中文/日文标点需要更长停顿
const PUNCTUATION_CHARS = new Set('。！？~…!?.,;:，；：、')

export function useTypewriter({
  text,
  speed = 50,
  punctuationPause = 150,
  onComplete,
  enabled = true,
}: UseTypewriterOptions): UseTypewriterReturn {
  const [displayText, setDisplayText] = useState('')
  const [isComplete, setIsComplete] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const indexRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipRef = useRef(false)
  const onCompleteRef = useRef(onComplete)

  // 保持回调引用最新
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  // 当 text 变化时重置并开始打字
  useEffect(() => {
    if (!text) {
      setDisplayText('')
      setIsComplete(false)
      setIsTyping(false)
      indexRef.current = 0
      return
    }

    if (!enabled) {
      setDisplayText(text)
      setIsComplete(true)
      setIsTyping(false)
      return
    }

    // 重置状态
    indexRef.current = 0
    skipRef.current = false
    setDisplayText('')
    setIsComplete(false)
    setIsTyping(true)

    const typeChar = () => {
      // 如果被跳过，直接显示全文
      if (skipRef.current) {
        setDisplayText(text)
        setIsComplete(true)
        setIsTyping(false)
        onCompleteRef.current?.()
        return
      }

      const currentIndex = indexRef.current
      if (currentIndex < text.length) {
        const nextChar = text[currentIndex]
        setDisplayText(text.slice(0, currentIndex + 1))
        indexRef.current = currentIndex + 1

        // 标点符号加停顿
        const delay = PUNCTUATION_CHARS.has(nextChar)
          ? speed + punctuationPause
          : speed

        timerRef.current = setTimeout(typeChar, delay)
      } else {
        setIsComplete(true)
        setIsTyping(false)
        onCompleteRef.current?.()
      }
    }

    // 开始打字
    timerRef.current = setTimeout(typeChar, speed)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [text, speed, punctuationPause, enabled])

  const skip = useCallback(() => {
    if (isTyping) {
      skipRef.current = true
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setDisplayText(text)
      setIsComplete(true)
      setIsTyping(false)
      onCompleteRef.current?.()
    }
  }, [isTyping, text])

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    indexRef.current = 0
    skipRef.current = false
    setDisplayText('')
    setIsComplete(false)
    setIsTyping(false)
  }, [])

  return {
    displayText,
    isComplete,
    isTyping,
    skip,
    reset,
  }
}
