/**
 * CG 展示弹窗 — 目标完成后展示特殊立绘
 *
 * 全屏覆盖层，展示艾莉丝 CG 立绘，支持保存到本地。
 * 类似 Galgame 的 CG 收集体验。
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, Sparkles } from 'lucide-react'

// 五张 CG 合集，目标完成时随机选取一张
const CG_MODULES = import.meta.glob<{ default: string }>(
  '@/assets/alice/cg-*.jpg',
  { eager: true }
)

const CG_POOL = Object.values(CG_MODULES).map(m => m.default)

function pickRandomCG(): string {
  return CG_POOL[Math.floor(Math.random() * CG_POOL.length)]
}

// ---- 飘落花瓣粒子 ----
function FallingPetal({ delay, x, size, rotation }: {
  delay: number; x: number; size: number; rotation: number
}) {
  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left: `${x}%`,
        top: '-5%',
        fontSize: `${size}px`,
        opacity: 0.7,
      }}
      initial={{ y: '-10%', rotate: 0, opacity: 0 }}
      animate={{
        y: '105vh',
        rotate: rotation,
        opacity: [0, 0.7, 0.6, 0],
      }}
      transition={{
        duration: 4 + delay * 3,
        delay,
        ease: 'linear',
        repeat: Infinity,
        repeatDelay: 1,
      }}
    >
      🌸
    </motion.div>
  )
}

function FallingPetals() {
  const petals = Array.from({ length: 15 }, (_, i) => ({
    id: i,
    delay: Math.random() * 2,
    x: Math.random() * 100,
    size: 12 + Math.random() * 14,
    rotation: 180 + Math.random() * 360,
  }))

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
      {petals.map(p => (
        <FallingPetal key={p.id} {...p} />
      ))}
    </div>
  )
}

// ---- 闪光粒子 ----
function SparkleParticle({ delay, x, y }: { delay: number; x: number; y: number }) {
  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{ left: `${x}%`, top: `${y}%` }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{
        scale: [0, 1, 0],
        opacity: [0, 1, 0],
      }}
      transition={{
        duration: 1.5,
        delay,
        repeat: Infinity,
        repeatDelay: 2 + Math.random(),
      }}
    >
      <Sparkles className="text-sakura-pink/60" size={10 + Math.random() * 8} />
    </motion.div>
  )
}

// ---- 主弹窗 ----
interface CgDialogProps {
  open: boolean
  onClose: () => void
  goalTitle: string
}

export function CgDialog({ open, onClose, goalTitle }: CgDialogProps) {
  const [isImageLoaded, setIsImageLoaded] = useState(false)
  const [showUI, setShowUI] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // 每次弹窗时随机选一张 CG（open 变化时重新选取，不变化时保持同一张）
  const cgImage = useMemo(() => pickRandomCG(), [open])

  // 图片加载后延迟显示 UI
  useEffect(() => {
    if (open) {
      setIsImageLoaded(false)
      setShowUI(false)
      setSaveMessage(null)
    }
  }, [open])

  const handleImageLoad = useCallback(() => {
    setIsImageLoaded(true)
    // 渐次动画：图片 → UI
    setTimeout(() => setShowUI(true), 400)
  }, [])

  // 保存 CG 到本地
  const handleSaveCG = useCallback(async () => {
    setIsSaving(true)
    try {
      // 优先使用原生下载方式
      const response = await fetch(cgImage)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `QuestMind_CG_${goalTitle.replace(/[<>:"/\\|?*]/g, '_')}.jpg`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setSaveMessage('CG 已保存！')
      setTimeout(() => setSaveMessage(null), 2500)
    } catch {
      // 降级：直接在新窗口打开
      window.open(cgImage, '_blank')
      setSaveMessage('请右键保存图片')
      setTimeout(() => setSaveMessage(null), 2500)
    } finally {
      setIsSaving(false)
    }
  }, [goalTitle])

  // ESC 关闭
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* 暗色背景遮罩 */}
          <motion.div
            className="absolute inset-0 bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.88 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* 飘落花瓣 */}
          <FallingPetals />

          {/* 闪光粒子 */}
          <div className="absolute inset-0 pointer-events-none z-10">
            {Array.from({ length: 12 }, (_, i) => (
              <SparkleParticle
                key={i}
                delay={Math.random() * 2}
                x={10 + Math.random() * 80}
                y={10 + Math.random() * 80}
              />
            ))}
          </div>

          {/* CG 图片 */}
          <motion.div
            className="relative z-20 flex flex-col items-center max-w-[90vw] max-h-[90vh]"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{
              opacity: isImageLoaded ? 1 : 0,
              scale: isImageLoaded ? 1 : 0.85,
            }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            {/* 图片容器 */}
            <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-sakura-pink/20 border-2 border-white/10">
              <img
                src={cgImage}
                alt="目标达成 CG"
                onLoad={handleImageLoad}
                className="max-h-[75vh] max-w-[85vw] object-contain"
                style={{ display: isImageLoaded ? 'block' : 'none' }}
              />

              {/* 加载占位 */}
              {!isImageLoaded && (
                <div className="w-[400px] h-[500px] flex items-center justify-center bg-white/5">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                  >
                    <Sparkles className="w-8 h-8 text-sakura-pink/60" />
                  </motion.div>
                </div>
              )}
            </div>

            {/* UI 层 — 标题 + 按钮 */}
            <AnimatePresence>
              {showUI && (
                <motion.div
                  className="flex flex-col items-center gap-4 mt-6"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                >
                  {/* CG GET 标题 */}
                  <motion.div
                    className="flex items-center gap-3"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 15 }}
                  >
                    <Sparkles className="w-5 h-5 text-sakura-pink" />
                    <h2 className="text-2xl font-extrabold bg-gradient-to-r from-sakura-pink via-peach-orange to-lavender bg-clip-text text-transparent">
                      CG GET!
                    </h2>
                    <Sparkles className="w-5 h-5 text-lavender" />
                  </motion.div>

                  {/* 目标名称 */}
                  <p className="text-white/80 text-sm font-medium text-center max-w-md leading-relaxed">
                    恭喜完成目标「{goalTitle}」
                  </p>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-3 mt-2">
                    {/* 保存 CG */}
                    <motion.button
                      onClick={handleSaveCG}
                      disabled={isSaving}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`
                        px-6 py-2.5 rounded-full text-sm font-bold
                        flex items-center gap-2
                        transition-all duration-300
                        ${saveMessage
                          ? 'bg-green-500/20 text-green-300 border border-green-400/30'
                          : 'bg-gradient-to-r from-sakura-pink to-peach-orange text-white shadow-lg shadow-sakura-pink/25 hover:shadow-sakura-pink/40'
                        }
                      `}
                    >
                      {isSaving ? (
                        <motion.span
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          ⏳
                        </motion.span>
                      ) : saveMessage ? (
                        '✅'
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      {saveMessage || (isSaving ? '保存中...' : '保存 CG')}
                    </motion.button>

                    {/* 关闭 */}
                    <motion.button
                      onClick={onClose}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-5 py-2.5 rounded-full text-sm font-medium
                        bg-white/10 text-white/80 hover:bg-white/20 border border-white/15
                        flex items-center gap-1.5 transition-all"
                    >
                      <X className="w-4 h-4" />
                      关闭
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
