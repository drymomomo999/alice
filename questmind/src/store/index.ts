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
import { mergeUserProfile } from '@/services/profileRecovery'
import { recordContinuitySubGoalCompletion, recordContinuityTaskCompletion } from '@/course-engine/service'
import { calculateGoalProgress, normalizeGoalRelations, toggleGoalSubGoal } from '@/features/goals/domain'
import { applyGoalTaskFeedback, type GoalTaskFeedback, type GoalTaskAdjustment } from '@/features/goals/planning'

// =====================================================
// 用户 Store
// =====================================================
interface UserState {
  pendingProfile: Partial<User>
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
      pendingProfile: {},
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
            // 云端字段在旧账号/迁移未完成时可能为空，不能用空值覆盖本地已保存的资料。
            const cachedUser = get().user
            const mergedUser = mergeUserProfile(user, cachedUser, get().pendingProfile)
            set({ user: mergedUser, authChecked: true })
            if (Object.keys(get().pendingProfile).length) void get().syncToDb()
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
            const cachedUser = get().user
            const mergedUser = mergeUserProfile(user, cachedUser, get().pendingProfile)
            set({ user: mergedUser, authChecked: true })
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
          user: state.user ? { ...state.user, ...updates } : null,
          pendingProfile: { ...state.pendingProfile, ...updates },
        }))
        // 异步同步到数据库
        const user = get().user
        if (user && !get().isDemo) {
          void get().syncToDb()
        }
      },

      login: () => set({ isAuthenticated: true, isDemo: false, authChecked: true }),

      logout: async () => {
        const current = get()
        if (current.user) localStorage.setItem(`questmind-account:${current.user.authId || current.user.id}`, JSON.stringify({ user: current.user, pendingProfile: current.pendingProfile, goals: useGoalsStore.getState().goals, chat: useAIChatStore.getState().messages }))
        try {
          await authService.signOut()
        } catch (error) {
          console.error('Logout error:', error)
        }
        // 清除所有持久化 store，防止账号切换时旧数据残留
        useGoalsStore.getState().setGoals([])
        useAIChatStore.getState().clearAllMessages()
        localStorage.removeItem('questmind-goals')
        localStorage.removeItem('questmind-ai-chat')
        set({ user: null, pendingProfile: {}, isAuthenticated: false, isDemo: false, authChecked: true })
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
        // 会话失效只锁定入口，保留本地资料，重新登录同一账号后继续恢复。
        set({ isAuthenticated: false, isDemo: false, authChecked: true })
      },

      syncToDb: async () => {
        const user = get().user
        if (!user || get().isDemo) return

        set({ isSyncing: true })
        const pending = get().pendingProfile
        try {
          const saved = await sync.syncUserToDb(user)
          if (saved && get().user?.id === user.id && get().pendingProfile === pending) set({ pendingProfile: {} })
        } finally {
          set({ isSyncing: false })
        }
      },

      completeOnboarding: async (data) => {
        const user = get().user
        if (!user || get().isDemo) return false

        // 先落本地，保证网络波动或旧数据库未迁移时，重启仍能保留资料。
        const updates: Partial<User> = {
          ...data,
          timePreference: data.timePreference as User['timePreference'],
          goalPreferences: data.goalPreferences as User['goalPreferences'],
          onboardingCompleted: true,
        }
        set({ pendingProfile: { ...get().pendingProfile, ...updates }, user: {
          ...user,
          nickname: data.nickname,
          avatar: data.avatar || user.avatar,
          timePreference: data.timePreference as User['timePreference'],
          goalPreferences: data.goalPreferences as User['goalPreferences'],
          onboardingCompleted: true,
        } })

        try {
          // 先尝试正常更新（用户记录已存在的情况）
          const updatedUser = await db.completeUserOnboarding(user.id, data)

          if (updatedUser) {
            set({ user: mergeUserProfile(updatedUser, get().user, get().pendingProfile) })
            void get().syncToDb()
            return true
          }
        } catch (error) {
          console.error('Error completing onboarding:', error)
        }
        // 云端失败不应让用户反复填写；本地资料仍然有效，下次启动再尝试同步。
        return true
      },

      needsOnboarding: () => {
        const user = get().user
        return !!user && !user.onboardingCompleted && !get().isDemo
      }
    }),
    {
      name: 'questmind-user',
      partialize: ({ user, isAuthenticated, isDemo, pendingProfile }) => ({ user, isAuthenticated, isDemo, pendingProfile }),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<UserState>), authChecked: false, isLoading: false, isSyncing: false }),
    }
  )
)

// =====================================================
// 目标 Store
// =====================================================
interface GoalsState {
  goals: Goal[]
  isLoading: boolean
  syncError: string | null

  // 数据加载
  loadGoals: (userId: string) => Promise<void>

  // 同步操作
  setGoals: (goals: Goal[]) => void
  addGoal: (goal: Omit<Goal, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'progress'> & { subGoals?: SubGoal[] }) => Promise<Goal | null>
  updateGoal: (goalId: string, updates: Partial<Goal>) => void
  deleteGoal: (goalId: string) => Promise<void>
  clearSyncError: () => void
  toggleSubGoal: (goalId: string, subGoalId: string) => Promise<void>
  // 每日任务操作
  toggleDailyTask: (goalId: string, taskId: string) => void
  applyTaskFeedback: (goalId: string, taskId: string, feedback: GoalTaskFeedback) => Promise<GoalTaskAdjustment | null>
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
      isLoading: false,
      syncError: null,

      loadGoals: async (userId) => {
        set({ isLoading: true })
        try {
          const goals = await sync.loadGoalsFromDb(userId)
          set({ goals, syncError: null })
        } catch (error) {
          console.error('Error loading goals:', error)
          set({ syncError: '目标加载失败，请检查网络后重试' })
        } finally {
          set({ isLoading: false })
        }
      },

      setGoals: (goals) => set({ goals, syncError: null }),
      clearSyncError: () => set({ syncError: null }),

      addGoal: async (goalData) => {
        const user = useUserStore.getState().user
        if (!user) return null

        const isDemo = useUserStore.getState().isDemo
        const localGoalId = generateId()

        // 先更新本地
        const newGoal = normalizeGoalRelations({
          ...goalData,
          id: localGoalId,
          userId: user.id,
          progress: 0,
          subGoals: goalData.subGoals || [],
          dailyTasks: goalData.dailyTasks || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })

        set((state) => ({
          goals: [newGoal, ...state.goals]
        }))

        if (isDemo) return newGoal

        // 同步到数据库
        try {
          const dbGoal = await sync.syncGoalToDb(user.id, goalData)
          if (dbGoal) {
            // 以服务端返回的完整聚合替换临时目标，避免子记录继续引用临时 ID。
            set((state) => ({
              goals: state.goals.map((g) =>
                g.id === newGoal.id ? dbGoal : g
              ),
              syncError: null,
            }))
            return dbGoal
          }
          set({ syncError: '目标已保存在本机，但云端同步失败' })
        } catch (error) {
          console.error('Error syncing goal to DB:', error)
          set({ syncError: '目标已保存在本机，但云端同步失败' })
        }

        return newGoal
      },

      updateGoal: (goalId, updates) => {
        const previousGoal = get().goals.find((goal) => goal.id === goalId)
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === goalId ? { ...g, ...updates, updatedAt: new Date().toISOString() } : g
          )
        }))

        if (!useUserStore.getState().isDemo) {
          void sync.updateGoalInDb(goalId, updates).then((result) => {
            if (result) {
              set({ syncError: null })
              return
            }
            if (!previousGoal) {
              set({ syncError: '目标修改已保存在本机，但云端同步失败' })
              return
            }
            set((state) => ({
              goals: state.goals.map((goal) => goal.id === goalId ? previousGoal : goal),
              syncError: '云端修改失败，已恢复到修改前状态',
            }))
          })
        }
      },

      deleteGoal: async (goalId) => {
        const removedGoal = get().goals.find((goal) => goal.id === goalId)
        set((state) => ({
          goals: state.goals.filter((g) => g.id !== goalId)
        }))

        if (!useUserStore.getState().isDemo) {
          const deleted = await sync.deleteGoalInDb(goalId)
          if (!deleted && removedGoal) {
            set((state) => ({
              goals: state.goals.some((goal) => goal.id === goalId)
                ? state.goals
                : [removedGoal, ...state.goals],
              syncError: '云端删除失败，目标已恢复',
            }))
          }
        }
      },

      toggleSubGoal: async (goalId, subGoalId) => {
        const isDemo = useUserStore.getState().isDemo
        const willComplete = !get().goals.find(goal => goal.id === goalId)?.subGoals.find(subGoal => subGoal.id === subGoalId)?.completed
        const previousGoal = get().goals.find((goal) => goal.id === goalId)

        set((state) => ({
          goals: state.goals.map((g) => {
            if (g.id !== goalId) return g
            return toggleGoalSubGoal(g, subGoalId)
          })
        }))

        // 同步到数据库
        if (!isDemo) {
          const synced = await sync.toggleSubGoalInDb(subGoalId)
          if (synced) {
            set({ syncError: null })
          } else if (previousGoal) {
            set((state) => ({
              goals: state.goals.map((goal) => goal.id === goalId ? previousGoal : goal),
              syncError: '子目标状态同步失败，已恢复到修改前状态',
            }))
            return
          }
        }
        recordContinuitySubGoalCompletion(goalId, subGoalId, willComplete)
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
          )
        }))

        // 同步到数据库
        const isDemo = useUserStore.getState().isDemo
        if (!isDemo) {
          const persisted = await sync.addSubGoalToDb(goalId, title, goal.subGoals.length)
          if (persisted) {
            set((state) => ({
              goals: state.goals.map((item) => item.id === goalId
                ? { ...item, subGoals: item.subGoals.map((subGoal) => subGoal.id === newSubGoal.id ? persisted : subGoal) }
                : item),
              syncError: null,
            }))
          } else {
            set({ syncError: '子目标已保存在本机，但云端同步失败' })
          }
        }
      },

      removeSubGoal: async (goalId, subGoalId) => {
        const previousGoal = get().goals.find((goal) => goal.id === goalId)
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === goalId ? (() => {
              const subGoals = g.subGoals.filter((sg) => sg.id !== subGoalId)
              return { ...g, subGoals, progress: calculateGoalProgress(subGoals) }
            })() : g
          )
        }))

        // 从数据库删除
        const isDemo = useUserStore.getState().isDemo
        if (!isDemo) {
          const deleted = await sync.deleteSubGoalInDb(subGoalId)
          if (deleted) {
            set({ syncError: null })
          } else if (previousGoal) {
            set((state) => ({
              goals: state.goals.map((goal) => goal.id === goalId ? previousGoal : goal),
              syncError: '云端删除子目标失败，已恢复到删除前状态',
            }))
          }
        }
      },

      toggleDailyTask: (goalId, taskId) => {
        const willComplete = !(get().goals.find(goal => goal.id === goalId)?.dailyTasks || []).find(task => task.id === taskId)?.completed
        const previousGoal = get().goals.find((goal) => goal.id === goalId)
        set((state) => ({
          goals: state.goals.map((g) => {
            if (g.id !== goalId) return g
            const newTasks = (g.dailyTasks || []).map((task) =>
              task.id === taskId
                ? { ...task, completed: !task.completed, completedAt: !task.completed ? new Date().toISOString() : undefined, isRunning: false }
                : task
            )
            return { ...g, dailyTasks: newTasks }
          })
        }))
        // 同步到数据库
        const isDemo = useUserStore.getState().isDemo
        if (!isDemo) {
          void sync.toggleDailyTaskInDb(taskId).then((synced) => {
            if (synced) {
              set({ syncError: null })
              if (willComplete) recordContinuityTaskCompletion(goalId, taskId, true)
            } else if (previousGoal) {
              set((state) => ({
                goals: state.goals.map((goal) => goal.id === goalId ? previousGoal : goal),
                syncError: '每日任务状态同步失败，已恢复到修改前状态',
              }))
            }
          })
        } else if (willComplete) {
          recordContinuityTaskCompletion(goalId, taskId, true)
        }
      },

      applyTaskFeedback: async (goalId, taskId, feedback) => {
        const goal = get().goals.find(item => item.id === goalId)
        if (!goal) return null
        const previousGoal = goal
        let adjustment: GoalTaskAdjustment
        try {
          adjustment = applyGoalTaskFeedback(goal, taskId, feedback)
        } catch (error) {
          set({ syncError: error instanceof Error ? error.message : '任务调整失败' })
          return null
        }
        set((state) => ({
          goals: state.goals.map(item => item.id === goalId
            ? { ...item, dailyTasks: adjustment.tasks, updatedAt: new Date().toISOString() }
            : item),
          syncError: null,
        }))
        if (!useUserStore.getState().isDemo) {
          const synced = await sync.updateDailyTasksInDb(adjustment.tasks)
          if (!synced) {
            set((state) => ({
              goals: state.goals.map(item => item.id === goalId ? previousGoal : item),
              syncError: '计划已在本机调整，但云端同步失败',
            }))
          }
        }
        return adjustment
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
                if (!task.isRunning || !task.lastResumedAt) return task
                const activeSeconds = Math.max(0, Math.floor((Date.now() - task.lastResumedAt) / 1000))
                return {
                  ...task,
                  isRunning: false,
                  elapsedSeconds: (task.baseElapsed ?? 0) + activeSeconds,
                  baseElapsed: 0,
                  startedAt: undefined,
                  lastResumedAt: undefined,
                }
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
          })
        }))
      },

      // 停止每日任务（暂停或完成）
      // 暂停时：将 baseElapsed + 当前周期时间 合并写入 elapsedSeconds，以便恢复时能正确读取历史累积
      stopDailyTask: (goalId, taskId, markCompleted = false) => {
        const taskBeforeStop = (get().goals.find(goal => goal.id === goalId)?.dailyTasks || []).find(task => task.id === taskId)
        const liveSeconds = taskBeforeStop?.isRunning && taskBeforeStop.lastResumedAt
          ? Math.floor((Date.now() - taskBeforeStop.lastResumedAt) / 1000)
          : (taskBeforeStop?.elapsedSeconds || 0)
        const shouldRecordCompletion = Boolean(markCompleted && !taskBeforeStop?.completed && (taskBeforeStop?.baseElapsed || 0) + liveSeconds > 0)
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
          })
        }))
        if (shouldRecordCompletion) recordContinuityTaskCompletion(goalId, taskId, true)
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
          })
        }))
      },

      // 只重置真正的重复任务。带 dayIndex 的计划任务是一次性日程，不能跨日复活。
      resetDailyTasks: () => {
        const goalIds = get().goals
          .filter((goal) => (goal.dailyTasks || []).some((task) => task.frequency === 'daily' && !task.dayIndex))
          .map((goal) => goal.id)
        set((state) => ({
          goals: state.goals.map((g) => ({
            ...g,
            dailyTasks: (g.dailyTasks || []).map((task) => ({
              ...task,
              ...(task.frequency === 'daily' && !task.dayIndex ? {
                completed: false,
                completedAt: undefined,
                isRunning: false,
                startedAt: undefined,
                elapsedSeconds: 0,
                lastResumedAt: undefined,
                baseElapsed: 0,
              } : {}),
            }))
          }))
        }))

        if (!useUserStore.getState().isDemo && goalIds.length > 0) {
          void Promise.all(goalIds.map((goalId) => sync.resetDailyTasksInDb(goalId))).then((results) => {
            if (results.every(Boolean)) {
              set({ syncError: null })
            } else {
              set({ syncError: '每日任务已在本机重置，但部分云端同步失败' })
            }
          })
        }
      }
    }),
    {
      name: 'questmind-goals',
      merge: (persisted, current) => {
        const saved = persisted as Partial<GoalsState> | undefined
        return {
          ...current,
          goals: Array.isArray(saved?.goals) ? saved.goals : current.goals,
        }
      },
    }
  )
)

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
