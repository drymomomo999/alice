import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Target, Bot, ArrowRight, LogIn, Sparkles, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUserStore } from '@/store'
import LogoImg from '@/assets/logo.png'

const features = [
  { 
    emoji: '🎯',
    title: '任务分解', 
    description: '将大目标拆解为可执行的子任务，一步一步稳稳推进', 
    bg: 'bg-sakura-pale/70',
    border: 'border-sakura-light/40',
  },
  { 
    emoji: '🤖',
    title: 'AI 伴侣', 
    description: '三位 AI 伙伴提供学习陪伴、监督与讨论', 
    bg: 'bg-lavender-light/40',
    border: 'border-purple-200/50',
  },
  { 
    emoji: '📚',
    title: '学习记录', 
    description: '自动记录学习进度与打卡，见证每一天的成长', 
    bg: 'bg-amber-50',
    border: 'border-amber-200/50',
  },
  { 
    emoji: '💫',
    title: '激励引擎', 
    description: '金币、钻石等资源激励，让学习充满动力', 
    bg: 'bg-green-50',
    border: 'border-green-200/50',
  },
]

export function WelcomePage() {
  const navigate = useNavigate()
  const { loginDemo, isAuthenticated } = useUserStore()

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, navigate])

  const handleStart = () => {
    loginDemo()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-sakura-base flex items-center justify-center p-6 relative overflow-hidden">
      {/* === Background Decoration === */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] rounded-full bg-sakura-pale/60 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[15%] w-[400px] h-[400px] rounded-full bg-lavender-light/50 blur-[80px]" />
        <div className="absolute top-[40%] left-[-5%] w-[300px] h-[300px] rounded-full bg-peach-light/30 blur-[60px]" />

        {/* Floating petals */}
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute text-lg opacity-30"
            style={{
              left: `${10 + i * 12}%`,
              top: `${10 + (i % 4) * 22}%`,
              animation: `floatSlow ${5 + i * 1.2}s ease-in-out infinite`,
              animationDelay: `${i * 0.8}s`,
            }}
          >
            🌸
          </div>
        ))}
      </div>

      <div className="w-full max-w-2xl relative z-10">
        {/* === Logo & Title === */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-5">
            <div className="relative">
              <div className="w-20 h-20 rounded-3xl shadow-2xl shadow-sakura-pink/25 relative overflow-hidden animate-float-slow">
                <img src={LogoImg} alt="QuestMind" className="w-full h-full object-cover" />
              </div>
              <div className="absolute -top-1.5 -right-1.5 text-xl animate-heartbeat">⭐</div>
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
            <span className="text-sakura">Quest</span><span className="text-foreground">Mind</span>
          </h1>

          <p className="text-base text-muted-foreground font-medium">
            🌸 AI 陪伴式学习平台
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            — Powered by DeepSeek AI —
          </p>

          {/* Decorative divider */}
          <div className="flex items-center justify-center gap-3 mt-5">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-sakura-light" />
            <span className="text-sakura-light text-base">🌸</span>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-sakura-light" />
          </div>
        </div>

        {/* === Feature Cards === */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className={`p-4 rounded-2xl border ${feature.bg} ${feature.border} hover:shadow-md hover:-translate-y-0.5 transition-all duration-250 cursor-default animate-in`}
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <div className="text-2xl mb-2">{feature.emoji}</div>
              <h3 className="font-bold text-sm text-foreground mb-1">{feature.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* === CTA Section === */}
        <div className="space-y-3">
          {/* Primary CTA */}
          <button
            onClick={handleStart}
            className="btn-gal w-full h-13 flex items-center justify-center gap-2 text-sm"
          >
            <span>✨</span>
            立即开始 · 体验模式
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 px-4">
            <div className="flex-1 h-px bg-sakura-light/40" />
            <span className="text-xs text-muted-foreground">或者</span>
            <div className="flex-1 h-px bg-sakura-light/40" />
          </div>

          {/* Secondary CTA */}
          <button
            className="btn-outline w-full h-12 flex items-center justify-center gap-2 text-sm"
            onClick={() => navigate('/login')}
          >
            <LogIn className="w-4 h-4" />
            登录 / 注册账号
          </button>

          <p className="text-[11px] text-muted-foreground text-center pt-1">
            账号登录后数据同步至云端 · 支持 Supabase 认证
          </p>
        </div>

        {/* === Footer === */}
        <div className="mt-10 text-center">
          <p className="text-sm text-muted-foreground font-medium">
            🌸 有人陪伴 · 有目标可追 · 有未来可期
          </p>
        </div>
      </div>
    </div>
  )
}
