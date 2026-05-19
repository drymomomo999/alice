import { useEffect, useState } from 'react'

interface FloatingHeartsProps {
  count?: number
  color?: string
  className?: string
}

export function FloatingHearts({ count = 5, color = 'hsl(var(--sakura-pink))', className = '' }: FloatingHeartsProps) {
  const [hearts, setHearts] = useState<Array<{ id: number; left: number; delay: number; size: number }>>([])

  useEffect(() => {
    const newHearts = Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 5,
      size: 0.5 + Math.random() * 0.5
    }))
    setHearts(newHearts)
  }, [count])

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {hearts.map((heart) => (
        <div
          key={heart.id}
          className="absolute animate-float"
          style={{
            left: `${heart.left}%`,
            bottom: '-20px',
            animationDelay: `${heart.delay}s`,
            animationDuration: `${8 + heart.delay}s`,
            fontSize: `${heart.size}rem`,
            opacity: 0.4,
            color
          }}
        >
          ❤
        </div>
      ))}
    </div>
  )
}

interface SakuraPetalsProps {
  count?: number
  className?: string
}

export function SakuraPetals({ count = 12, className = '' }: SakuraPetalsProps) {
  const [petals, setPetals] = useState<Array<{
    id: number
    left: number
    delay: number
    duration: number
    size: number
    opacity: number
  }>>([])

  useEffect(() => {
    const newPetals = Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 10,
      duration: 8 + Math.random() * 8,
      size: 8 + Math.random() * 8,
      opacity: 0.2 + Math.random() * 0.4
    }))
    setPetals(newPetals)
  }, [count])

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {petals.map((petal) => (
        <div
          key={petal.id}
          className="sakura-petal"
          style={{
            left: `${petal.left}%`,
            width: petal.size,
            height: petal.size,
            animationDuration: `${petal.duration}s`,
            animationDelay: `${petal.delay}s`,
            opacity: petal.opacity,
            background: `linear-gradient(135deg, hsl(340 85% 80%) 0%, hsl(330 90% 75%) 100%)`
          }}
        />
      ))}
    </div>
  )
}

interface SparklesProps {
  count?: number
  className?: string
}

export function Sparkles({ count = 8, className = '' }: SparklesProps) {
  const [sparkles, setSparkles] = useState<Array<{ id: number; left: number; top: number; delay: number }>>([])

  useEffect(() => {
    const newSparkles = Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 3
    }))
    setSparkles(newSparkles)
  }, [count])

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      {sparkles.map((sparkle) => (
        <div
          key={sparkle.id}
          className="absolute animate-twinkle"
          style={{
            left: `${sparkle.left}%`,
            top: `${sparkle.top}%`,
            animationDelay: `${sparkle.delay}s`,
            color: 'hsl(var(--gold-accent))',
            opacity: 0.7
          }}
        >
          ✦
        </div>
      ))}
    </div>
  )
}

interface DecorativeBorderProps {
  children: React.ReactNode
  className?: string
  variant?: 'full' | 'top' | 'bottom'
}

export function DecorativeBorder({ children, className = '', variant = 'full' }: DecorativeBorderProps) {
  return (
    <div className={`relative ${className}`}>
      {variant === 'full' && (
        <div className="absolute -inset-1 bg-gradient-to-r from-pink-300 via-rose-300 to-purple-300 rounded-2xl opacity-40 blur-sm" />
      )}
      {variant === 'top' && (
        <div className="absolute -top-1 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-pink-400 to-transparent opacity-60" />
      )}
      {variant === 'bottom' && (
        <div className="absolute -bottom-1 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-rose-400 to-transparent opacity-60" />
      )}
      <div className="relative bg-white/90 backdrop-blur-sm rounded-xl">
        {children}
      </div>
    </div>
  )
}

interface RibbonProps {
  children: React.ReactNode
  className?: string
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
}

export function Ribbon({ children, className = '', position = 'top-left' }: RibbonProps) {
  const positionClasses = {
    'top-left': '-top-3 -left-3',
    'top-right': '-top-3 -right-3',
    'bottom-left': '-bottom-3 -left-3',
    'bottom-right': '-bottom-3 -right-3'
  }

  return (
    <div className={`relative inline-block ${className}`}>
      <div className={`absolute ${positionClasses[position]} w-16 h-16 overflow-hidden`}>
        <div
          className="absolute w-[141%] h-[141%] bg-gradient-to-br from-pink-400 to-rose-500"
          style={{
            transform: `rotate(${
              position === 'top-left' ? '-45' :
              position === 'top-right' ? '45' :
              position === 'bottom-left' ? '45' : '-45'
            }deg)`,
            transformOrigin: position.includes('top') ? 'bottom' : 'top'
          }}
        />
      </div>
      <div className="relative pt-6 pr-6">
        {children}
      </div>
    </div>
  )
}

interface GlowingTextProps {
  children: React.ReactNode
  className?: string
  color?: string
}

export function GlowingText({ children, className = '', color = 'hsl(var(--sakura-pink))' }: GlowingTextProps) {
  return (
    <span
      className={`text-glow ${className}`}
      style={{
        textShadow: `0 0 15px ${color}, 0 0 30px ${color}, 0 0 45px ${color}`
      }}
    >
      {children}
    </span>
  )
}

interface HeartBeatProps {
  children: React.ReactNode
  className?: string
  active?: boolean
}

export function HeartBeat({ children, className = '', active = true }: HeartBeatProps) {
  if (!active) return <>{children}</>

  return (
    <span className={`inline-block animate-pulse-soft ${className}`}>
      {children}
    </span>
  )
}

interface GalTitleProps {
  children: React.ReactNode
  className?: string
}

export function GalTitle({ children, className = '' }: GalTitleProps) {
  return (
    <h1
      className={`text-3xl font-bold text-center relative inline-block ${className}`}
      style={{ color: 'hsl(var(--sakura-dark))' }}
    >
      <span className="relative z-10">{children}</span>
      <span className="absolute -bottom-1 left-0 right-0 h-3 bg-gradient-to-r from-transparent via-pink-300/50 to-transparent" />
    </h1>
  )
}

// Loading indicator with Sakura style
export function SakuraLoading({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'gap-1',
    md: 'gap-1.5',
    lg: 'gap-2'
  }
  const dotSizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5'
  }

  return (
    <div className={`loading-sakura ${sizeClasses[size]}`}>
      <span className={`${dotSizes[size]} bg-gradient-to-r from-pink-400 to-rose-500`} />
      <span className={`${dotSizes[size]} bg-gradient-to-r from-pink-400 to-rose-500`} />
      <span className={`${dotSizes[size]} bg-gradient-to-r from-pink-400 to-rose-500`} />
    </div>
  )
}
