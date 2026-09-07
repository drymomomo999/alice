/**
 * 数据库同步服务
 * 负责将本地 Zustand Store 与 Supabase 数据库同步
 */

import * as db from './supabase'
import type { User, Goal, SubGoal } from '@/types'

// 同步状态
export interface SyncStatus {
  isSyncing: boolean
  lastSyncTime: string | null
  error: string | null
}

let syncStatus: SyncStatus = {
  isSyncing: false,
  lastSyncTime: null,
  error: null
}

// =====================================================
// 用户数据同步
// =====================================================

/**
 * 初始化用户数据
 * 当新用户注册时，创建数据库记录
 */
export async function initUserData(
  authId: string,
  email: string,
  nickname: string
): Promise<User | null> {
  try {
    // 检查是否已有用户记录
    let user = await db.getUserByAuthId(authId)
    
    if (!user) {
      // 创建新用户
      user = await db.createUser({ authId, email, nickname })
    }
    
    if (user) {
      // 用户初始化完成（可在此扩展）
    }
    
    return user
  } catch (error) {
    console.error('Error initializing user data:', error)
    return null
  }
}

/**
 * 同步用户数据到数据库
 */
export async function syncUserToDb(user: User): Promise<boolean> {
  try {
    await db.updateUserProfile(user.id, user)
    return true
  } catch (error) {
    console.error('Error syncing user to DB:', error)
    return false
  }
}

/**
 * 从数据库加载用户数据
 */
export async function loadUserFromDb(authId: string): Promise<User | null> {
  try {
    return await db.getUserByAuthId(authId)
  } catch (error) {
    console.error('Error loading user from DB:', error)
    return null
  }
}

// =====================================================
// 目标数据同步
// =====================================================

/**
 * 从数据库加载所有目标
 */
export async function loadGoalsFromDb(userId: string): Promise<Goal[]> {
  try {
    return await db.getGoals(userId)
  } catch (error) {
    console.error('Error loading goals from DB:', error)
    return []
  }
}

/**
 * 同步单个目标到数据库
 */
export async function syncGoalToDb(
  userId: string,
  goal: Omit<Goal, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'progress'> & { subGoals?: SubGoal[] }
): Promise<Goal | null> {
  try {
    const newGoal = await db.createGoal(userId, goal)
    return newGoal
  } catch (error) {
    console.error('Error syncing goal to DB:', error)
    return null
  }
}

/**
 * 更新数据库中的目标
 */
export async function updateGoalInDb(goalId: string, updates: Partial<Goal>): Promise<Goal | null> {
  try {
    return await db.updateGoal(goalId, updates)
  } catch (error) {
    console.error('Error updating goal in DB:', error)
    return null
  }
}

/**
 * 删除数据库中的目标
 */
export async function deleteGoalInDb(goalId: string): Promise<boolean> {
  try {
    return await db.deleteGoal(goalId)
  } catch (error) {
    console.error('Error deleting goal from DB:', error)
    return false
  }
}

/**
 * 添加子目标到数据库
 */
export async function addSubGoalToDb(goalId: string, title: string): Promise<boolean> {
  try {
    const subGoal = await db.createSubGoal(goalId, title)
    return !!subGoal
  } catch (error) {
    console.error('Error adding sub-goal to DB:', error)
    return false
  }
}

/**
 * 切换子目标完成状态
 */
export async function toggleSubGoalInDb(subGoalId: string): Promise<boolean> {
  try {
    const subGoal = await db.toggleSubGoal(subGoalId)
    return !!subGoal
  } catch (error) {
    console.error('Error toggling sub-goal in DB:', error)
    return false
  }
}

/**
 * 删除数据库中的子目标
 */
export async function deleteSubGoalInDb(subGoalId: string): Promise<boolean> {
  try {
    return await db.deleteSubGoal(subGoalId)
  } catch (error) {
    console.error('Error deleting sub-goal from DB:', error)
    return false
  }
}

// =====================================================
// 每日任务数据同步
// =====================================================

/**
 * 切换数据库中的每日任务完成状态
 */
export async function toggleDailyTaskInDb(taskId: string): Promise<boolean> {
  try {
    const task = await db.toggleDailyTask(taskId)
    return !!task
  } catch (error) {
    console.error('Error toggling daily task in DB:', error)
    return false
  }
}

/**
 * 批量创建每日任务到数据库
 */
export async function createDailyTasksInDb(
  goalId: string,
  tasks: Array<{ title: string; description?: string; duration?: number; frequency?: string }>
): Promise<boolean> {
  try {
    const result = await db.createDailyTasks(goalId, tasks.map(t => ({
      ...t,
      frequency: t.frequency as 'daily' | 'custom' || 'daily'
    })))
    return result.length > 0
  } catch (error) {
    console.error('Error creating daily tasks in DB:', error)
    return false
  }
}

/**
 * 重置数据库中的每日任务
 */
export async function resetDailyTasksInDb(goalId: string): Promise<boolean> {
  try {
    return await db.resetDailyTasks(goalId)
  } catch (error) {
    console.error('Error resetting daily tasks in DB:', error)
    return false
  }
}

// =====================================================
// AI 消息同步
// =====================================================

/**
 * 保存 AI 消息到数据库
 */
export async function saveAIMessageToDb(
  userId: string,
  characterId: string,
  content: string,
  isUser: boolean,
  scene?: 'HOME' | 'GOAL',
  goalId?: string
): Promise<boolean> {
  try {
    await db.saveAIMessage(userId, {
      characterId: characterId as any,
      content,
      isUser,
      scene,
      goalId,
    })
    return true
  } catch (error) {
    console.error('Error saving AI message to DB:', error)
    return false
  }
}

/**
 * 从数据库加载 AI 消息历史
 */
export async function loadAIMessagesFromDb(
  userId: string,
  characterId: string
): Promise<any[]> {
  try {
    return await db.getAIMessages(userId, characterId)
  } catch (error) {
    console.error('Error loading AI messages from DB:', error)
    return []
  }
}

// =====================================================
// 完整数据同步
// =====================================================

/**
 * 执行完整数据同步（首次加载）
 */
export async function fullSync(userId: string): Promise<{
  user: User | null
  goals: Goal[]
}> {
  syncStatus.isSyncing = true
  syncStatus.error = null
  
  try {
    const [user, goals] = await Promise.all([
      db.getUserProfile(userId),
      db.getGoals(userId)
    ])
    
    syncStatus.lastSyncTime = new Date().toISOString()
    
    return { user, goals }
  } catch (error) {
    console.error('Error during full sync:', error)
    syncStatus.error = (error as Error).message
    return {
      user: null,
      goals: []
    }
  } finally {
    syncStatus.isSyncing = false
  }
}

/**
 * 获取同步状态
 */
export function getSyncStatus(): SyncStatus {
  return { ...syncStatus }
}

// =====================================================
// 自动同步配置
// =====================================================

// 定时同步间隔（毫秒）
const AUTO_SYNC_INTERVAL = 5 * 60 * 1000 // 5分钟

let autoSyncTimer: number | null = null

/**
 * 启动自动同步
 */
export function startAutoSync(
  userId: string,
  onSync: () => void
): void {
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer)
  }
  
  autoSyncTimer = window.setInterval(async () => {
    if (!syncStatus.isSyncing && db.isSupabaseConfigured()) {
      await fullSync(userId)
      onSync()
    }
  }, AUTO_SYNC_INTERVAL)
}

/**
 * 停止自动同步
 */
export function stopAutoSync(): void {
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer)
    autoSyncTimer = null
  }
}

// =====================================================
// 离线数据处理
// =====================================================

// 本地待同步队列
let pendingSyncQueue: Array<{
  type: string
  data: any
  timestamp: number
}> = []

/**
 * 添加到待同步队列
 */
export function addToSyncQueue(type: string, data: any): void {
  pendingSyncQueue.push({
    type,
    data,
    timestamp: Date.now()
  })
  
  // 尝试立即同步
  processSyncQueue()
}

/**
 * 处理待同步队列
 */
async function processSyncQueue(): Promise<void> {
  if (!db.isSupabaseConfigured() || syncStatus.isSyncing || pendingSyncQueue.length === 0) {
    return
  }
  
  syncStatus.isSyncing = true
  
  try {
    const queue = [...pendingSyncQueue]
    pendingSyncQueue = []
    
    for (const item of queue) {
      switch (item.type) {
        case 'goal_create':
          await db.createGoal(item.data.userId, item.data.goal)
          break
        case 'goal_update':
          await db.updateGoal(item.data.goalId, item.data.updates)
          break
        case 'goal_delete':
          await db.deleteGoal(item.data.goalId)
          break
        case 'subgoal_toggle':
          await db.toggleSubGoal(item.data.subGoalId)
          break
        case 'user_update':
          await db.updateUserProfile(item.data.userId, item.data.updates)
          break
      }
    }
  } catch (error) {
    console.error('Error processing sync queue:', error)
    // 将未成功同步的项放回队列
  } finally {
    syncStatus.isSyncing = false
  }
}

/**
 * 获取待同步队列长度
 */
export function getPendingSyncCount(): number {
  return pendingSyncQueue.length
}
