import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  User,
  Goal,
  AIMessage,
  AICharacter,
  SubGoal
} from '@/types'
import { generateId } from '@/lib/utils'
import * as db from '@/services/supabase'
import * as sync from '@/services/syncService'
import * as authService from '@/services/auth.service'

// =====================================================
// 用户 Store
// =====================================================
interface UserState {
  user: User | null
  isAuthenticated: boolean
  isDemo: boolean
  isLoading: boolean
  isSyncing: boolean
  authChecked: boolean  // 是否已完成启动时的认证验证

  // 异步操作
  initializeUser: (authId: string, email: string, nickname: string) => Promise<void>
  loadUser: (authId: string) => Promise<void>
  setUser: (user: User | null) => void
  updateUser: (updates: Partial<User>) => void
  login: () => void
  logout: () => Promise<void>
  loginDemo: () => void
  setAuthChecked: (checked: boolean) => void
  clearAuth: () => void

  // Onboarding
  completeOnboarding: (data: {
    nickname: string
    avatar?: string
    timePreference: string
    goalPreferences: string[]
  }) => Promise<boolean>
  needsOnboarding: () => boolean

  // 数据库同步
  syncToDb: () => Promise<void>
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isDemo: false,
      isLoading: false,
      isSyncing: false,
      authChecked: false,  // 启动时必须先验证 Supabase 会话

      initializeUser: async (authId, email, nickname) => {
        set({ isLoading: true, isAuthenticated: true })
        try {
          const user = await sync.initUserData(authId, email, nickname)
          if (user) {
            set({ user, authChecked: true })
          }
        } catch (error) {
          console.error('Error initializing user:', error)
        } finally {
          set({ isLoading: false })
        }
      },

      loadUser: async (authId) => {
        set({ isLoading: true, isAuthenticated: true })
        try {
          const user = await sync.loadUserFromDb(authId)
          if (user) {
            set({ user, authChecked: true })
          }
        } catch (error) {
          console.error('Error loading user:', error)
        } finally {
          set({ isLoading: false })
        }
      },

      setUser: (user) => set({ user, isAuthenticated: !!user }),

      updateUser: (updates) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null
        }))
        // 异步同步到数据库
        const user = get().user
        if (user && !get().isDemo) {
          db.updateUserProfile(user.id, updates)
        }
      },

      login: () => set({ isAuthenticated: true, isDemo: false, authChecked: true }),

      logout: async () => {
        try {
          await authService.signOut()
        } catch (error) {
          console.error('Logout error:', error)
        }
        // 清除所有持久化 store，防止账号切换时旧数据残留
        useGoalsStore.getState().setGoals([])
        useGoalsStore.setState({ currentGoal: null })
        useAIChatStore.getState().clearAllMessages()
        localStorage.removeItem('questmind-goals')
        localStorage.removeItem('questmind-ai-chat')
        set({ user: null, isAuthenticated: false, isDemo: false, authChecked: true })
      },

      loginDemo: () => set({
        user: {
          id: 'demo-user',
          email: 'demo@questmind.app',
          nickname: '学习达人',
          createdAt: new Date().toISOString()
        },
        isAuthenticated: true,
        isDemo: true,
        authChecked: true
      }),

      setAuthChecked: (checked) => set({ authChecked: checked }),

      clearAuth: () => {
        useGoalsStore.getState().setGoals([])
        useGoalsStore.setState({ currentGoal: null })
        set({ user: null, isAuthenticated: false, isDemo: false, authChecked: true })
      },

      syncToDb: async () => {
        const user = get().user
        if (!user || get().isDemo) return

        set({ isSyncing: true })
        try {
          await sync.syncUserToDb(user)
        } finally {
          set({ isSyncing: false })
        }
      },

      completeOnboarding: async (data) => {
        const user = get().user
        if (!user || get().isDemo) return false

        try {
          // 先尝试正常更新（用户记录已存在的情况）
          let updatedUser = await db.completeUserOnboarding(user.id, data)

          // 如果更新失败，可能是用户记录还不存在（新注册用户），尝试创建
          if (!updatedUser && user.email) {
            console.log('User record not found, creating new one...')
            updatedUser = await db.createUser({
              authId: user.id,
              email: user.email,
              nickname: data.nickname,
              avatar: data.avatar,
            })
            if (updatedUser) {
              // 创建成功后再次执行 onboarding 更新
              updatedUser = await db.completeUserOnboarding(updatedUser.id, data)
              // 同步 store 中的 user.id 为数据库真实 ID
              set({ user: { ...updatedUser!, id: updatedUser!.id } })
            }
          }

          if (updatedUser) {
            set({ user: updatedUser })
            return true
          }
        } catch (error) {
          console.error('Error completing onboarding:', error)
        }
        return false
      },

      needsOnboarding: () => {
        const user = get().user
        return !!user && !user.onboardingCompleted && !get().isDemo
      }
    }),
    {
      name: 'questmind-user'
    }
  )
)

// =====================================================
// 目标 Store
// =====================================================
interface GoalsState {
  goals: Goal[]
  currentGoal: Goal | null
  isLoading: boolean

  // 数据加载
  loadGoals: (userId: string) => Promise<void>

  // 同步操作
  setGoals: (goals: Goal[]) => void
  addGoal: (goal: Omit<Goal, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'progress'> & { subGoals?: SubGoal[] }) => Promise<Goal | null>
  updateGoal: (goalId: string, updates: Partial<Goal>) => void
  deleteGoal: (goalId: string) => Promise<void>
  setCurrentGoal: (goal: Goal | null) => void
  toggleSubGoal: (goalId: string, subGoalId: string) => Promise<void>
  // 每日任务操作
  toggleDailyTask: (goalId: string, taskId: string) => void
  startDailyTask: (goalId: string, taskId: string) => void
  stopDailyTask: (goalId: string, taskId: string, markCompleted?: boolean) => void
  updateTaskElapsed: (goalId: string, taskId: string, seconds: number) => void
  resetDailyTasks: () => void

  // 离线操作
  addSubGoal: (goalId: string, title: string) => Promise<void>
  removeSubGoal: (goalId: string, subGoalId: string) => Promise<void>
}

export const useGoalsStore = create<GoalsState>()(
  persist(
    (set, get) => ({
      goals: [],
      currentGoal: null,
      isLoading: false,

      loadGoals: async (userId) => {
        set({ isLoading: true })
        try {
          const goals = await sync.loadGoalsFromDb(userId)
          set({ goals })
        } catch (error) {
          console.error('Error loading goals:', error)
        } finally {
          set({ isLoading: false })
        }
      },

      setGoals: (goals) => set({ goals }),

      addGoal: async (goalData) => {
        const user = useUserStore.getState().user
        if (!user) return null

        // 先更新本地
        const newGoal: Goal = {
          ...goalData,
          id: generateId(),
          userId: user.id,
          progress: 0,
          subGoals: goalData.subGoals || [],
          dailyTasks: goalData.dailyTasks || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        set((state) => ({
          goals: [newGoal, ...state.goals]
        }))

        // 同步到数据库
        try {
          const dbGoal = await sync.syncGoalToDb(user.id, goalData)
          if (dbGoal) {
            // 用数据库返回的 ID 更新本地
            set((state) => ({
              goals: state.goals.map((g) =>
                g.id === newGoal.id ? { ...g, id: dbGoal.id } : g
              )
            }))
            return dbGoal
          }
        } catch (error) {
          console.error('Error syncing goal to DB:', error)
        }

        return newGoal
      },

      updateGoal: (goalId, updates) => {
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === goalId ? { ...g, ...updates, updatedAt: new Date().toISOString() } : g
          ),
          currentGoal: state.currentGoal?.id === goalId
            ? { ...state.currentGoal, ...updates, updatedAt: new Date().toISOString() }
            : state.currentGoal
        }))

        // 同步到数据库
        sync.updateGoalInDb(goalId, updates)
      },

      deleteGoal: async (goalId) => {
        set((state) => ({
          goals: state.goals.filter((g) => g.id !== goalId),
          currentGoal: state.currentGoal?.id === goalId ? null : state.currentGoal
        }))

        // 从数据库删除
        await sync.deleteGoalInDb(goalId)
      },

      setCurrentGoal: (goal) => set({ currentGoal: goal }),

      toggleSubGoal: async (goalId, subGoalId) => {
        const isDemo = useUserStore.getState().isDemo

        set((state) => ({
          goals: state.goals.map((g) => {
            if (g.id !== goalId) return g
            const newSubGoals = g.subGoals.map((sg) =>
              sg.id === subGoalId
                ? { ...sg, completed: !sg.completed, completedAt: !sg.completed ? new Date().toISOString() : undefined }
                : sg
            )
            return {
              ...g,
              subGoals: newSubGoals,
              progress: calculateProgress(newSubGoals, subGoalId),
              updatedAt: new Date().toISOString()
            }
          }),
          currentGoal: state.currentGoal?.id === goalId
            ? {
                ...state.currentGoal,
                subGoals: state.currentGoal.subGoals.map((sg) =>
                  sg.id === subGoalId
                    ? { ...sg, completed: !sg.completed, completedAt: !sg.completed ? new Date().toISOString() : undefined }
                    : sg
                ),
                progress: calculateProgress(state.currentGoal.subGoals, subGoalId)
              }
            : state.currentGoal
        }))

        // 同步到数据库
        if (!isDemo) {
          await sync.toggleSubGoalInDb(subGoalId)
        }
      },

      addSubGoal: async (goalId, title) => {
        const goal = get().goals.find((g) => g.id === goalId)
        if (!goal) return

        const newSubGoal = {
          id: generateId(),
          goalId,
          title,
          completed: false
        }

        // 先更新本地
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === goalId
              ? { ...g, subGoals: [...g.subGoals, newSubGoal] }
              : g
          ),
          currentGoal: state.currentGoal?.id === goalId
            ? { ...state.currentGoal, subGoals: [...state.currentGoal.subGoals, newSubGoal] }
            : state.currentGoal
        }))

        // 同步到数据库
        const isDemo = useUserStore.getState().isDemo
        if (!isDemo) {
          await sync.addSubGoalToDb(goalId, title)
        }
      },

      removeSubGoal: async (goalId, subGoalId) => {
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === goalId
              ? { ...g, subGoals: g.subGoals.filter((sg) => sg.id !== subGoalId) }
              : g
          ),
          currentGoal: state.currentGoal?.id === goalId
            ? { ...state.currentGoal, subGoals: state.currentGoal.subGoals.filter((sg) => sg.id !== subGoalId) }
            : state.currentGoal
        }))

        // 从数据库删除
        const isDemo = useUserStore.getState().isDemo
        if (!isDemo) {
          await sync.deleteSubGoalInDb(subGoalId)
        }
      },

      toggleDailyTask: (goalId, taskId) => {
        set((state) => ({
          goals: state.goals.map((g) => {
            if (g.id !== goalId) return g
            const newTasks = (g.dailyTasks || []).map((task) =>
              task.id === taskId
                ? { ...task, completed: !task.completed, completedAt: !task.completed ? new Date().toISOString() : undefined, isRunning: false }
                : task
            )
            return { ...g, dailyTasks: newTasks }
          }),
          currentGoal: state.currentGoal?.id === goalId
            ? {
                ...state.currentGoal,
                dailyTasks: (state.currentGoal.dailyTasks || []).map((task) =>
                  task.id === taskId
                    ? { ...task, completed: !task.completed, completedAt: !task.completed ? new Date().toISOString() : undefined, isRunning: false }
                    : task
                )
              }
            : state.currentGoal
        }))
        // 同步到数据库
        const isDemo = useUserStore.getState().isDemo
        if (!isDemo) {
          sync.toggleDailyTaskInDb(taskId)
        }
      },

      // 开始每日任务（启动倒计时）
      // 暂停后恢复时：将当前 elapsedSeconds 锁入 baseElapsed，elapsedSeconds 重置为 0
      // timer 中只需算：baseElapsed + (now - lastResumedAt)
      startDailyTask: (goalId, taskId) => {
        set((state) => ({
          goals: state.goals.map((g) => {
            if (g.id !== goalId) return g
            const newTasks = (g.dailyTasks || []).map((task) => {
              if (task.id !== taskId) {
                return { ...task, isRunning: false }
              }
              const currentElapsed = task.elapsedSeconds ?? 0
              const previousBase = task.baseElapsed ?? 0
              return {
                ...task,
                isRunning: true,
                startedAt: task.startedAt || new Date().toISOString(),
                // 将历史累积时间锁入 baseElapsed
                baseElapsed: previousBase + currentElapsed,
                // 当前周期重置，timer 从 lastResumedAt 开始算增量
                elapsedSeconds: 0,
                lastResumedAt: Date.now()
              }
            })
            return { ...g, dailyTasks: newTasks }
          }),
          currentGoal: state.currentGoal?.id === goalId
            ? {
                ...state.currentGoal,
                dailyTasks: (state.currentGoal.dailyTasks || []).map((task) => {
                  if (task.id !== taskId) {
                    return { ...task, isRunning: false }
                  }
                  const currentElapsed = task.elapsedSeconds ?? 0
                  const previousBase = task.baseElapsed ?? 0
                  return {
                    ...task,
                    isRunning: true,
                    startedAt: task.startedAt || new Date().toISOString(),
                    baseElapsed: previousBase + currentElapsed,
                    elapsedSeconds: 0,
                    lastResumedAt: Date.now()
                  }
                })
              }
            : state.currentGoal
        }))
      },

      // 停止每日任务（暂停或完成）
      // 暂停时：将 baseElapsed + 当前周期时间 合并写入 elapsedSeconds，以便恢复时能正确读取历史累积
      stopDailyTask: (goalId, taskId, markCompleted = false) => {
        set((state) => ({
          goals: state.goals.map((g) => {
            if (g.id !== goalId) return g
            const newTasks = (g.dailyTasks || []).map((task) => {
              if (task.id !== taskId) return task
              // 计算总时间：baseElapsed(历史) + 当前周期增量
              let currentPeriodElapsed = task.elapsedSeconds ?? 0
              // 如果任务正在运行且有 lastResumedAt，用实时计算代替过时的 elapsedSeconds
              if (task.isRunning && task.lastResumedAt) {
                currentPeriodElapsed = Math.floor((Date.now() - task.lastResumedAt) / 1000)
              }
              const totalTime = (task.baseElapsed ?? 0) + currentPeriodElapsed
              const shouldComplete = markCompleted && totalTime > 0
              return {
                ...task,
                isRunning: false,
                // 将总时间存入 elapsedSeconds，下次 resume 时会作为 baseElapsed 的来源
                elapsedSeconds: totalTime,
                // 重置运行相关字段
                startedAt: undefined,
                lastResumedAt: undefined,
                baseElapsed: 0,
                completed: shouldComplete ? true : task.completed,
                completedAt: shouldComplete ? new Date().toISOString() : task.completedAt
              }
            })
            return { ...g, dailyTasks: newTasks }
          }),
          currentGoal: state.currentGoal?.id === goalId
            ? {
                ...state.currentGoal,
                dailyTasks: (state.currentGoal.dailyTasks || []).map((task) => {
                  if (task.id !== taskId) return task
                  let currentPeriodElapsed = task.elapsedSeconds ?? 0
                  if (task.isRunning && task.lastResumedAt) {
                    currentPeriodElapsed = Math.floor((Date.now() - task.lastResumedAt) / 1000)
                  }
                  const totalTime = (task.baseElapsed ?? 0) + currentPeriodElapsed
                  const shouldComplete = markCompleted && totalTime > 0
                  return {
                    ...task,
                    isRunning: false,
                    elapsedSeconds: totalTime,
                    startedAt: undefined,
                    lastResumedAt: undefined,
                    baseElapsed: 0,
                    completed: shouldComplete ? true : task.completed,
                    completedAt: shouldComplete ? new Date().toISOString() : task.completedAt
                  }
                })
              }
            : state.currentGoal
        }))
      },

      // 更新任务已用时间
      updateTaskElapsed: (goalId, taskId, seconds) => {
        set((state) => ({
          goals: state.goals.map((g) => {
            if (g.id !== goalId) return g
            const newTasks = (g.dailyTasks || []).map((task) =>
              task.id === taskId ? { ...task, elapsedSeconds: seconds } : task
            )
            return { ...g, dailyTasks: newTasks }
          }),
          currentGoal: state.currentGoal?.id === goalId
            ? {
                ...state.currentGoal,
                dailyTasks: (state.currentGoal.dailyTasks || []).map((task) =>
                  task.id === taskId ? { ...task, elapsedSeconds: seconds } : task
                )
              }
            : state.currentGoal
        }))
      },

      // 重置所有每日任务（每天自动调用）
      resetDailyTasks: () => {
        set((state) => ({
          goals: state.goals.map((g) => ({
            ...g,
            dailyTasks: (g.dailyTasks || []).map((task) => ({
              ...task,
              completed: false,
              completedAt: undefined,
              isRunning: false,
              startedAt: undefined,
              elapsedSeconds: 0
            }))
          })),
          currentGoal: state.currentGoal ? {
            ...state.currentGoal,
            dailyTasks: (state.currentGoal.dailyTasks || []).map((task) => ({
              ...task,
              completed: false,
              completedAt: undefined,
              isRunning: false,
              startedAt: undefined,
              elapsedSeconds: 0
            }))
          } : null
        }))
      }
    }),
    {
      name: 'questmind-goals'
    }
  )
)

function calculateProgress(subGoals: Goal['subGoals'], toggledId: string): number {
  const completed = subGoals.filter((sg) =>
    sg.id === toggledId ? !sg.completed : sg.completed
  ).length
  return subGoals.length > 0 ? Math.round((completed / subGoals.length) * 100) : 0
}

// =====================================================
// AI 聊天 Store
// =====================================================
interface AIChatState {
  messages: Record<AICharacter, AIMessage[]>
  activeCharacter: AICharacter
  isLoading: boolean
  // 各角色最后一次访问时间（用于"记忆感"问候）
  lastVisit: Partial<Record<AICharacter, string>>

  // 数据加载
  loadMessages: (userId: string, character: AICharacter) => Promise<void>

  setActiveCharacter: (character: AICharacter) => void
  addMessage: (character: AICharacter, message: Omit<AIMessage, 'id' | 'timestamp'>) => void
  clearMessages: (character: AICharacter) => void
  clearAllMessages: () => void
  saveToDb: (userId: string, character: AICharacter, content: string, isUser: boolean, scene?: AIMessage['scene'], goalId?: string) => Promise<void>
  // 记录本次访问时间
  markVisit: (character: AICharacter) => void
}

export const useAIChatStore = create<AIChatState>()(
  persist(
    (set) => ({
      messages: {
        xiaoSi: [],
        coach: [],
        friend: [],
        rem: [],
        alice: [],
      },
      activeCharacter: 'xiaoSi',
      isLoading: false,
      lastVisit: {},

      loadMessages: async (userId, character) => {
        set({ isLoading: true })
        try {
          const dbMessages = await sync.loadAIMessagesFromDb(userId, character)
          set((state) => ({
            messages: {
              ...state.messages,
              [character]: dbMessages
            }
          }))
        } catch (error) {
          console.error('Error loading AI messages:', error)
        } finally {
          set({ isLoading: false })
        }
      },

      setActiveCharacter: (character) => set({ activeCharacter: character }),

      addMessage: (character, message) => set((state) => ({
        messages: {
          ...state.messages,
          [character]: [
            ...(state.messages[character] || []),
            {
              ...message,
              id: generateId(),
              timestamp: new Date().toISOString()
            }
          ]
        }
      })),

      clearAllMessages: () => set({
        messages: { xiaoSi: [], coach: [], friend: [], rem: [], alice: [] },
        lastVisit: {}
      }),

      clearMessages: (character) => set((state) => ({
        messages: {
          ...state.messages,
          [character]: []
        }
      })),

      saveToDb: async (userId, character, content, isUser, scene, goalId) => {
        await sync.saveAIMessageToDb(userId, character, content, isUser, scene, goalId)
      },

      markVisit: (character) => set((state) => ({
        lastVisit: {
          ...state.lastVisit,
          [character]: new Date().toISOString()
        }
      }))
    }),
    {
      name: 'questmind-ai-chat'
    }
  )
)

// =====================================================
// UI Store
// =====================================================
interface UIState {
  theme: 'light' | 'dark'
  activeTab: string
  showSyncToast: boolean
  syncError: string | null

  setTheme: (theme: 'light' | 'dark') => void
  setActiveTab: (tab: string) => void
  setSyncToast: (show: boolean) => void
  setSyncError: (error: string | null) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'light',
      activeTab: 'home',
      showSyncToast: false,
      syncError: null,

      setTheme: (theme) => set({ theme }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setSyncToast: (show) => set({ showSyncToast: show }),
      setSyncError: (error) => set({ syncError: error })
    }),
    {
      name: 'questmind-ui'
    }
  )
)

// =====================================================
// 导出 store 初始化函数
// =====================================================
export async function initializeStores(userId: string): Promise<void> {
  const goals = await sync.loadGoalsFromDb(userId)
  useGoalsStore.getState().setGoals(goals)
}

export async function fullDataSync(userId: string): Promise<void> {
  const result = await sync.fullSync(userId)

  if (result.user) {
    useUserStore.getState().setUser(result.user)
  }
  if (result.goals.length > 0) {
    useGoalsStore.getState().setGoals(result.goals)
  }
}
