import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { WelcomePage } from '@/pages/Welcome'
import { LoginPage } from '@/pages/Login/LoginPage'
import { OnboardingPage } from '@/pages/Onboarding'
import { HomePage } from '@/pages/Home'
import { GoalsPage } from '@/pages/Goals'
import { RoomPage } from '@/pages/Room'
import { LectureRoomPage } from '@/pages/LectureRoom'
import { ProfilePage } from '@/pages/Profile'
import { useUserStore, useGoalsStore } from '@/store'
import { useEffect } from 'react'
import { onAuthStateChange, getCurrentUser } from '@/services/auth.service'

// 受保护路由组件 - 检查是否需要 onboarding
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, needsOnboarding, authChecked } = useUserStore()
  const location = useLocation()

  // 还未完成认证检查时，显示 loading 或空内容（防止闪烁跳转）
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">正在验证身份...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // 如果需要 onboarding 且当前不在 onboarding 页面，则重定向
  if (needsOnboarding() && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}

function App() {
  const { isAuthenticated, isDemo, initializeUser, setAuthChecked } = useUserStore()

  // 监听 Supabase Auth 状态，实现持久登录
  useEffect(() => {
    const { data: { subscription } } = onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user && !isAuthenticated && !isDemo) {
        // Supabase 已登录 → 立即标记认证成功，防止闪退
        useUserStore.setState({
          isAuthenticated: true,
          isDemo: false,
          user: {
            id: session.user.id,
            email: session.user.email || '',
            nickname: session.user.user_metadata?.nickname || session.user.email || '',
            createdAt: new Date().toISOString()
          }
        })
        // 异步初始化用户数据（新用户自动创建 DB 记录，老用户直接加载）
        try {
          await initializeUser(
            session.user.id,
            session.user.email || '',
            session.user.user_metadata?.nickname || session.user.email || '探索者'
          )
          // 登录后立即从 DB 加载 goals，覆盖 localStorage 中的旧缓存
          await useGoalsStore.getState().loadGoals(session.user.id)
        } catch (error) {
          console.error('User init failed:', error)
        }
      }
      if (event === 'SIGNED_OUT') {
        // Supabase 已登出（其他标签页触发的），清空所有数据
        useGoalsStore.getState().setGoals([])
        useGoalsStore.setState({ currentGoal: null })
        setAuthChecked(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [isAuthenticated, isDemo, initializeUser, setAuthChecked])

  // 启动时必须验证 Supabase 会话有效性
  useEffect(() => {
    const checkAuth = async () => {
      if (isAuthenticated && !isDemo) {
        // Zustand 恢复了 isAuthenticated=true，但需要向 Supabase 验证会话是否仍然有效
        const { user } = await getCurrentUser()
        if (user) {
          // Supabase 会话有效，初始化/加载用户数据（自动处理新用户创建）
          try {
            const storeUser = useUserStore.getState().user
            await initializeUser(
              user.id,
              storeUser?.email || user.email || '',
              storeUser?.nickname || user.user_metadata?.nickname || '探索者'
            )
            // 从 DB 重新加载 goals，覆盖可能残留的旧缓存
            await useGoalsStore.getState().loadGoals(user.id)
          } catch (error) {
            console.error('Init user on refresh failed:', error)
          }
        } else {
          // Supabase 会话已失效（过期/被撤销），清除本地状态
          useUserStore.getState().clearAuth()
        }
      }
      // 标记认证检查完成
      setAuthChecked(true)
    }
    checkAuth()
  }, []) // 只在挂载时执行一次

  return (
    <HashRouter>
      <Routes>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/onboarding" element={
          <ProtectedRoute>
            <OnboardingPage />
          </ProtectedRoute>
        } />
        <Route path="/*" element={
          <ProtectedRoute>
            <AppLayout>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/goals" element={<GoalsPage />} />
                <Route path="/goals/lecture/:goalId" element={<LectureRoomPage />} />
                <Route path="/room" element={<RoomPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Routes>
            </AppLayout>
          </ProtectedRoute>
        } />
      </Routes>
    </HashRouter>
  )
}

export default App
