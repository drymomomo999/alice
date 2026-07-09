import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useUserStore, useGoalsStore } from '@/store'
import { calculateDaysLeft } from '@/lib/utils'
import { cn } from '@/lib/utils'
import AliceHappy from '@/assets/alice/alice-happy.png'
import AliceShy from '@/assets/alice/alice-shy.png'
import AliceThinking from '@/assets/alice/alice-thinking.png'
import AliceSleepy from '@/assets/alice/alice-sleepy.png'
import AliceProud from '@/assets/alice/alice-proud.png'
// 根据时段选择艾莉丝表情
function getExpressionByTime(): string {
  const hour = new Date().getHours()
  if (hour < 6) return AliceSleepy
  if (hour < 9) return AliceThinking
  if (hour < 12) return AliceHappy
  if (hour < 14) return AliceHappy
  if (hour < 18) return AliceProud
  if (hour < 22) return AliceShy
  return AliceSleepy
}

function getTimeGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '深夜了，注意休息哦~'
  if (hour < 9) return '早安！新的一天从这里开始'
  if (hour < 12) return '上午好！趁着精神好努力一下~'
  if (hour < 14) return '午后时光，继续加油吧'
  if (hour < 18) return '下午了，保持专注~'
  if (hour < 22) return '傍晚好，今天收获如何？'
  return '晚上好，今天辛苦了！'
}

// 艾莉丝的问候语（根据时段和用户状态）
function getAliceGreeting(nickname: string, activeGoals: number, completedGoals: number): string {
  const hour = new Date().getHours()
  if (activeGoals === 0) {
    return `欢迎回来，${nickname}。目前还没有新的目标呢……需要我帮你规划方向吗？🌸`
  }
  if (hour < 9) {
    return `早安，${nickname}。今日的计划已经准备就绪，请随时开始。🌹`
  }
  if (hour < 18) {
    return `${nickname}，您还有 ${activeGoals} 项目标正在进行中。需要我为您整理优先级吗？`
  }
  if (completedGoals > 0) {
    return `${nickname}，今天也辛苦了。您已经完成了 ${completedGoals} 项目标，这是值得嘉奖的。✨`
  }
  return `${nickname}，您回来了。今日还有未完成的计划，要继续吗？`
}

export function HomePage() {
  const { user } = useUserStore()
  const { goals } = useGoalsStore()

  const activeGoals = goals.filter(g => g.status === 'active')
  const completedGoals = goals.filter(g => g.status === 'completed')

  const nickname = user?.nickname || '来访者'
  const timeGreeting = getTimeGreeting()
  const aliceExpression = getExpressionByTime()
  const aliceGreeting = getAliceGreeting(nickname, activeGoals.length, completedGoals.length)

  // 菜单项
  const menuItems = [
    { label: '目  标', sub: 'Goals', path: '/goals', icon: '🎯' },
    { label: '小  屋', sub: 'Room', path: '/room', icon: '✨' },
    { label: '个  人', sub: 'Profile', path: '/profile', icon: '👤' },
  ]

  // 当前悬停的菜单项
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  return (
    <div className="h-full w-full flex overflow-hidden relative">
      {/* === 背景层：渐变 + 装饰 === */}
      <div className="absolute inset-0 bg-gradient-to-br from-sakura-pale/40 via-white to-lavender-light/30" />
      <div className="absolute top-[-10%] right-[10%] w-[400px] h-[400px] rounded-full bg-sakura-pink/8 blur-[100px]" />
      <div className="absolute bottom-[-10%] left-[5%] w-[300px] h-[300px] rounded-full bg-lavender/8 blur-[80px]" />

      {/* === 右侧：艾莉丝立绘 === */}
      <div className="absolute right-0 bottom-0 flex items-end justify-end pointer-events-none select-none" style={{ width: '55%', height: '100%' }}>
        <motion.img
          src={aliceExpression}
          alt="艾莉丝"
          className="h-[95%] object-contain object-bottom drop-shadow-2xl"
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          draggable={false}
        />
      </div>

      {/* === 左侧：主内容区 === */}
      <div className="relative z-10 flex flex-col justify-between h-full w-[45%] min-w-[320px] px-8 py-8">

        {/* 顶部：问候 + Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-sm text-muted-foreground/70 font-medium mb-1">{timeGreeting}</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            {nickname}
          </h1>
          <div className="flex items-center gap-3 mt-3">
            <span className="px-3 py-1 rounded-full bg-sakura-pale/70 text-sakura text-xs font-bold border border-sakura-light/40">
              🎯 {activeGoals.length} 进行中
            </span>
          </div>
        </motion.div>

        {/* 中部：艾莉丝对话气泡 */}
        <motion.div
          className="my-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <div className="relative bg-white/85 backdrop-blur-md rounded-2xl border border-sakura-light/40 shadow-lg shadow-sakura-pink/6 px-5 py-4 max-w-[90%]">
            {/* 气泡尖角 */}
            <div className="absolute -right-2 top-5 w-4 h-4 bg-white/85 border-r border-t border-sakura-light/40 transform rotate-45" />
            <p className="text-sm text-foreground/90 leading-relaxed italic">
              「{aliceGreeting}」
            </p>
            <p className="text-[10px] text-sakura/60 mt-2 font-medium">— 艾莉丝</p>
          </div>
        </motion.div>

        {/* 菜单 */}
        <motion.div
          className="space-y-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          {menuItems.map((item, idx) => (
            <motion.div
              key={item.path}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + idx * 0.1, duration: 0.4 }}
            >
              <Link
                to={item.path}
                className="group block"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <div className={cn(
                  'flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all duration-300',
                  hoveredIndex === idx
                    ? 'bg-sakura-pink/10 border-sakura-pink/30 shadow-md shadow-sakura-pink/8 -translate-x-1'
                    : 'bg-white/50 border-sakura-light/20 hover:bg-white/70 hover:border-sakura-light/40'
                )}>
                  <span className="text-2xl">{item.icon}</span>
                  <div className="flex-1">
                    <span className="text-lg font-bold text-foreground tracking-widest">{item.label}</span>
                    <span className="text-xs text-muted-foreground/50 ml-3 font-mono">{item.sub}</span>
                  </div>
                  <motion.span
                    className="text-sakura text-lg"
                    animate={{ x: hoveredIndex === idx ? 0 : -8, opacity: hoveredIndex === idx ? 1 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    →
                  </motion.span>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        {/* 底部：进行中目标预览 */}
        {activeGoals.length > 0 && (
          <motion.div
            className="mt-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.4 }}
          >
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-sakura-light/25 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-muted-foreground">当前目标</span>
                <Link to="/goals" className="text-[10px] text-sakura font-semibold hover:underline">查看全部 →</Link>
              </div>
              {activeGoals.slice(0, 2).map(goal => {
                const daysLeft = calculateDaysLeft(goal.endDate)
                return (
                  <div key={goal.id} className="py-2 border-b border-sakura-light/15 last:border-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-foreground truncate max-w-[70%]">{goal.title}</span>
                      <span className={cn(
                        'text-[10px] font-bold',
                        daysLeft <= 3 ? 'text-red-400' : 'text-muted-foreground'
                      )}>
                        {daysLeft > 0 ? `${daysLeft}天` : '逾期'}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-sakura-pale overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sakura-pink to-peach-orange transition-all"
                        style={{ width: `${goal.progress}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* 没有目标时的引导 */}
        {activeGoals.length === 0 && (
          <motion.div
            className="mt-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.4 }}
          >
            <Link to="/goals">
              <div className="bg-gradient-to-r from-sakura-pink/10 to-peach-orange/10 border border-sakura-pink/20 rounded-2xl p-4 text-center hover:from-sakura-pink/15 hover:to-peach-orange/15 transition-all">
                <p className="text-xs text-muted-foreground mb-1">还没有进行中的目标</p>
                <p className="text-sm font-bold text-sakura">创建第一个目标 →</p>
              </div>
            </Link>
          </motion.div>
        )}
      </div>

    </div>
  )
}
