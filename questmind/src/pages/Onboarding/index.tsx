import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  User, 
  Camera, 
  Sun, 
  Moon, 
  Clock, 
  BookOpen, 
  Dumbbell, 
  GraduationCap, 
  Briefcase, 
  Languages, 
  Lightbulb,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Check
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUserStore } from '@/store'
import { cn } from '@/lib/utils'
import type { TimePreference, GoalCategory } from '@/types'

// 系统头像列表
const SYSTEM_AVATARS = [
  { id: 'avatar1', emoji: '🦁', color: 'from-amber-400 to-orange-500' },
  { id: 'avatar2', emoji: '🦊', color: 'from-orange-400 to-red-500' },
  { id: 'avatar3', emoji: '🐼', color: 'from-gray-400 to-gray-600' },
  { id: 'avatar4', emoji: '🐨', color: 'from-slate-400 to-slate-600' },
  { id: 'avatar5', emoji: '🐯', color: 'from-yellow-400 to-amber-500' },
  { id: 'avatar6', emoji: '🐰', color: 'from-pink-300 to-pink-500' },
  { id: 'avatar7', emoji: '🐱', color: 'from-purple-400 to-purple-600' },
  { id: 'avatar8', emoji: '🐶', color: 'from-amber-300 to-amber-500' },
  { id: 'avatar9', emoji: '🐺', color: 'from-gray-500 to-gray-700' },
  { id: 'avatar10', emoji: '🦉', color: 'from-indigo-400 to-indigo-600' },
  { id: 'avatar11', emoji: '🦋', color: 'from-cyan-400 to-blue-500' },
  { id: 'avatar12', emoji: '🦄', color: 'from-pink-400 to-purple-500' },
]

// 时间偏好选项
const TIME_PREFERENCES: { value: TimePreference; label: string; icon: typeof Sun; description: string }[] = [
  { value: 'early', label: '早起鸟', icon: Sun, description: '我喜欢在早晨学习，精力充沛' },
  { value: 'night', label: '夜猫子', icon: Moon, description: '我更喜欢在晚上学习，夜深人静' },
  { value: 'flexible', label: '灵活安排', icon: Clock, description: '我时间比较灵活，随时都可以' },
]

// 目标领域选项
const GOAL_CATEGORIES: { value: GoalCategory; label: string; icon: typeof BookOpen; color: string }[] = [
  { value: 'study', label: '学习提升', icon: BookOpen, color: 'from-blue-400 to-blue-600' },
  { value: 'fitness', label: '健身运动', icon: Dumbbell, color: 'from-green-400 to-green-600' },
  { value: 'reading', label: '阅读写作', icon: BookOpen, color: 'from-amber-400 to-amber-600' },
  { value: 'exam', label: '考试备考', icon: GraduationCap, color: 'from-purple-400 to-purple-600' },
  { value: 'career', label: '职场发展', icon: Briefcase, color: 'from-indigo-400 to-indigo-600' },
  { value: 'language', label: '语言学习', icon: Languages, color: 'from-pink-400 to-pink-600' },
  { value: 'skill', label: '技能培养', icon: Lightbulb, color: 'from-orange-400 to-orange-600' },
  { value: 'other', label: '其他', icon: Sparkles, color: 'from-teal-400 to-teal-600' },
]

type OnboardingStep = 'nickname' | 'avatar' | 'time' | 'goals' | 'complete'

export function OnboardingPage() {
  const navigate = useNavigate()
  const { user, completeOnboarding, addCoins } = useUserStore()
  
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('nickname')
  const [nickname, setNickname] = useState(user?.nickname || '')
  const [selectedAvatar, setSelectedAvatar] = useState(SYSTEM_AVATARS[0])
  const [timePreference, setTimePreference] = useState<TimePreference>('flexible')
  const [selectedGoals, setSelectedGoals] = useState<GoalCategory[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const steps: OnboardingStep[] = ['nickname', 'avatar', 'time', 'goals', 'complete']
  const currentStepIndex = steps.indexOf(currentStep)

  const handleNext = () => {
    if (currentStep === 'nickname' && !nickname.trim()) return
    
    const nextIndex = currentStepIndex + 1
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex])
    }
  }

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex])
    }
  }

  const handleComplete = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)

    try {
      const success = await completeOnboarding({
        nickname: nickname.trim(),
        avatar: selectedAvatar.emoji,
        timePreference,
        goalPreferences: selectedGoals
      })

      if (!success) {
        console.error('Onboarding completion failed')
        setIsSubmitting(false)
        return
      }

      // 奖励用户完成 onboarding（本地即时生效，DB 异步同步）
      addCoins(100)

      // 跳转到首页
      navigate('/')
    } catch (error) {
      console.error('handleComplete error:', error)
      setIsSubmitting(false)
    }
  }

  const toggleGoal = (goal: GoalCategory) => {
    setSelectedGoals(prev => 
      prev.includes(goal) 
        ? prev.filter(g => g !== goal)
        : [...prev, goal]
    )
  }

  const canProceed = () => {
    switch (currentStep) {
      case 'nickname':
        return nickname.trim().length >= 2
      case 'goals':
        return selectedGoals.length > 0
      default:
        return true
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-purple-950 dark:via-slate-900 dark:to-pink-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">完善你的资料</span>
            <span className="text-sm font-medium">{currentStepIndex + 1} / {steps.length}</span>
          </div>
          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <motion.div 
              className="h-full gradient-primary"
              initial={{ width: 0 }}
              animate={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Content Card */}
        <div className="bg-white dark:bg-slate-800/50 rounded-2xl shadow-xl p-6 min-h-[400px]">
          <AnimatePresence mode="wait">
            {/* Step 1: Nickname */}
            {currentStep === 'nickname' && (
              <motion.div
                key="nickname"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl gradient-primary flex items-center justify-center">
                    <User className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">你叫什么名字？</h2>
                  <p className="text-muted-foreground">让我们认识一下你</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">昵称</label>
                  <Input
                    type="text"
                    placeholder="给自己起个名字"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="h-12 text-lg"
                    maxLength={20}
                  />
                  <p className="text-xs text-muted-foreground">
                    2-20个字符，将用于排行榜和社区展示
                  </p>
                </div>
              </motion.div>
            )}

            {/* Step 2: Avatar */}
            {currentStep === 'avatar' && (
              <motion.div
                key="avatar"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl gradient-primary flex items-center justify-center">
                    <Camera className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">选择你的头像</h2>
                  <p className="text-muted-foreground">选个喜欢的形象代表你</p>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  {SYSTEM_AVATARS.map((avatar) => (
                    <button
                      key={avatar.id}
                      onClick={() => setSelectedAvatar(avatar)}
                      className={cn(
                        'aspect-square rounded-xl flex items-center justify-center text-3xl transition-all duration-200',
                        selectedAvatar.id === avatar.id
                          ? 'ring-4 ring-primary ring-offset-2 scale-110'
                          : 'hover:scale-105 bg-slate-100 dark:bg-slate-700'
                      )}
                      style={{
                        background: selectedAvatar.id === avatar.id 
                          ? `linear-gradient(135deg, var(--tw-gradient-from), var(--tw-gradient-to))` 
                          : undefined
                      }}
                    >
                      <div className={cn(
                        'w-full h-full rounded-xl flex items-center justify-center',
                        selectedAvatar.id === avatar.id && `bg-gradient-to-br ${avatar.color}`
                      )}>
                        {avatar.emoji}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    已选择: <span className="font-medium text-foreground">{selectedAvatar.emoji}</span>
                  </p>
                </div>
              </motion.div>
            )}

            {/* Step 3: Time Preference */}
            {currentStep === 'time' && (
              <motion.div
                key="time"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl gradient-primary flex items-center justify-center">
                    <Clock className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">你的学习时段偏好？</h2>
                  <p className="text-muted-foreground">我们会根据你的偏好调整 AI 提醒时间</p>
                </div>

                <div className="space-y-3">
                  {TIME_PREFERENCES.map((pref) => (
                    <button
                      key={pref.value}
                      onClick={() => setTimePreference(pref.value)}
                      className={cn(
                        'w-full p-4 rounded-xl border-2 transition-all duration-200 flex items-center gap-4',
                        timePreference === pref.value
                          ? 'border-primary bg-primary/5'
                          : 'border-slate-200 dark:border-slate-700 hover:border-primary/50'
                      )}
                    >
                      <div className={cn(
                        'w-12 h-12 rounded-xl flex items-center justify-center',
                        timePreference === pref.value
                          ? 'gradient-primary'
                          : 'bg-slate-100 dark:bg-slate-700'
                      )}>
                        <pref.icon className={cn(
                          'w-6 h-6',
                          timePreference === pref.value ? 'text-white' : 'text-slate-500'
                        )} />
                      </div>
                      <div className="text-left">
                        <p className="font-medium">{pref.label}</p>
                        <p className="text-sm text-muted-foreground">{pref.description}</p>
                      </div>
                      {timePreference === pref.value && (
                        <Check className="w-5 h-5 text-primary ml-auto" />
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 4: Goal Categories */}
            {currentStep === 'goals' && (
              <motion.div
                key="goals"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl gradient-primary flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">你感兴趣的领域？</h2>
                  <p className="text-muted-foreground">选择至少一个，用于推荐适合你的模板</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {GOAL_CATEGORIES.map((category) => {
                    const isSelected = selectedGoals.includes(category.value)
                    return (
                      <button
                        key={category.value}
                        onClick={() => toggleGoal(category.value)}
                        className={cn(
                          'p-4 rounded-xl border-2 transition-all duration-200 flex flex-col items-center gap-2',
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-slate-200 dark:border-slate-700 hover:border-primary/50'
                        )}
                      >
                        <div className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center',
                          isSelected ? `bg-gradient-to-br ${category.color}` : 'bg-slate-100 dark:bg-slate-700'
                        )}>
                          <category.icon className={cn(
                            'w-5 h-5',
                            isSelected ? 'text-white' : 'text-slate-500'
                          )} />
                        </div>
                        <span className="text-sm font-medium">{category.label}</span>
                        {isSelected && <Check className="w-4 h-4 text-primary" />}
                      </button>
                    )
                  })}
                </div>

                <p className="text-center text-sm text-muted-foreground">
                  已选择 {selectedGoals.length} 个领域
                </p>
              </motion.div>
            )}

            {/* Step 5: Complete */}
            {currentStep === 'complete' && (
              <motion.div
                key="complete"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="text-center space-y-6"
              >
                <div className="w-20 h-20 mx-auto rounded-2xl gradient-primary flex items-center justify-center animate-bounce">
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
                
                <div>
                  <h2 className="text-2xl font-bold mb-2">准备就绪！</h2>
                  <p className="text-muted-foreground">让我们开始你的学习之旅吧</p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br', selectedAvatar.color)}>
                      <span className="text-xl">{selectedAvatar.emoji}</span>
                    </div>
                    <div className="text-left">
                      <p className="font-medium">{nickname}</p>
                      <p className="text-xs text-muted-foreground">你的昵称</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                      <Clock className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium">{TIME_PREFERENCES.find(p => p.value === timePreference)?.label}</p>
                      <p className="text-xs text-muted-foreground">学习时段</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium">{selectedGoals.length} 个领域</p>
                      <p className="text-xs text-muted-foreground">兴趣方向</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                  <Sparkles className="w-4 h-4" />
                  <span>完成设置获得 100 金币 + 200 经验值</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation Buttons */}
        <div className="mt-6 flex items-center gap-3">
          {currentStepIndex > 0 && (
            <Button
              variant="outline"
              size="lg"
              onClick={handleBack}
              className="flex-1"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              上一步
            </Button>
          )}
          
          {currentStep !== 'complete' ? (
            <Button
              size="lg"
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex-1 gradient-primary"
            >
              下一步
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={handleComplete}
              disabled={isSubmitting}
              className="flex-1 gradient-primary"
            >
              {isSubmitting ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                />
              ) : (
                <>
                  开始探索
                  <Sparkles className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
