import { isSupabaseConfigured, supabase } from '@/services/supabase'
import type { CourseModel } from './types'

export interface CourseEngineRepository {
  getByGoalId(goalId: string): CourseModel | null
  save(model: CourseModel): void
  deleteByGoalId(goalId: string): void
  list(): CourseModel[]
}

const STORAGE_KEY = 'questmind-course-engine-v1'

function readAll(): CourseModel[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(models: CourseModel[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(models.slice(-20)))
}

export class LocalCourseEngineRepository implements CourseEngineRepository {
  getByGoalId(goalId: string): CourseModel | null {
    return readAll().find(model => model.goalId === goalId) || null
  }
  save(model: CourseModel): void {
    const models = readAll()
    const index = models.findIndex(item => item.goalId === model.goalId)
    if (index >= 0) models[index] = model
    else models.push(model)
    writeAll(models)
  }
  deleteByGoalId(goalId: string): void {
    writeAll(readAll().filter(model => model.goalId !== goalId))
  }
  list(): CourseModel[] {
    return readAll()
  }
}

/**
 * 云端 Repository（async）：以 courses.snapshot JSON 列作为 CourseModel 持久化通道。
 * 不实现同步接口 — 调用方使用对应的 `*Async` 方法。
 *
 * 注意：courses 表的主键策略在 add_course_engine.sql 中是
 *   UNIQUE (user_id, goal_id)，所以同一 user/goal 在云端只有一行快照。
 *
 * 如果云端 courses 表 / snapshot 列尚未部署（add_course_engine_snapshots.sql
 * 未执行），所有方法都会以 throw 失败；调用方负责 try/catch 并降级到本地。
 */
export class SupabaseCourseEngineRepository {
  constructor(private readonly userId: string) {}

  async listAsync(): Promise<CourseModel[]> {
    return this.fetchAll()
  }

  async getByGoalIdAsync(goalId: string): Promise<CourseModel | null> {
    const models = await this.fetchAll()
    return models.find(model => model.goalId === goalId) || null
  }

  async saveAsync(model: CourseModel): Promise<void> {
    const { error } = await supabase
      .from('courses')
      .upsert(
        {
          user_id: this.userId,
          goal_id: model.goalId,
          name: model.name,
          snapshot: model,
          snapshot_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,goal_id' },
      )
    if (error) throw new Error(`course snapshot upsert failed: ${error.message}`)
  }

  async deleteByGoalIdAsync(goalId: string): Promise<void> {
    const { error } = await supabase
      .from('courses')
      .update({ snapshot: null, snapshot_updated_at: new Date().toISOString() })
      .eq('user_id', this.userId)
      .eq('goal_id', goalId)
    if (error) throw new Error(`course snapshot delete failed: ${error.message}`)
  }

  private async fetchAll(): Promise<CourseModel[]> {
    const { data, error } = await supabase
      .from('courses')
      .select('snapshot')
      .eq('user_id', this.userId)
      .not('snapshot', 'is', null)
    if (error) return []
    return (data || [])
      .map((row: { snapshot: CourseModel | null }) => row.snapshot)
      .filter((model): model is CourseModel => Boolean(model))
  }
}

/**
 * 当前激活的本地 Repository（向后兼容）。
 * 客户端运行 store 仍然是 localStorage，云端备份由 service.ts 调用。
 */
export const localCourseEngineRepository = new LocalCourseEngineRepository()

export const courseEngineRepository: CourseEngineRepository = localCourseEngineRepository

export type RepositoryBackend = 'local' | 'cloud'

export function getRepositoryBackendForUser(userId: string | undefined): RepositoryBackend {
  if (!userId || !isSupabaseConfigured()) return 'local'
  if (typeof localStorage === 'undefined') return 'local'
  return localStorage.getItem(`questmind-ce-backend-${userId}`) === 'cloud' ? 'cloud' : 'local'
}

/**
 * 一次性迁移：把 localStorage 的所有 CourseModel 上传到 cloud。
 * 成功后才落 `questmind-ce-backend-{userId} = 'cloud'`。
 *
 * 调用时机：用户登录后、首次进入 Goals 页面。
 */
export async function migrateCourseModelsToCloud(userId: string): Promise<{
  uploaded: number
  skipped: number
  failed: number
}> {
  if (!userId || !isSupabaseConfigured()) {
    return { uploaded: 0, skipped: 0, failed: 0 }
  }
  const localModels = localCourseEngineRepository.list()
  if (!localModels.length) return { uploaded: 0, skipped: 0, failed: 0 }

  const repo = new SupabaseCourseEngineRepository(userId)
  let uploaded = 0
  let failed = 0
  for (const model of localModels) {
    try {
      await repo.saveAsync(model)
      uploaded += 1
    } catch (error) {
      console.warn('[course-engine] 迁移失败：', model.goalId, error)
      failed += 1
    }
  }
  if (typeof localStorage !== 'undefined' && uploaded > 0 && failed === 0) {
    localStorage.setItem(`questmind-ce-backend-${userId}`, 'cloud')
  }
  return { uploaded, skipped: 0, failed }
}

/**
 * 把云端 snapshot 拉回本地（用于跨设备首次登录场景）。
 */
export async function hydrateCourseModelsFromCloud(userId: string): Promise<{
  hydrated: number
}> {
  if (!userId || !isSupabaseConfigured()) return { hydrated: 0 }
  const repo = new SupabaseCourseEngineRepository(userId)
  const remote = await repo.listAsync()
  if (!remote.length) return { hydrated: 0 }
  const local = localCourseEngineRepository.list()
  for (const model of remote) {
    const existing = local.find(m => m.goalId === model.goalId)
    if (!existing || existing.updatedAt < model.updatedAt) {
      localCourseEngineRepository.save(model)
    }
  }
  return { hydrated: remote.length }
}
