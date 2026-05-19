import { AnimatePresence, motion } from 'framer-motion'
import {
  type AliceExpression,
  getExpressionImages,
} from '@/assets/alice'
import AliceCharacter from '@/assets/alice-character.png'

interface CharacterSpriteProps {
  expression: AliceExpression | null
  isSpeaking?: boolean
  onClick?: () => void
}

// 获取艾莉丝对应表情的图片
function getAliceImage(expression: AliceExpression | null): string {
  if (!expression) return AliceCharacter
  const images = getExpressionImages()
  return images[expression] || AliceCharacter
}

export function CharacterSprite({
  expression,
  isSpeaking = false,
  onClick,
}: CharacterSpriteProps) {
  return (
    <div
      className="absolute z-10 cursor-pointer select-none left-1/2 -translate-x-1/2 pointer-events-none"
      style={{
        bottom: '22%',
        maxHeight: '65vh',
      }}
    >
      {/* 立绘主体 */}
      <motion.div
        className="character-sprite relative pointer-events-auto cursor-pointer"
        animate={{
          y: isSpeaking ? [0, -5, 0] : 0,
        }}
        transition={{
          duration: 0.3,
          ease: 'easeOut',
        }}
        onClick={onClick}
      >
        <AnimatePresence mode="wait">
          <motion.img
            key={expression || 'default'}
            src={getAliceImage(expression)}
            alt="艾莉丝"
            className="w-auto h-auto max-h-[60vh] md:max-h-[65vh] object-contain"
            style={{
              filter: 'drop-shadow(0 4px 16px rgba(180, 120, 100, 0.12))',
            }}
            initial={{ opacity: 0.6, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0.4, scale: 0.97 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            draggable={false}
          />
        </AnimatePresence>

        {/* 脚下柔和阴影 */}
        <div
          className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-[60%] h-4 rounded-[50%]"
          style={{
            background: 'radial-gradient(ellipse, rgba(160, 120, 100, 0.08) 0%, transparent 70%)',
          }}
        />
      </motion.div>
    </div>
  )
}
