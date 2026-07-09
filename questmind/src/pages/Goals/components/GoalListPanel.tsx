/**
 * 左栏：目标列表面板
 */
import { Plus, Search } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { calculateDaysLeft, cn } from '@/lib/utils'
import type { Goal } from '@/types'
import AliceCharacter from '@/assets/alice-character.png'

// 分类配置（与主页面共享）
export const categoryConfig: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  study: { label: '学习', emoji: '📚', color: 'text-sakura', bg: 'bg-sakura-pale' },
  health: { label: '健康', emoji: '💪', color: 'text-green-500', bg: 'bg-green-50' },
  career: { label: '职业', emoji: '💼', color: 'text-lavender', bg: 'bg-lavender-light/30' },
  skill: { label: '技能', emoji: '⚡', color: 'text-peach', bg: 'bg-amber-50' },
  hobby: { label: '兴趣', emoji: '🎨', color: 'text-sky', bg: 'bg-sky-50' },
  custom: { label: '自定义', emoji: '🌟', color: 'text-amber-500', bg: 'bg-amber-50' },
}

export const priorityConfig: Record<string, { label: string; dot: string; color: string }> = {
  high: { label: '高', dot: 'bg-red-400', color: 'text-red-400' },
  medium: { label: '中', dot: 'bg-amber-400', color: 'text-amber-500' },
  low: { label: '低', dot: 'bg-green-400', color: 'text-green-500' },
}

interface GoalListPanelProps {
  goals: Goal[]
  selectedGoalId: string | null
  searchQuery: string
  onSearchChange: (query: string) => void
  onSelectGoal: (goalId: string | null) => void
  onNewGoal: () => void
  onSmartCreate: () => void
}

export function GoalListPanel({
  goals, selectedGoalId, searchQuery,
  onSearchChange, onSelectGoal, onNewGoal, onSmartCreate,
}: GoalListPanelProps) {

  // 搜索过滤
  const filteredGoals = goals.filter(g => {
    if (searchQuery && !g.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  return (
    <div className="w-80 shrink-0 flex flex-col rounded-2xl border border-sakura-light/30 bg-white/90 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-sakura-light/20 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold text-base text-foreground flex items-center gap-2">
            <span>🎯</span>目标列表
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onNewGoal}
              className="p-1.5 rounded-lg bg-sakura-pale text-sakura hover:bg-sakura-pink/15 transition-all"
              title="新建目标"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={onSmartCreate}
              className="p-1 rounded-lg bg-lavender-light/30 text-lavender hover:bg-lavender-light/50 transition-all"
              title="艾莉丝 AI 创建"
            >
              <div className="w-5 h-5 rounded overflow-hidden">
                <img src={AliceCharacter} alt="艾莉丝" className="w-full h-full object-cover" />
              </div>
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text" placeholder="搜索目标..."
            value={searchQuery} onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-sakura-pale/30 border border-sakura-light/30 placeholder:text-muted-foreground focus:border-sakura-pink focus:outline-none focus:ring-2 focus:ring-sakura-pink/20 transition-all"
          />
        </div>
        {/* Stats mini */}
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1 text-sakura font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-sakura-pink" />
            {goals.filter(g => g.status === 'active').length} 进行中
          </span>
          <span className="flex items-center gap-1 text-green-500 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            {goals.filter(g => g.status === 'completed').length} 已完成
          </span>
        </div>
      </div>

      {/* Goal rows */}
      <ScrollArea className="flex-1">
        {filteredGoals.length > 0 ? (
          <div className="p-2 space-y-1">
            {filteredGoals.map(goal => {
              const catCfg = categoryConfig[goal.category || 'study'] || categoryConfig.study
              const pCfg = priorityConfig[goal.priority] || priorityConfig.medium
              const daysLeft = calculateDaysLeft(goal.endDate)
              const isActive = selectedGoalId === goal.id

              return (
                <button
                  key={goal.id}
                  onClick={() => onSelectGoal(isActive ? null : goal.id)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-xl transition-all group',
                    isActive
                      ? 'bg-gradient-to-r from-sakura-pink/10 to-lavender/5 border border-sakura-light/50 shadow-sm'
                      : 'hover:bg-sakura-pale/40 border border-transparent'
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0', catCfg.bg)}>
                      {catCfg.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          'text-sm font-semibold truncate',
                          goal.status === 'completed' ? 'text-muted-foreground line-through' : 'text-foreground'
                        )}>
                          {goal.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', pCfg.dot)} />
                        <div className="flex-1 h-1.5 rounded-full bg-sakura-pale overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-500',
                              goal.status === 'completed' ? 'bg-green-400' : 'bg-gradient-to-r from-sakura-pink to-peach-orange'
                            )}
                            style={{ width: `${goal.progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-muted-foreground tabular-nums w-7 text-right">{goal.progress}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 ml-[42px]">
                    <span className={cn('text-[10px] font-medium', pCfg.color)}>{pCfg.label}</span>
                    <span className="text-[10px] text-muted-foreground/60">·</span>
                    <span className={cn(
                      'text-[10px] font-medium',
                      daysLeft <= 3 && daysLeft > 0 ? 'text-red-400' :
                      daysLeft <= 0 ? 'text-red-400' : 'text-muted-foreground'
                    )}>
                      {daysLeft > 0 ? `剩${daysLeft}天` : '逾期'}
                    </span>
                    {goal.status === 'completed' && (
                      <span className="text-[10px] font-semibold text-green-500">✓ 已完成</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="p-6 text-center">
            <div className="text-4xl mb-3 animate-bounce-gentle">🎯</div>
            <p className="text-sm text-muted-foreground">
              {goals.length === 0 ? '还没有目标，点击上方 + 创建' : '没有匹配的结果'}
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
