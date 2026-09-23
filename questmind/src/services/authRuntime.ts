import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { useUserStore, useGoalsStore, useAIChatStore } from '@/store'
import { belongsToAccount } from './profileRecovery'
import { hydrateRelationshipStoreFromCloud } from './aliceRelationshipCloud.service'
import { setCourseEngineCurrentUser, syncCourseEngineOnLogin } from '@/course-engine/service'

/** Supabase 的认证回调必须同步返回；数据库请求放到回调之外执行，避免认证锁互等。 */
export function startAuthRuntime(): () => void {
  let disposed = false
  let revision = 0
  let loadedAuthId: string | undefined
  const restore = async (session: Session | null, version: number) => {
    if (disposed || version !== revision || useUserStore.getState().isDemo) return
    if (!session) {
      useUserStore.getState().clearAuth()
      return
    }
    const account = session.user
    const state = useUserStore.getState()
    if (!belongsToAccount(state.user, account.id, account.email)) {
      // 备份旧账号后才切换，避免不同账号的数据串用。
      if (state.user) localStorage.setItem(`questmind-account:${state.user.authId || state.user.id}`, JSON.stringify({ user: state.user, pendingProfile: state.pendingProfile, goals: useGoalsStore.getState().goals, chat: useAIChatStore.getState().messages }))
      const backup = localStorage.getItem(`questmind-account:${account.id}`)
      let saved: { user?: typeof state.user; pendingProfile?: typeof state.pendingProfile; goals?: ReturnType<typeof useGoalsStore.getState>['goals']; chat?: ReturnType<typeof useAIChatStore.getState>['messages'] } = {}
      try { saved = backup ? JSON.parse(backup) : {} } catch { /* 损坏备份不影响认证。 */ }
      useUserStore.setState({ user: saved.user || null, pendingProfile: saved.pendingProfile || {} })
      useGoalsStore.getState().setGoals(saved.goals || [])
      useAIChatStore.getState().clearAllMessages()
      if (saved.chat) useAIChatStore.setState({ messages: saved.chat })
    }
    useUserStore.setState({ isAuthenticated: true, isDemo: false })
    if (useUserStore.getState().user) useUserStore.getState().setAuthChecked(true)
    if (loadedAuthId === account.id) return
    loadedAuthId = account.id
    await useUserStore.getState().initializeUser(account.id, account.email || '', account.user_metadata?.nickname || '探索者')
    if (disposed || version !== revision) return
    const profile = useUserStore.getState().user
    useUserStore.getState().setAuthChecked(true)
    if (!profile) { loadedAuthId = undefined; return }
    // users.id 与 auth.uid() 是不同的 ID；业务表关联的是 users.id。
    setCourseEngineCurrentUser(profile.id)
    void Promise.allSettled([
      useGoalsStore.getState().loadGoals(profile.id),
      hydrateRelationshipStoreFromCloud(profile.id),
      syncCourseEngineOnLogin(profile.id),
    ])
  }
  const schedule = (session: Session | null) => {
    const version = ++revision
    window.setTimeout(() => { void restore(session, version).catch(() => {
      loadedAuthId = undefined
      if (!disposed) useUserStore.getState().setAuthChecked(true)
    }) }, 0)
  }
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') { loadedAuthId = undefined; setCourseEngineCurrentUser(undefined); schedule(null) }
    else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') schedule(session)
  })
  const retry = () => {
    loadedAuthId = undefined
    void supabase.auth.getSession().then(({ data, error }) => {
      if (disposed) return
      if (!error) schedule(data.session)
      else useUserStore.getState().setAuthChecked(true)
    }).catch(() => { if (!disposed) useUserStore.getState().setAuthChecked(true) })
  }
  retry()
  // 离线/网络超时时保留此前的本地资料，不将网络故障当成退出登录。
  const timeout = window.setTimeout(() => { if (!disposed) useUserStore.getState().setAuthChecked(true) }, 8000)
  window.addEventListener('online', retry)
  return () => { disposed = true; revision++; subscription.unsubscribe(); window.clearTimeout(timeout); window.removeEventListener('online', retry) }
}
