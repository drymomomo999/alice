import { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useTypewriter } from '@/hooks/useTypewriter'
import type { AliceExpression } from '@/assets/alice'

interface DialogBoxProps {
  text: string
  characterName?: string
  expression?: AliceExpression | null
  isTyping: boolean       // 外部标记：是否正在等待或打字中
  onSkip?: () => void     // 点击跳过打字机
  onTextComplete?: () => void // 打字机完成回调
}

export function DialogBox({
  text,
  characterName = '艾莉丝',
  expression,
  isTyping,
  onSkip,
  onTextComplete,
}: DialogBoxProps) {
  const {
    displayText,
    isComplete,
    isTyping: isTypewriterActive,
    skip,
  } = useTypewriter({
    text,
    speed: 45,
    punctuationPause: 120,
    onComplete: onTextComplete,
    enabled: !!text,
  })

  const boxRef = useRef<HTMLDivElement>(null)

  // 点击对话框
  const handleClick = () => {
    if (isTypewriterActive) {
      skip()
      onSkip?.()
    }
  }

  // 当 text 为空时不显示对话框
  if (!text) return null

  return (
    <motion.div
      ref={boxRef}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="dialog-box-gal relative mx-auto cursor-pointer select-none"
      style={{
        width: 'min(88%, 720px)',
        padding: '1.25rem 1.5rem 1rem',
      }}
      onClick={handleClick}
    >
      {/* 角色名标签 */}
      <div className="character-name-badge mb-2.5 inline-block">
        {characterName}
      </div>

      {/* 对话文字区域 — 深棕色文字 */}
      <div
        className="min-h-[3.5rem] leading-relaxed text-[1.05rem] tracking-wide"
        style={{
          color: 'rgba(80, 50, 40, 0.88)',
          fontFamily: '"Nunito", "Noto Sans SC", "Microsoft YaHei", sans-serif',
        }}
      >
        {displayText}
        {/* 打字光标 */}
        <AnimatePresence>
          {isTypewriterActive && (
            <motion.span
              className="typewriter-cursor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ color: 'rgba(200, 100, 120, 0.7)' }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* 继续指示器 - 打字完成后显示 */}
      <AnimatePresence>
        {isComplete && !isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="continue-arrow"
          >
            <ChevronDown
              className="w-5 h-5"
              style={{ color: 'rgba(200, 130, 140, 0.5)' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 装饰线条 - 对话框顶部樱花粉渐变 */}
      <div
        className="absolute top-0 left-4 right-4 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(220, 150, 160, 0.35), transparent)',
        }}
      />
    </motion.div>
  )
}
