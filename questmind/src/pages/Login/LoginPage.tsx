import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useUserStore } from '@/store'
import {
  signInWithEmail,
  signUpWithEmail,
} from '@/services/auth.service'
import LogoImg from '@/assets/logo.png'

type AuthMode = 'login' | 'register'

export function LoginPage() {
  const navigate = useNavigate()
  const { isAuthenticated, initializeUser, loadUser } = useUserStore()

  const [mode, setMode] = useState<AuthMode>('login')
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email) { setError('请输入邮箱地址'); return }
    if (!password) { setError('请输入密码'); return }

    if (mode === 'register') {
      if (!nickname) { setError('请输入昵称'); return }
      if (password !== confirmPassword) { setError('两次输入的密码不一致'); return }
      if (password.length < 6) { setError('密码至少需要6位'); return }
    }

    setLoading(true)

    try {
      if (mode === 'login') {
        const result = await signInWithEmail(email, password)
        if (result.success && result.user) {
          await loadUser(result.user.id)
          navigate('/')
        } else {
          setError(result.error || '登录失败，请检查凭证')
        }
      } else {
        const result = await signUpWithEmail(email, password, nickname)
        if (result.success && result.user) {
          await initializeUser(result.user.id, email, nickname)
          navigate('/')
        } else {
         setError(result.error || '注册失败')
        }
      }
    } catch (err: any) {
      setError(err.message || '系统错误，请重试')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-sakura-base flex items-center justify-center p-4 relative overflow-hidden">
      {/* === Background Decoration === */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[25%] w-[450px] h-[450px] rounded-full bg-sakura-pale/60 blur-[100px]" />
        <div className="absolute bottom-[-15%] right-[10%] w-[350px] h-[350px] rounded-full bg-lavender-light/50 blur-[80px]" />
        {['🌸', '✨', '🌷', '⭐', '💫'].map((p, i) => (
          <div key={i} className="absolute text-base opacity-20"
            style={{ left: `${8 + i * 20}%`, top: `${15 + (i % 3) * 28}%`, animation: `floatSlow ${4 + i}s ease-in-out infinite`, animationDelay: `${i * 0.6}s` }}>
            {p}
          </div>
        ))}
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/welcome" className="inline-flex items-center justify-center group">
            <div className="w-16 h-16 rounded-2xl shadow-xl shadow-sakura-pink/25 relative overflow-hidden group-hover:scale-105 transition-transform">
              <img src={LogoImg} alt="QuestMind" className="w-full h-full object-cover" />
            </div>
          </Link>

          <h1 className="text-2xl font-extrabold mt-5 tracking-tight">
            <span className="text-sakura">Quest</span>Mind
          </h1>
          <p className="text-xs text-muted-foreground mt-1">🌸 AI 陪伴学习平台</p>
        </div>

        {/* Auth Panel */}
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl border border-sakura-light/30 shadow-2xl shadow-sakura-pink/8 overflow-hidden">
          {/* Top gradient bar */}
          <div className="h-1 bg-gradient-to-r from-sakura-pink via-peach-orange to-lavender" />

          <div className="p-7">
            {/* Mode toggle tabs */}
            <div className="flex rounded-2xl bg-sakura-pale/60 p-1 mb-6">
              {(['login', 'register'] as AuthMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError('') }}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                    mode === m
                      ? 'bg-white text-sakura shadow-sm shadow-sakura-pink/15'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {m === 'login' ? '🔑 登录' : '✨ 注册'}
                </button>
              ))}
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-500 text-sm flex items-start gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground">昵称</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base">😊</span>
                    <Input
                      type="text"
                      placeholder="给自己起个可爱的名字"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      className="pl-10 rounded-xl border-sakura-light/50 focus:border-sakura-pink"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground">邮箱</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base">📧</span>
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 rounded-xl border-sakura-light/50 focus:border-sakura-pink"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground">密码</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base">🔒</span>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 rounded-xl border-sakura-light/50 focus:border-sakura-pink"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-sakura transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {mode === 'register' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground">确认密码</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base">🔒</span>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="再次输入密码"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10 rounded-xl border-sakura-light/50 focus:border-sakura-pink"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-gal w-full flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    处理中...
                  </>
                ) : (
                  <>
                    <span>{mode === 'login' ? '🔑' : '✨'}</span>
                    {mode === 'login' ? '登录' : '注册'}
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Back link */}
        <div className="mt-6 text-center">
          <Link
            to="/welcome"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-sakura transition-colors font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            返回欢迎页
          </Link>
        </div>
      </div>
    </div>
  )
}
