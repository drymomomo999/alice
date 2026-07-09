import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Home,
  Target,
  User,
  LogOut,
  Sparkles,
  Menu,
  X,
  Languages,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUserStore } from '@/store'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import LogoImg from '@/assets/logo.png'
import { useI18nStore, useT } from '@/i18n'

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useUserStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const { locale, toggleLocale } = useI18nStore()
  const t = useT()

  const navItems = [
    { path: '/', icon: Home, label: t('nav.home'), emoji: '🏠' },
    { path: '/goals', icon: Target, label: t('nav.goals'), emoji: '🎯' },
    { path: '/room', icon: Sparkles, label: t('nav.room'), emoji: '✨' },
    { path: '/profile', icon: User, label: t('nav.profile'), emoji: '👤' },
  ]

  const handleLogout = async () => {
    await logout()
    navigate('/login')
    setMenuOpen(false)
  }

  return (
    <div className="min-h-screen bg-sakura-base text-foreground relative overflow-hidden">
      {/* === Sakura Background Decoration === */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-sakura-pale/60 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full bg-lavender-light/40 blur-[80px]" />
        <div className="absolute top-[40%] right-[10%] w-[300px] h-[300px] rounded-full bg-peach-light/20 blur-[60px]" />
      </div>

      {/* === Top Header === */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-white/90 backdrop-blur-xl border-b border-sakura-light/30 shadow-sm shadow-sakura-pink/5">
        <div className="flex items-center justify-between h-full px-4 max-w-[1600px] mx-auto">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-xl hover:bg-sakura-pale transition-all active:scale-90"
          >
            {menuOpen
              ? <X className="w-5 h-5 text-sakura" />
              : <Menu className="w-5 h-5 text-sakura" />}
          </button>

          <div className="flex items-center gap-2">
            <img src={LogoImg} alt="QuestMind" className="w-8 h-8 rounded-xl shadow-md shadow-sakura-pink/25 object-cover" />
            <span className="font-bold text-sm tracking-wide text-sakura">QuestMind</span>
          </div>

          <Link to="/profile" className="p-1">
            <Avatar className="w-8 h-8 ring-2 ring-sakura-light/60 ring-offset-1 ring-offset-white">
              {(() => {
                const isImg = user?.avatar && /^(http:\/\/|https:\/\/|\/)/.test(user.avatar)
                return isImg ? <AvatarImage src={user!.avatar} /> : null
              })()}
              <AvatarFallback className="bg-gradient-to-br from-sakura-pink/20 to-lavender/20 text-sakura text-xs font-bold">
                {(() => {
                  const isImg = user?.avatar && /^(http:\/\/|https:\/\/|\/)/.test(user.avatar)
                  return !isImg ? (user?.avatar || user?.nickname?.[0] || 'Q') : (user?.nickname?.[0] || 'Q')
                })()}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </header>

      {/* === Side Menu Overlay (for settings / profile / logout) === */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => setMenuOpen(false)}
        >
          <nav
            className="absolute left-0 top-14 bottom-20 w-72 bg-white/97 backdrop-blur-xl border-r border-sakura-light/20 shadow-xl shadow-sakura-pink/5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* User header */}
            <div className="h-28 bg-gradient-to-b from-sakura-pale to-white relative border-b border-sakura-light/20 overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(340_75%_65%/0.06)_0%,_transparent_70%)]" />
              <div className="relative h-full flex items-end justify-center pb-4">
                <div className="text-center">
                  <Avatar className="w-14 h-14 mx-auto mb-2 ring-2 ring-sakura-pink/30 shadow-lg shadow-sakura-pink/10">
                    {(() => {
                      const isImg = user?.avatar && /^(http:\/\/|https:\/\/|\/)/.test(user.avatar)
                      return isImg ? <AvatarImage src={user!.avatar} /> : null
                    })()}
                    <AvatarFallback className="bg-gradient-to-br from-sakura-pink/20 to-lavender/20 text-sakura text-lg font-bold">
                      {(() => {
                        const isImg = user?.avatar && /^(http:\/\/|https:\/\/|\/)/.test(user.avatar)
                        return !isImg ? (user?.avatar || user?.nickname?.[0] || 'Q') : (user?.nickname?.[0] || 'Q')
                      })()}
                    </AvatarFallback>
                  </Avatar>
                  <p className="font-bold text-sm text-foreground">{user?.nickname || '小伙伴'}</p>
                </div>
              </div>
            </div>

            {/* Menu links */}
            <div className="p-3 space-y-1">
              <Link
                to="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-sakura-pale hover:text-foreground transition-all"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gray-50 text-base">⚙️</div>
                <span className="text-sm font-medium">{t('nav.settings')}</span>
              </Link>

              {/* Language toggle */}
              <button
                onClick={toggleLocale}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-sakura-pale hover:text-foreground transition-all w-full"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gray-50">
                  <Languages className="w-4 h-4 text-sakura" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium">{t('lang.switch')}</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">
                    {locale === 'zh' ? '当前：中文 → Switch to English' : 'Current: English → 切换为中文'}
                  </span>
                </div>
              </button>
            </div>

            {/* Logout */}
            <div className="p-3 mt-2 border-t border-sakura-light/20">
              <button
                onClick={handleLogout}
                className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-red-400 bg-red-50 hover:bg-red-100 transition-all font-medium text-sm"
              >
                <LogOut className="w-4 h-4" />
                {t('nav.logout')}
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* === Main Content Area === */}
      <main className="min-h-screen pt-14 pb-20 transition-all duration-300 relative">
        <div className={cn(
          'relative z-10 max-w-[1600px] mx-auto',
          location.pathname === '/' ? 'p-0 h-[calc(100vh-8.5rem)]' : 'p-4'
        )}>
          {children}
        </div>
      </main>

      {/* === Bottom Tab Bar === */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-sakura-light/30 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] safe-area-bottom">
        <div className="flex items-center justify-around h-16 max-w-[1600px] mx-auto px-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path))
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 w-16 py-1.5 rounded-2xl transition-all duration-200 relative',
                  isActive
                    ? 'text-sakura'
                    : 'text-gray-400 hover:text-gray-600'
                )}
              >
                {/* Active indicator dot */}
                {isActive && (
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-gradient-to-r from-sakura-pink to-peach-orange" />
                )}

                {/* Active background pill */}
                {isActive && (
                  <div className="absolute inset-x-1 top-0.5 bottom-1 rounded-2xl bg-gradient-to-b from-sakura-pink/10 to-sakura-pink/5" />
                )}

                <span className={cn(
                  'text-xl transition-all duration-200 relative',
                  isActive && 'scale-110'
                )}>
                  {item.emoji}
                </span>
                <span className={cn(
                  'text-[10px] font-semibold transition-all duration-200 relative',
                  isActive && 'text-sakura'
                )}>
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>

        {/* Safe area spacer for iOS */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  )
}
