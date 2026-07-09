import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type {
  User,
  Goal,
  SubGoal,
  DailyTask,
  AIMessage
} from '@/types'

// 环境变量
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// 创建 Supabase 客户端（单例模式）
let _supabaseInstance: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_supabaseInstance) {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
    }
    _supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,    // 持久化会话
        autoRefreshToken: true,  // 自动刷新 Token
      }
    })
  }
  return _supabaseInstance
}

// 导出便捷别名
const supabase = getSupabase()
export { supabase }

// 检查是否已配置
export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey)
}

// =====================================================
// 用户相关操作
// =====================================================

export async function getUserProfile(userId: string): Promise<User | null> {
  const client = getSupabase()
  const { data, error } = await client
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()
  
  if (error) {
    console.error('Error fetching user profile:', error)
    return null
  }
  return transformUserFromDb(data)
}

export async function getUserByAuthId(authId: string): Promise<User | null> {
  const client = getSupabase()
  // 用 maybeSingle() 替代 single()，查不到记录时返回 null 而不是报错
  const { data, error } = await client
    .from('users')
    .select('*')
    .eq('auth_id', authId)
    .maybeSingle()
  
  if (error) {
    console.error('Error fetching user by auth_id:', error)
    return null
  }
  return data ? transformUserFromDb(data) : null
}

export async function createUser(profile: {
  authId: string
  email: string
  nickname: string
  avatar?: string
}): Promise<User | null> {
  const client = getSupabase()
  const { data, error } = await client
    .from('users')
    .insert({
      auth_id: profile.authId,
      email: profile.email || null,
      nickname: profile.nickname,
      avatar: profile.avatar
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating user:', error)
    return null
  }
  return transformUserFromDb(data)
}

export async function updateUserProfile(
  userId: string,
  updates: Partial<User>
): Promise<User | null> {
  const client = getSupabase()
  const dbUpdates: Record<string, any> = {}
  
  if (updates.nickname !== undefined) dbUpdates.nickname = updates.nickname
  if (updates.avatar !== undefined) dbUpdates.avatar = updates.avatar
  if (updates.timePreference !== undefined) dbUpdates.time_preference = updates.timePreference
  if (updates.goalPreferences !== undefined) dbUpdates.goal_preferences = updates.goalPreferences
  if (updates.onboardingCompleted !== undefined) dbUpdates.onboarding_completed = updates.onboardingCompleted
  if (updates.city !== undefined) dbUpdates.city = updates.city
  
  const { data, error } = await client
    .from('users')
    .update(dbUpdates)
    .eq('id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('Error updating user profile:', error)
    return null
  }
  return transformUserFromDb(data)
}

/**
 * 完成用户 Onboarding
 */
export async function completeUserOnboarding(
  userId: string,
  data: {
    nickname: string
    avatar?: string
    timePreference: string
    goalPreferences: string[]
  }
): Promise<User | null> {
  const client = getSupabase()
  
  const { data: updatedUser, error } = await client
    .from('users')
    .update({
      nickname: data.nickname,
      avatar: data.avatar,
      time_preference: data.timePreference,
      goal_preferences: data.goalPreferences,
      onboarding_completed: true
    })
    .eq('id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('Error completing onboarding:', error)
    return null
  }
  return transformUserFromDb(updatedUser)
}


// =====================================================
// 目标相关操作
// =====================================================

export async function getGoals(userId: string): Promise<Goal[]> {
  const client = getSupabase()
  const { data, error } = await client
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching goals:', error)
    return []
  }
  
  // 获取每个目标的子目标和每日任务
  const goalsWithSubGoals = await Promise.all(
    (data || []).map(async (goal) => {
      const subGoals = await getSubGoals(goal.id)
      const dailyTasks = await getDailyTasks(goal.id)
      return transformGoalFromDb(goal, subGoals, dailyTasks)
    })
  )
  
  return goalsWithSubGoals
}

export async function getGoalById(goalId: string, userId?: string): Promise<Goal | null> {
  const client = getSupabase()
  let query = client
    .from('goals')
    .select('*')
    .eq('id', goalId)

  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { data, error } = await query.single()
  
  if (error || !data) {
    return null
  }

  const subGoals = await getSubGoals(goalId)
  const dailyTasks = await getDailyTasks(goalId)
  return transformGoalFromDb(data, subGoals, dailyTasks)
}

export async function createGoal(
  userId: string,
  goal: Omit<Goal, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'subGoals' | 'progress'>
): Promise<Goal | null> {
  const client = getSupabase()
  const { data, error } = await client
    .from('goals')
    .insert({
      user_id: userId,
      title: goal.title,
      description: goal.description,
      status: goal.status,
      priority: goal.priority,
      start_date: goal.startDate,
      end_date: goal.endDate,
      current_status: goal.currentStatus,
      context: goal.context,
      attachments: goal.attachments || [],
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating goal:', error)
    return null
  }
  
  return transformGoalFromDb(data, [], [])
}

export async function updateGoal(
  goalId: string,
  updates: Partial<Goal>,
  userId?: string
): Promise<Goal | null> {
  const client = getSupabase()
  const dbUpdates: Record<string, any> = {}
  
  if (updates.title !== undefined) dbUpdates.title = updates.title
  if (updates.description !== undefined) dbUpdates.description = updates.description
  if (updates.status !== undefined) dbUpdates.status = updates.status
  if (updates.priority !== undefined) dbUpdates.priority = updates.priority
  if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate
  if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate
  if (updates.progress !== undefined) dbUpdates.progress = updates.progress
  if (updates.currentStatus !== undefined) dbUpdates.current_status = updates.currentStatus
  if (updates.context !== undefined) dbUpdates.context = updates.context
  if (updates.attachments !== undefined) dbUpdates.attachments = updates.attachments
  
  let query = client
    .from('goals')
    .update(dbUpdates)
    .eq('id', goalId)

  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { data, error } = await query.select()
  
  if (error || !data || data.length === 0) {
    console.error('Error updating goal:', error ?? 'No rows returned')
    return null
  }
  
  const subGoals = await getSubGoals(goalId)
  const dailyTasks = await getDailyTasks(goalId)
  return transformGoalFromDb(data[0], subGoals, dailyTasks)
}

export async function deleteGoal(goalId: string, userId?: string): Promise<boolean> {
  const client = getSupabase()
  let query = client
    .from('goals')
    .delete()
    .eq('id', goalId)

  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { error } = await query
  
  if (error) {
    console.error('Error deleting goal:', error)
    return false
  }
  return true
}

// =====================================================
// 子目标相关操作
// =====================================================

export async function getSubGoals(goalId: string): Promise<SubGoal[]> {
  const client = getSupabase()
  const { data, error } = await client
    .from('sub_goals')
    .select('*')
    .eq('goal_id', goalId)
    .order('order_index', { ascending: true })
  
  if (error) {
    console.error('Error fetching sub_goals:', error)
    return []
  }
  
  return (data || []).map(transformSubGoalFromDb)
}

export async function createSubGoal(
  goalId: string,
  title: string,
  orderIndex: number = 0
): Promise<SubGoal | null> {
  const client = getSupabase()
  const { data, error } = await client
    .from('sub_goals')
    .insert({
      goal_id: goalId,
      title,
      order_index: orderIndex
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating sub_goal:', error)
    return null
  }
  
  return transformSubGoalFromDb(data)
}

export async function toggleSubGoal(subGoalId: string): Promise<SubGoal | null> {
  const client = getSupabase()
  
  // 先获取当前状态
  const { data: current, error: fetchError } = await client
    .from('sub_goals')
    .select('completed')
    .eq('id', subGoalId)
    .single()
  
  if (fetchError || !current) {
    return null
  }
  
  const newCompleted = !current.completed
  const completedAt = newCompleted ? new Date().toISOString() : null
  
  const { data, error } = await client
    .from('sub_goals')
    .update({
      completed: newCompleted,
      completed_at: completedAt
    })
    .eq('id', subGoalId)
    .select()
    .single()
  
  if (error) {
    console.error('Error toggling sub_goal:', error)
    return null
  }
  
  // 更新父目标的进度
  await recalculateGoalProgress(data.goal_id)
  
  return transformSubGoalFromDb(data)
}

export async function deleteSubGoal(subGoalId: string): Promise<boolean> {
  const client = getSupabase()
  
  // 获取父目标 ID
  const { data: subGoal } = await client
    .from('sub_goals')
    .select('goal_id')
    .eq('id', subGoalId)
    .single()
  
  const { error } = await client
    .from('sub_goals')
    .delete()
    .eq('id', subGoalId)
  
  if (error) {
    console.error('Error deleting sub_goal:', error)
    return false
  }
  
  // 重新计算进度
  if (subGoal) {
    await recalculateGoalProgress(subGoal.goal_id)
  }
  
  return true
}

// =====================================================
// 每日任务相关操作
// =====================================================

export async function getDailyTasks(goalId: string): Promise<DailyTask[]> {
  const client = getSupabase()
  const { data, error } = await client
    .from('daily_tasks')
    .select('*')
    .eq('goal_id', goalId)
    .order('order_index', { ascending: true })
  
  if (error) {
    console.error('Error fetching daily_tasks:', error)
    return []
  }
  
  return (data || []).map(transformDailyTaskFromDb)
}

export async function createDailyTask(
  goalId: string,
  task: Omit<DailyTask, 'id' | 'goalId' | 'completed' | 'completedAt' | 'orderIndex'>
): Promise<DailyTask | null> {
  const client = getSupabase()
  const { data, error } = await client
    .from('daily_tasks')
    .insert({
      goal_id: goalId,
      title: task.title,
      description: task.description,
      duration: task.duration,
      frequency: task.frequency || 'daily'
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating daily_task:', error)
    return null
  }
  
  return transformDailyTaskFromDb(data)
}

export async function toggleDailyTask(taskId: string): Promise<DailyTask | null> {
  const client = getSupabase()
  
  // 先获取当前状态
  const { data: current, error: fetchError } = await client
    .from('daily_tasks')
    .select('completed')
    .eq('id', taskId)
    .single()
  
  if (fetchError || !current) {
    return null
  }
  
  const newCompleted = !current.completed
  const completedAt = newCompleted ? new Date().toISOString() : null
  
  const { data, error } = await client
    .from('daily_tasks')
    .update({
      completed: newCompleted,
      completed_at: completedAt
    })
    .eq('id', taskId)
    .select()
    .single()
  
  if (error) {
    console.error('Error toggling daily_task:', error)
    return null
  }
  
  return transformDailyTaskFromDb(data)
}

export async function deleteDailyTask(taskId: string): Promise<boolean> {
  const client = getSupabase()
  const { error } = await client
    .from('daily_tasks')
    .delete()
    .eq('id', taskId)
  
  if (error) {
    console.error('Error deleting daily_task:', error)
    return false
  }
  return true
}

// 批量创建每日任务
export async function createDailyTasks(
  goalId: string,
  tasks: Array<Omit<DailyTask, 'id' | 'goalId' | 'completed' | 'completedAt' | 'orderIndex'>>
): Promise<DailyTask[]> {
  const client = getSupabase()
  const tasksToInsert = tasks.map((task, index) => ({
    goal_id: goalId,
    title: task.title,
    description: task.description,
    duration: task.duration,
    frequency: task.frequency || 'daily',
    order_index: index
  }))
  
  const { data, error } = await client
    .from('daily_tasks')
    .insert(tasksToInsert)
    .select()
  
  if (error) {
    console.error('Error creating daily_tasks:', error)
    return []
  }
  
  return (data || []).map(transformDailyTaskFromDb)
}

// 重置每日任务（将所有任务标记为未完成）
export async function resetDailyTasks(goalId: string): Promise<boolean> {
  const client = getSupabase()
  const { error } = await client
    .from('daily_tasks')
    .update({
      completed: false,
      completed_at: null
    })
    .eq('goal_id', goalId)
  
  if (error) {
    console.error('Error resetting daily_tasks:', error)
    return false
  }
  return true
}

async function recalculateGoalProgress(goalId: string): Promise<void> {
  const client = getSupabase()
  const subGoals = await getSubGoals(goalId)
  
  if (subGoals.length === 0) return
  
  const completedCount = subGoals.filter(sg => sg.completed).length
  const progress = Math.round((completedCount / subGoals.length) * 100)
  
  await client
    .from('goals')
    .update({ progress })
    .eq('id', goalId)
}

// =====================================================
// AI 聊天记录相关操作
// =====================================================

export async function getAIMessages(
  userId: string,
  characterId: string,
  limit: number = 50
): Promise<AIMessage[]> {
  const client = getSupabase()
  const { data, error } = await client
    .from('ai_messages')
    .select('*')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .order('created_at', { ascending: true })
    .limit(limit)
  
  if (error) {
    console.error('Error fetching AI messages:', error)
    return []
  }
  
  return (data || []).map(transformAIMessageFromDb)
}

export async function saveAIMessage(
  userId: string,
  message: Omit<AIMessage, 'id' | 'timestamp'>
): Promise<AIMessage | null> {
  const client = getSupabase()
  const { data, error } = await client
    .from('ai_messages')
    .insert({
      user_id: userId,
      character_id: message.characterId,
      content: message.content,
      is_user: message.isUser
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error saving AI message:', error)
    return null
  }
  
  return transformAIMessageFromDb(data)
}

// =====================================================
// 文件/头像上传相关操作
// =====================================================

/**
 * 上传用户头像到 Supabase Storage
 * @param _profileId 用户在 users 表中的 profile ID（已登录用户）
 * @param file 图片文件（File 对象）
 * @returns 上传后的公开访问 URL，失败返回 null
 */
export async function uploadUserAvatar(
  _profileId: string,
  file: File
): Promise<string | null> {
  const client = getSupabase()

  // 限制文件大小（最大 2MB）
  const MAX_SIZE = 2 * 1024 * 1024
  if (file.size > MAX_SIZE) {
    console.error('Avatar file too large: max 2MB')
    return null
  }

  // 限制文件类型
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!ALLOWED_TYPES.includes(file.type)) {
    console.error('Unsupported image type')
    return null
  }

  // 获取 Supabase Auth 的用户 ID（用于 RLS 路径匹配）
  // 重要：必须用 Auth 的用户 ID，而不是 profileId
  // 因为 RLS 策略检查的是 auth.uid()，不是 users.id
  const { data: sessionData } = await client.auth.getSession()
  const authUserId = sessionData?.session?.user?.id
  
  if (!authUserId) {
    console.error('No authenticated session found')
    return null
  }

  // 生成唯一文件名：avatars/{authUserId}/{timestamp}.{ext}
  const ext = file.name.split('.').pop() || 'jpg'
  const fileName = `${authUserId}/${Date.now()}.${ext}`

  // 1. 先尝试删除该用户目录下可能存在的旧头像文件
  try {
    const { data: listData } = await client.storage
      .from('avatars')
      .list(authUserId, { limit: 10 })

    if (listData && listData.length > 0) {
      const oldFiles = listData.map(f => `${authUserId}/${f.name}`)
      await client.storage.from('avatars').remove(oldFiles)
    }
  } catch (e) {
    console.warn('Cleanup old avatar files failed (non-critical):', e)
  }

  // 2. 上传新文件
  const { error: uploadError } = await client.storage
    .from('avatars')
    .upload(fileName, file, {
      cacheControl: '3600',
      contentType: file.type,
    })

  if (uploadError) {
    console.error('Error uploading avatar:', uploadError)
    return null
  }

  // 3. 获取公开 URL
  const { data: urlData } = client.storage
    .from('avatars')
    .getPublicUrl(fileName)

  return urlData?.publicUrl || null
}

/**
 * 删除用户旧的头像文件
 */
export async function deleteUserAvatar(avatarUrl: string): Promise<void> {
  const client = getSupabase()
  try {
    // 从 URL 中提取路径: .../avatars/{path}
    const match = avatarUrl.match(/\/avatars\/(.+)$/)
    if (match?.[1]) {
      await client.storage.from('avatars').remove([match[1]])
    }
  } catch (e) {
    // 删除失败不阻塞主流程
    console.warn('Failed to delete old avatar:', e)
  }
}

// =====================================================
// 目标附件上传相关操作
// =====================================================

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const DOCUMENT_TYPES = [
  'text/plain', 'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
]
const ACCEPTABLE_TYPES = [...IMAGE_TYPES, ...DOCUMENT_TYPES]
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

/**
 * 校验文件类型是否被允许
 */
export function isAcceptableFileType(file: File): boolean {
  return ACCEPTABLE_TYPES.includes(file.type) || /\.(txt|md|pdf|docx|jpg|jpeg|png|gif|webp)$/i.test(file.name)
}

/**
 * 根据 MIME 类型判断附件类型
 */
export function getAttachmentType(mimeType: string): 'document' | 'image' {
  return IMAGE_TYPES.includes(mimeType) ? 'image' : 'document'
}

/**
 * 上传目标附件到 Supabase Storage
 */
export async function uploadGoalAttachment(
  goalId: string,
  file: File,
): Promise<{ storagePath: string; url: string } | null> {
  const client = getSupabase()

  // 校验
  if (file.size > MAX_FILE_SIZE) {
    console.error('File too large: max 10MB')
    return null
  }
  if (!isAcceptableFileType(file)) {
    console.error('Unsupported file type:', file.type, file.name)
    return null
  }

  // 获取 auth user ID
  const { data: sessionData } = await client.auth.getSession()
  const authUserId = sessionData?.session?.user?.id
  if (!authUserId) {
    console.error('No authenticated session found')
    return null
  }

  const ext = file.name.split('.').pop() || 'bin'
  const fileId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const storagePath = `${authUserId}/${goalId}/${fileId}.${ext}`

  const { error } = await client.storage
    .from('goal-attachments')
    .upload(storagePath, file, {
      cacheControl: '3600',
      contentType: file.type,
    })

  if (error) {
    console.error('Error uploading attachment:', error)
    return null
  }

  const { data: urlData } = client.storage
    .from('goal-attachments')
    .getPublicUrl(storagePath)

  return { storagePath, url: urlData?.publicUrl || '' }
}

/**
 * 删除目标附件
 */
export async function deleteGoalAttachment(storagePath: string): Promise<boolean> {
  const client = getSupabase()
  const { error } = await client.storage
    .from('goal-attachments')
    .remove([storagePath])
  if (error) {
    console.error('Error deleting attachment:', error)
    return false
  }
  return true
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// =====================================================
// 数据转换函数 (数据库格式 -> 应用格式)
// =====================================================

function transformUserFromDb(data: any): User {
  return {
    id: data.id,
    email: data.email || undefined,
    nickname: data.nickname,
    avatar: data.avatar,
    createdAt: data.created_at,
    timePreference: data.time_preference,
    goalPreferences: data.goal_preferences,
    onboardingCompleted: data.onboarding_completed,
    totalGoalsCompleted: data.total_goals_completed ?? 0,
    totalFocusMinutes: data.total_focus_minutes ?? 0,
    city: data.city || undefined,
  }
}

function transformGoalFromDb(data: any, subGoals: SubGoal[], dailyTasks: DailyTask[] = []): Goal {
  return {
    id: data.id,
    userId: data.user_id,
    title: data.title,
    description: data.description || '',
    status: data.status,
    priority: data.priority,
    startDate: data.start_date,
    endDate: data.end_date,
    progress: data.progress,
    subGoals,
    dailyTasks,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    currentStatus: data.current_status,
    context: data.context || undefined,
    attachments: data.attachments || [],
  }
}

function transformDailyTaskFromDb(data: any): DailyTask {
  return {
    id: data.id,
    goalId: data.goal_id,
    title: data.title,
    description: data.description,
    duration: data.duration,
    frequency: data.frequency,
    completed: data.completed,
    completedAt: data.completed_at,
    orderIndex: data.order_index || 0
  }
}

function transformSubGoalFromDb(data: any): SubGoal {
  return {
    id: data.id,
    goalId: data.goal_id,
    title: data.title,
    completed: data.completed,
    completedAt: data.completed_at
  }
}

function transformAIMessageFromDb(data: any): AIMessage {
  return {
    id: data.id,
    characterId: data.character_id,
    content: data.content,
    timestamp: data.created_at,
    isUser: data.is_user
  }
}

