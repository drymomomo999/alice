import { useEffect, useState } from 'react'
import { SakuraPetals } from '@/components/ui/gal-decorations'
import roomBg from '@/assets/room-bg.jpg'

// 漂浮微尘粒子 — 暖光版
function DustParticles({ count = 12 }: { count?: number }) {
  const [particles, setParticles] = useState<Array<{
    id: number
    left: number
    top: number
    size: number
    delay: number
    duration: number
  }>>([])

  useEffect(() => {
    setParticles(
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 80,
        size: 1.5 + Math.random() * 2.5,
        delay: Math.random() * 8,
        duration: 6 + Math.random() * 8,
      }))
    )
  }, [count])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[5]">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full animate-float"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: 'rgba(255, 220, 200, 0.5)',
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            boxShadow: '0 0 6px rgba(255, 200, 180, 0.4)',
          }}
        />
      ))}
    </div>
  )
}

export function RoomBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* 背景图片 — 完整的房间场景 */}
      <img
        src={roomBg}
        alt="艾莉丝的小屋"
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* 暖光叠加 — 让整体色调更温馨 */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 65% 25%, rgba(255, 220, 190, 0.06) 0%, transparent 50%)',
        }}
      />

      {/* 樱花飘落 */}
      <SakuraPetals count={6} className="z-[6]" />

      {/* 微尘粒子 */}
      <DustParticles count={10} />
    </div>
  )
}
