import { useEffect, useState } from 'react'
import { SakuraPetals } from '@/components/ui/gal-decorations'

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
        top: Math.random() * 80, // 限制在上部80%
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

// 窗户 — 阳光洒入的温暖窗
function WindowDecor() {
  return (
    <svg
      className="absolute top-[6%] right-[6%] w-[20%] h-[32%] z-[3]"
      viewBox="0 0 140 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 窗外光晕 */}
      <ellipse cx="70" cy="100" rx="55" ry="80" fill="rgba(255, 240, 220, 0.25)" />
      <ellipse cx="70" cy="100" rx="35" ry="55" fill="rgba(255, 245, 230, 0.2)" />

      {/* 窗框 - 白色木质 */}
      <rect x="8" y="8" width="124" height="184" rx="6" stroke="rgba(180, 140, 110, 0.7)" strokeWidth="4" fill="rgba(255, 248, 240, 0.15)" />
      {/* 窗棂 - 竖线 */}
      <line x1="70" y1="8" x2="70" y2="192" stroke="rgba(180, 140, 110, 0.6)" strokeWidth="3" />
      {/* 窗棂 - 横线 */}
      <line x1="8" y1="100" x2="132" y2="100" stroke="rgba(180, 140, 110, 0.6)" strokeWidth="3" />

      {/* 窗帘 - 轻薄纱帘 */}
      <path d="M8 8 Q 35 50, 15 200 L 8 200 Z" fill="rgba(255, 230, 220, 0.2)" />
      <path d="M132 8 Q 105 50, 125 200 L 132 200 Z" fill="rgba(255, 230, 220, 0.2)" />
    </svg>
  )
}

// 书架 — 更大更详细的木质书架
function BookshelfDecor() {
  return (
    <svg
      className="absolute bottom-[28%] right-[2%] w-[18%] h-[45%] z-[2]"
      viewBox="0 0 120 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 书架侧板 */}
      <rect x="3" y="3" width="114" height="274" rx="3" fill="rgba(139, 90, 43, 0.12)" stroke="rgba(139, 90, 43, 0.35)" strokeWidth="2" />

      {/* 隔板 */}
      <line x1="3" y1="70" x2="117" y2="70" stroke="rgba(139, 90, 43, 0.4)" strokeWidth="2.5" />
      <line x1="3" y1="140" x2="117" y2="140" stroke="rgba(139, 90, 43, 0.4)" strokeWidth="2.5" />
      <line x1="3" y1="210" x2="117" y2="210" stroke="rgba(139, 90, 43, 0.4)" strokeWidth="2.5" />

      {/* 第一层书 */}
      <rect x="12" y="15" width="8" height="50" rx="2" fill="rgba(220, 100, 100, 0.5)" />
      <rect x="22" y="22" width="10" height="43" rx="2" fill="rgba(100, 140, 200, 0.5)" />
      <rect x="34" y="12" width="7" height="53" rx="2" fill="rgba(100, 180, 120, 0.5)" />
      <rect x="43" y="18" width="9" height="47" rx="2" fill="rgba(200, 160, 80, 0.5)" />
      <rect x="54" y="14" width="8" height="51" rx="2" fill="rgba(180, 100, 160, 0.5)" />
      <rect x="64" y="20" width="6" height="45" rx="2" fill="rgba(120, 180, 180, 0.5)" />
      <rect x="73" y="10" width="10" height="55" rx="2" fill="rgba(200, 120, 100, 0.5)" />

      {/* 第二层书 */}
      <rect x="12" y="80" width="10" height="55" rx="2" fill="rgba(100, 100, 180, 0.5)" />
      <rect x="24" y="88" width="7" height="47" rx="2" fill="rgba(200, 140, 80, 0.5)" />
      <rect x="33" y="78" width="9" height="57" rx="2" fill="rgba(80, 160, 130, 0.5)" />
      <rect x="44" y="85" width="6" height="50" rx="2" fill="rgba(180, 80, 120, 0.5)" />
      <rect x="52" y="80" width="11" height="55" rx="2" fill="rgba(160, 140, 60, 0.5)" />
      {/* 小植物装饰 */}
      <circle cx="82" cy="127" r="10" fill="rgba(100, 180, 120, 0.35)" />
      <rect x="78" y="128" width="8" height="10" rx="2" fill="rgba(180, 140, 100, 0.4)" />

      {/* 第三层书 */}
      <rect x="12" y="150" width="9" height="55" rx="2" fill="rgba(160, 120, 180, 0.5)" />
      <rect x="23" y="158" width="7" height="47" rx="2" fill="rgba(180, 80, 80, 0.5)" />
      <rect x="32" y="148" width="11" height="57" rx="2" fill="rgba(80, 140, 100, 0.5)" />
      <rect x="45" y="155" width="8" height="50" rx="2" fill="rgba(200, 180, 80, 0.5)" />
      <rect x="55" y="152" width="7" height="53" rx="2" fill="rgba(100, 160, 180, 0.5)" />
      <rect x="64" y="148" width="10" height="57" rx="2" fill="rgba(180, 120, 140, 0.5)" />
      {/* 小摆件 */}
      <circle cx="90" cy="200" r="8" fill="rgba(200, 160, 140, 0.4)" />

      {/* 第四层书 */}
      <rect x="12" y="220" width="8" height="48" rx="2" fill="rgba(140, 180, 100, 0.5)" />
      <rect x="22" y="225" width="10" height="43" rx="2" fill="rgba(180, 100, 160, 0.5)" />
      <rect x="34" y="218" width="7" height="50" rx="2" fill="rgba(100, 140, 180, 0.5)" />
      <rect x="43" y="224" width="9" height="44" rx="2" fill="rgba(200, 140, 100, 0.5)" />
      <rect x="54" y="220" width="8" height="48" rx="2" fill="rgba(160, 120, 80, 0.5)" />
    </svg>
  )
}

// 桌子 — 右侧小圆桌
function DeskDecor() {
  return (
    <svg
      className="absolute bottom-[22%] left-[3%] w-[15%] h-[25%] z-[2]"
      viewBox="0 0 120 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 桌面 */}
      <ellipse cx="60" cy="60" rx="52" ry="18" fill="rgba(160, 120, 80, 0.2)" stroke="rgba(139, 90, 43, 0.3)" strokeWidth="2" />
      {/* 桌腿 */}
      <line x1="35" y1="75" x2="30" y2="170" stroke="rgba(139, 90, 43, 0.3)" strokeWidth="3" />
      <line x1="85" y1="75" x2="90" y2="170" stroke="rgba(139, 90, 43, 0.3)" strokeWidth="3" />
      {/* 茶杯 */}
      <ellipse cx="50" cy="52" rx="10" ry="5" fill="rgba(220, 180, 160, 0.5)" stroke="rgba(180, 140, 110, 0.4)" strokeWidth="1.5" />
      <path d="M40 52 Q 38 42, 42 38 Q 50 34, 58 38 Q 62 42, 60 52" fill="rgba(255, 250, 245, 0.5)" stroke="rgba(180, 140, 110, 0.4)" strokeWidth="1" />
      {/* 茶杯热气 */}
      <path d="M48 36 Q 46 28, 50 24" stroke="rgba(200, 180, 160, 0.3)" strokeWidth="1" fill="none" />
      <path d="M53 34 Q 55 26, 52 22" stroke="rgba(200, 180, 160, 0.2)" strokeWidth="1" fill="none" />
    </svg>
  )
}

// 窗台植物
function WindowPlantDecor() {
  return (
    <svg
      className="absolute top-[34%] right-[5%] w-[8%] h-[10%] z-[4]"
      viewBox="0 0 60 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 花盆 */}
      <path d="M18 35 L 22 55 L 38 55 L 42 35 Z" fill="rgba(200, 140, 110, 0.5)" stroke="rgba(180, 120, 90, 0.4)" strokeWidth="1" />
      {/* 叶子 */}
      <ellipse cx="30" cy="25" rx="14" ry="16" fill="rgba(120, 180, 120, 0.35)" />
      <ellipse cx="22" cy="20" rx="10" ry="12" fill="rgba(100, 170, 110, 0.3)" transform="rotate(-20, 22, 20)" />
      <ellipse cx="38" cy="22" rx="10" ry="11" fill="rgba(110, 175, 115, 0.3)" transform="rotate(15, 38, 22)" />
      {/* 小花 */}
      <circle cx="26" cy="14" r="3" fill="rgba(255, 180, 180, 0.5)" />
      <circle cx="35" cy="16" r="2.5" fill="rgba(255, 200, 180, 0.4)" />
    </svg>
  )
}

// 地毯/垫子装饰
function RugDecor() {
  return (
    <svg
      className="absolute bottom-[8%] left-1/2 -translate-x-1/2 w-[35%] h-[12%] z-[1]"
      viewBox="0 0 200 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="100" cy="30" rx="95" ry="25" fill="rgba(240, 200, 190, 0.2)" stroke="rgba(220, 170, 160, 0.15)" strokeWidth="1" />
      <ellipse cx="100" cy="30" rx="75" ry="18" fill="rgba(250, 210, 200, 0.15)" />
      {/* 地毯花纹 */}
      <ellipse cx="100" cy="30" rx="55" ry="12" fill="none" stroke="rgba(230, 180, 170, 0.15)" strokeWidth="1" strokeDasharray="4 3" />
    </svg>
  )
}

export function RoomBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* 基底渐变 — 暖粉奶油色温馨小屋 */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 75% 20%, rgba(255, 230, 210, 0.3) 0%, transparent 50%),
            radial-gradient(ellipse at 25% 70%, rgba(240, 200, 180, 0.15) 0%, transparent 40%),
            radial-gradient(ellipse at 50% 40%, rgba(255, 240, 230, 0.2) 0%, transparent 60%),
            linear-gradient(180deg,
              #fdf5f0 0%,
              #fceee7 15%,
              #f8e5dd 30%,
              #f3ddd3 50%,
              #edd0c3 65%,
              #e5c4b5 80%,
              #dcc0b0 100%
            )
          `,
        }}
      />

      {/* 墙裙线 — 分隔墙壁和下半部分 */}
      <div
        className="absolute left-0 right-0 h-[2px] z-[2]"
        style={{
          top: '58%',
          background: 'linear-gradient(90deg, rgba(180, 140, 110, 0.15), rgba(180, 140, 110, 0.3), rgba(180, 140, 110, 0.15))',
        }}
      />

      {/* 下半墙壁 — 稍深的暖色护墙板效果 */}
      <div
        className="absolute left-0 right-0 bottom-0"
        style={{
          top: '58%',
          background: `
            linear-gradient(180deg,
              rgba(210, 175, 155, 0.08) 0%,
              rgba(200, 165, 145, 0.12) 50%,
              rgba(195, 160, 140, 0.15) 100%
            )
          `,
        }}
      />

      {/* 护墙板纹理 */}
      <div
        className="absolute left-0 right-0 bottom-0 opacity-[0.04]"
        style={{
          top: '58%',
          backgroundImage: `
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 40px,
              rgba(139, 90, 43, 1) 40px,
              rgba(139, 90, 43, 1) 41px
            )
          `,
        }}
      />

      {/* 墙纸纹理 — 淡淡的花纹 */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            radial-gradient(circle, rgba(200, 150, 130, 1) 1px, transparent 1px)
          `,
          backgroundSize: '30px 30px',
        }}
      />

      {/* 地板 */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[18%]"
        style={{
          background: `
            linear-gradient(180deg, rgba(180, 140, 100, 0.12) 0%, rgba(160, 120, 80, 0.18) 100%)
          `,
          borderTop: '1px solid rgba(160, 120, 80, 0.15)',
        }}
      />

      {/* 地板木纹 */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[18%] opacity-[0.05]"
        style={{
          backgroundImage: `
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 100px,
              rgba(120, 80, 40, 1) 100px,
              rgba(120, 80, 40, 1) 101px
            )
          `,
        }}
      />

      {/* 窗户阳光光斑 */}
      <div
        className="absolute z-[1]"
        style={{
          top: '15%',
          right: '8%',
          width: '25%',
          height: '40%',
          background: `
            radial-gradient(ellipse at 50% 50%,
              rgba(255, 240, 210, 0.2) 0%,
              rgba(255, 235, 200, 0.1) 40%,
              transparent 70%
            )
          `,
          filter: 'blur(30px)',
        }}
      />

      {/* SVG 装饰元素 */}
      <WindowDecor />
      <WindowPlantDecor />
      <BookshelfDecor />
      <DeskDecor />
      <RugDecor />

      {/* 顶部柔和阴影（天花板暗角） */}
      <div
        className="absolute top-0 left-0 right-0 h-[15%]"
        style={{
          background: 'linear-gradient(180deg, rgba(200, 160, 140, 0.06) 0%, transparent 100%)',
        }}
      />

      {/* 暖光效果 — 整体温馨感 */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 65% 25%, rgba(255, 220, 190, 0.1) 0%, transparent 50%)',
        }}
      />

      {/* 樱花飘落 */}
      <SakuraPetals count={6} className="z-[6]" />

      {/* 微尘粒子 */}
      <DustParticles count={10} />
    </div>
  )
}
