import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { WelcomePage } from '@/pages/Welcome'
import { LoginPage } from '@/pages/Login/LoginPage'
import { OnboardingPage } from '@/pages/Onboarding'
import { HomePage } from '@/pages/Home'
import { GoalsPage } from '@/pages/Goals'
import { RoomPage } from '@/pages/Room'
import { LectureRoomPage } from '@/pages/LectureRoom'
import { ProfilePage } from '@/pages/Profile'
import { CoursewareStudyPage } from '@/pages/CoursewareStudy'
import { useUserStore } from '@/store'
import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { startAuthRuntime } from '@/services/authRuntime'

function DesktopPetNavigationBridge() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    const unlisten = listen<string>('desktop-pet:navigate', event => navigate(event.payload))
    return () => { void unlisten.then(dispose => dispose()) }
  }, [navigate])

  return null
}

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

function MainApplication() {
  useEffect(() => startAuthRuntime(), [])
  return (
    <HashRouter>
      <DesktopPetNavigationBridge />
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
                <Route path="/courseware" element={<CoursewareStudyPage />} />
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

function App() {
  return <MainApplication />
}

export default App
