import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User,
  Camera,
  Mail,
  Calendar,
  Coins,
  Gem,
  ChevronLeft,
  Check,
  X,
  Loader2,
  Shield,
  LogOut,
  TrendingUp,
  Upload,
  ImagePlus
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useUserStore } from '@/store'
import { cn } from '@/lib/utils'
import * as db from '@/services/supabase'

// 系统头像列表
const SYSTEM_AVATARS = [
  { id: 'avatar1', emoji: '🦁', color: 'from-amber-400 to-orange-500' },
  { id: 'avatar2', emoji: '🦊', color: 'from-orange-400 to-red-500' },
  { id: 'avatar3', emoji: '🐼', color: 'from-gray-400 to-gray-600' },
  { id: 'avatar4', emoji: '🐨', color: 'from-slate-400 to-slate-600' },
  { id: 'avatar5', emoji: '🐯', color: 'from-yellow-400 to-amber-500' },
  { id: 'avatar6', emoji: '🐰', color: 'from-pink-300 to-pink-500' },
  { id: 'avatar7', emoji: '🐱', color: 'from-purple-400 to-purple-600' },
  { id: 'avatar8', emoji: '🐶', color: 'from-amber-300 to-amber-500' },
  { id: 'avatar9', emoji: '🐺', color: 'from-gray-500 to-gray-700' },
  { id: 'avatar10', emoji: '🦉', color: 'from-indigo-400 to-indigo-600' },
  { id: 'avatar11', emoji: '🦋', color: 'from-cyan-400 to-blue-500' },
  { id: 'avatar12', emoji: '🦄', color: 'from-pink-400 to-purple-500' },
]

type TabType = 'profile' | 'settings' | 'stats'

export function ProfilePage() {
  const navigate = useNavigate()
  const { user, logout, updateUser } = useUserStore()

  const [activeTab, setActiveTab] = useState<TabType>('profile')

  // 编辑昵称状态
  const [isEditingNickname, setIsEditingNickname] = useState(false)
  const [nicknameInput, setNicknameInput] = useState(user?.nickname || '')
  const [isSavingNickname, setIsSavingNickname] = useState(false)

  // 编辑头像状态
  const [isEditingAvatar, setIsEditingAvatar] = useState(false)
  const [selectedAvatar, setSelectedAvatar] = useState(
    SYSTEM_AVATARS.find(a => a.emoji === user?.avatar) || SYSTEM_AVATARS[0]
  )
  const [isSavingAvatar, setIsSavingAvatar] = useState(false)

  // 自定义上传相关状态
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 判断当前头像是 emoji 还是自定义图片 URL
  const isAvatarImage = user?.avatar && (
    user.avatar.startsWith('http://') ||
    user.avatar.startsWith('https://') ||
    user.avatar.startsWith('/')
  )

  // 获取用户头像（emoji 类型）
  const getUserAvatar = () => {
    if (user?.avatar && !isAvatarImage) {
      return SYSTEM_AVATARS.find(a => a.emoji === user.avatar) || SYSTEM_AVATARS[0]
    }
    return SYSTEM_AVATARS[0]
  }

  // 处理文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      alert('请选择 JPG、PNG、GIF 或 WebP 格式的图片')
      return
    }

    // 验证文件大小（2MB）
    if (file.size > 2 * 1024 * 1024) {
      alert('图片大小不能超过 2MB')
      return
    }

    setUploadFile(file)

    // 生成本地预览 URL
    const reader = new FileReader()
    reader.onload = (ev) => {
      setUploadPreview(ev.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  // 保存头像（统一处理 emoji 和上传图片）
  const handleSaveAvatar = async () => {
    setIsSavingAvatar(true)
    try {
      let newAvatar: string

      if (uploadFile && uploadPreview) {
        // === 用户上传了自定义图片 ===
        setIsUploading(true)
        if (user?.id) {
          // 如果之前也是图片，删除旧文件
          if (isAvatarImage) {
            await db.deleteUserAvatar(user.avatar)
          }
          const url = await db.uploadUserAvatar(user.id, uploadFile)
          if (!url) {
            throw new Error('上传失败')
          }
          newAvatar = url
        } else {
          throw new Error('用户未登录')
        }
        setIsUploading(false)
      } else {
        // === 用户选择了 emoji 头像 ===
        newAvatar = selectedAvatar.emoji
        if (user?.id && isAvatarImage) {
          // 从图片切回 emoji，删除旧图片文件
          await db.deleteUserAvatar(user.avatar)
        }
      }

      // 先更新本地 store
      updateUser({ avatar: newAvatar })
      // 同步到数据库
      if (user?.id) {
        await db.updateUserProfile(user.id, { avatar: newAvatar })
      }

      // 清理上传状态
      setUploadPreview(null)
      setUploadFile(null)
      setIsEditingAvatar(false)
    } catch (error) {
      console.error('Error saving avatar:', error)
      alert('头像保存失败，请重试')
    }
    setIsSavingAvatar(false)
    setIsUploading(false)
  }

  // 保存昵称
  const handleSaveNickname = async () => {
    if (!nicknameInput.trim() || nicknameInput === user?.nickname) {
      setIsEditingNickname(false)
      return
    }

    const newNickname = nicknameInput.trim()
    setIsSavingNickname(true)
    try {
      // 先更新本地 store
      updateUser({ nickname: newNickname })
      // 同步到数据库
      if (user?.id) {
        await db.updateUserProfile(user.id, { nickname: newNickname })
      }
      setIsEditingNickname(false)
    } catch (error) {
      console.error('Error saving nickname:', error)
    }
    setIsSavingNickname(false)
  }

  // 处理登出
  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  // 计算注册天数
  const getMemberDays = () => {
    if (!user?.createdAt) return 0
    const created = new Date(user.createdAt)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - created.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const tabs = [
    { id: 'profile' as TabType, label: '个人资料', icon: User },
    { id: 'settings' as TabType, label: '设置', icon: Shield },
    { id: 'stats' as TabType, label: '数据统计', icon: TrendingUp },
  ]

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold">个人中心</h1>
      </div>

      {/* Profile Card */}
      <div className="bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-amber-500/10 dark:from-purple-500/5 dark:via-pink-500/5 dark:to-amber-500/5 rounded-2xl p-6 mb-6">
        <div className="flex flex-col md:flex-row items-center gap-6">
          {/* Avatar */}
          <div className="relative">
            <Avatar className="w-24 h-24 ring-4 ring-primary/20">
              {isAvatarImage ? (
                // 自定义图片头像
                <>
                  <AvatarImage src={user?.avatar} alt="用户头像" />
                  <AvatarFallback className="text-2xl bg-gradient-to-br from-purple-400 to-pink-500">
                    {user?.nickname?.[0] || 'U'}
                  </AvatarFallback>
                </>
              ) : (
                // Emoji 头像
                <AvatarFallback className={cn(
                  'text-4xl bg-gradient-to-br',
                  getUserAvatar().color
                )}>
                  {user?.avatar || getUserAvatar().emoji}
                </AvatarFallback>
              )}
            </Avatar>
            <button
              onClick={() => setIsEditingAvatar(true)}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white shadow-lg hover:scale-110 transition-transform"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>

          {/* User Info */}
          <div className="flex-1 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
              {isEditingNickname ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={nicknameInput}
                    onChange={(e) => setNicknameInput(e.target.value)}
                    className="h-10 w-40"
                    maxLength={20}
                    autoFocus
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleSaveNickname}
                    disabled={isSavingNickname}
                  >
                    {isSavingNickname ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4 text-green-500" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setIsEditingNickname(false)
                      setNicknameInput(user?.nickname || '')
                    }}
                  >
                    <X className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-bold">{user?.nickname || '学习新手'}</h2>
                  <button
                    onClick={() => setIsEditingNickname(true)}
                    className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Camera className="w-4 h-4 text-muted-foreground" />
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center justify-center md:justify-start gap-2 text-sm text-muted-foreground mb-4">
              <Mail className="w-4 h-4" />
              <span>{user?.email || '未设置邮箱'}</span>
            </div>

          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4 md:gap-6">
            <div className="text-center p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30">
              <Coins className="w-6 h-6 mx-auto mb-1 text-amber-500" />
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                {user?.coins?.toLocaleString() || 0}
              </p>
              <p className="text-xs text-amber-600/70">金币</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-purple-50 dark:bg-purple-950/30">
              <Gem className="w-6 h-6 mx-auto mb-1 text-purple-500" />
              <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {user?.gems || 0}
              </p>
              <p className="text-xs text-purple-600/70">钻石</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-orange-50 dark:bg-orange-950/30">
              <Calendar className="w-6 h-6 mx-auto mb-1 text-orange-500" />
              <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                {getMemberDays()}
              </p>
              <p className="text-xs text-orange-600/70">天会员</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all',
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-700 shadow-sm font-medium'
                : 'hover:bg-white/50 dark:hover:bg-slate-700/50'
            )}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'profile' && (
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Basic Info */}
            <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4">
              <h3 className="font-semibold mb-4">基本信息</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">昵称</span>
                  <span className="font-medium">{user?.nickname}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">邮箱</span>
                  <span className="font-medium">{user?.email || '未绑定'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">注册时间</span>
                  <span className="font-medium">
                    {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-CN') : '未知'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">学习偏好</span>
                  <span className="font-medium">
                    {user?.timePreference === 'early' ? '早起鸟' :
                     user?.timePreference === 'night' ? '夜猫子' : '灵活安排'}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Account */}
            <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4">
              <h3 className="font-semibold mb-4">账号管理</h3>
              <div className="space-y-3">
                <button
                  onClick={() => navigate('/onboarding')}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <User className="w-5 h-5 text-muted-foreground" />
                  <div className="text-left flex-1">
                    <p className="font-medium">重新设置资料</p>
                    <p className="text-sm text-muted-foreground">修改昵称、头像等</p>
                  </div>
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  <div className="text-left flex-1">
                    <p className="font-medium">退出登录</p>
                    <p className="text-sm text-red-400/70">切换账号或注销登录</p>
                  </div>
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'stats' && (
          <motion.div
            key="stats"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Learning Stats */}
            <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4">
              <h3 className="font-semibold mb-4">学习统计</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30">
                  <Calendar className="w-6 h-6 mb-2 text-green-500" />
                  <p className="text-2xl font-bold">{getMemberDays()}</p>
                  <p className="text-sm text-muted-foreground">成为会员天数</p>
                </div>
              </div>
            </div>

            {/* Resources */}
            <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4">
              <h3 className="font-semibold mb-4">资源一览</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                  <div className="flex items-center gap-3">
                    <Coins className="w-6 h-6 text-amber-500" />
                    <span className="font-medium">金币余额</span>
                  </div>
                  <span className="text-xl font-bold text-amber-600">
                    {user?.coins?.toLocaleString() || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-purple-50 dark:bg-purple-950/20">
                  <div className="flex items-center gap-3">
                    <Gem className="w-6 h-6 text-purple-500" />
                    <span className="font-medium">钻石余额</span>
                  </div>
                  <span className="text-xl font-bold text-purple-600">
                    {user?.gems || 0}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avatar Selection Modal */}
      <AnimatePresence>
        {isEditingAvatar && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => {
              setIsEditingAvatar(false)
              setUploadPreview(null)
              setUploadFile(null)
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">选择头像</h3>
                <button
                  onClick={() => {
                    setIsEditingAvatar(false)
                    setUploadPreview(null)
                    setUploadFile(null)
                  }}
                  className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 上传预览区（选中图片后显示） */}
              {uploadPreview && (
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground mb-2">自定义头像预览</p>
                  <div className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50">
                    <Avatar className="w-16 h-16 ring-2 ring-primary/30">
                      <AvatarImage src={uploadPreview} alt="预览" />
                      <AvatarFallback>预览</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{uploadFile?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {uploadFile ? `${(uploadFile.size / 1024).toFixed(0)} KB` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setUploadPreview(null)
                        setUploadFile(null)
                        if (fileInputRef.current) fileInputRef.current.value = ''
                      }}
                      className="p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-950/20 text-red-400"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* 自定义上传按钮 */}
              <div
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className={cn(
                  'mb-5 flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed transition-all cursor-pointer',
                  uploadPreview
                    ? 'border-primary/30 bg-primary/5'
                    : 'border-slate-300 dark:border-slate-600 hover:border-primary/50 hover:bg-primary/5'
                )}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <span className="text-sm text-primary">上传中...</span>
                  </>
                ) : uploadPreview ? (
                  <>
                    <Check className="w-5 h-5 text-green-500" />
                    <span className="text-sm text-green-600 dark:text-green-400">已选择自定义图片</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">点击上传自定义头像</span>
                    <ImagePlus className="w-4 h-4 text-muted-foreground/60" />
                  </>
                )}
                {/* 隐藏的文件输入框 */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {/* 分隔线 */}
              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="px-3 bg-white dark:bg-slate-800 text-xs text-muted-foreground">或选择系统头像</span>
                </div>
              </div>

              {/* 系统Emoji头像网格 */}
              <div className="grid grid-cols-4 gap-3 mb-6">
                {SYSTEM_AVATARS.map((avatar) => (
                  <button
                    key={avatar.id}
                    onClick={() => {
                      setSelectedAvatar(avatar)
                      // 切换到 emoji 模式时清除上传状态
                      setUploadPreview(null)
                      setUploadFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    className={cn(
                      'aspect-square rounded-xl flex items-center justify-center text-2xl transition-all duration-200',
                      selectedAvatar.id === avatar.id && !uploadPreview
                        ? 'ring-4 ring-primary ring-offset-2 scale-110'
                        : 'hover:scale-105 bg-slate-100 dark:bg-slate-700'
                    )}
                  >
                    <div className={cn(
                      'w-full h-full rounded-xl flex items-center justify-center bg-gradient-to-br',
                      avatar.color
                    )}>
                      {avatar.emoji}
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditingAvatar(false)
                    setUploadPreview(null)
                    setUploadFile(null)
                  }}
                  className="flex-1"
                  disabled={isSavingAvatar || isUploading}
                >
                  取消
                </Button>
                <Button
                  onClick={handleSaveAvatar}
                  className="flex-1 gradient-primary"
                  disabled={isSavingAvatar || isUploading}
                >
                  {isSavingAvatar || isUploading ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" />保存中</>
                  ) : '确认更换'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
