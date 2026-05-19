/**
 * 中栏：目标详情面板
 *
 * 包含目标头部信息、补充信息（上下文+附件）、子目标列表、AI 学习指南、每日任务列表。
 */
import { useState, useRef } from 'react'
import {
  Plus, Target, Check, Trash2, CheckCircle2,
  Pause, Play, Calendar, Flag, ClipboardList, HelpCircle,
  FileText, Upload, X, Image as ImageIcon, File, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useGoalsStore, useUserStore } from '@/store'
import { formatDate, generateId, cn } from '@/lib/utils'
import { uploadGoalAttachment, deleteGoalAttachment, formatFileSize, isAcceptableFileType, getAttachmentType } from '@/services/supabase'
import { extractTextFromFile } from '@/lib/fileExtractor'
import { StudyGuideCard } from './StudyGuideCard'
import { DailyTaskCard } from './DailyTaskCard'
import { categoryConfig, priorityConfig } from './GoalListPanel'
import type { Goal, GoalAttachment, QuizQuestion } from '@/types'

// 状态标签
const statusLabel: Record<string, { label: string; color: string }> = {
  active: { label: '进行中', color: 'text-sakura' },
  completed: { label: '已完成', color: 'text-green-500' },
  paused: { label: '暂停', color: 'text-gray-400' },
  notStarted: { label: '未开始', color: 'text-gray-400' },
}

// 圆形进度环
function CircularProgress({ value, size = 120, strokeWidth = 8 }: { value: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(340, 60%, 92%)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="url(#progressGradient)" strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(340, 75%, 65%)" />
            <stop offset="100%" stopColor="hsl(15, 90%, 70%)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold text-foreground tabular-nums">{value}%</span>
        <span className="text-[10px] text-muted-foreground">完成度</span>
      </div>
    </div>
  )
}

// 附件类型图标
function AttachmentIcon({ type }: { type: 'document' | 'image' }) {
  if (type === 'image') return <ImageIcon className="w-3.5 h-3.5 text-lavender" />
  return <File className="w-3.5 h-3.5 text-peach" />
}

interface GoalDetailPanelProps {
  selectedGoal: Goal | null
  goalsVersion: number
  onStartQuiz: (goalId: string, subGoalId: string, subGoalTitle: string) => void
  onShowNewGoal: () => void
  onShowSmartCreate: () => void
  onDeleteGoal: (goalId: string) => void
  showCoinToast: (amount: number, reason: string) => void
  formatTimeDisplay: (seconds: number) => string
}

export function GoalDetailPanel({
  selectedGoal, goalsVersion, onStartQuiz,
  onShowNewGoal, onShowSmartCreate, onDeleteGoal, showCoinToast,
  formatTimeDisplay,
}: GoalDetailPanelProps) {
  const { updateGoal, toggleSubGoal, startDailyTask, stopDailyTask } = useGoalsStore()
  const { user } = useUserStore()
  const [activeStudyTaskId, setActiveStudyTaskId] = useState<string | null>(null)

  // 上下文编辑状态
  const [isEditingContext, setIsEditingContext] = useState(false)
  const [contextDraft, setContextDraft] = useState('')

  // 附件上传状态
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 图片描述编辑状态
  const [editingImageDescId, setEditingImageDescId] = useState<string | null>(null)
  const [imageDescDraft, setImageDescDraft] = useState('')

  // 切换学习指引展开/收起
  const handleToggleStudyGuide = (taskId: string) => {
    setActiveStudyTaskId(prev => prev === taskId ? null : taskId)
  }

  // 编辑上下文
  const handleEditContext = () => {
    if (!selectedGoal) return
    setContextDraft(selectedGoal.context || '')
    setIsEditingContext(true)
  }

  const handleSaveContext = () => {
    if (!selectedGoal) return
    updateGoal(selectedGoal.id, { context: contextDraft || undefined })
    setIsEditingContext(false)
  }

  // 上传附件
  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedGoal || !e.target.files) return
    const files = Array.from(e.target.files)
    setIsUploading(true)

    try {
      const newAttachments: GoalAttachment[] = [...(selectedGoal.attachments || [])]

      for (const file of files) {
        if (!isAcceptableFileType(file)) {
          console.warn('Skipping unsupported file:', file.name)
          continue
        }
        if (file.size > 10 * 1024 * 1024) {
          console.warn('File too large (max 10MB):', file.name)
          continue
        }

        // 1. 上传到 Storage
        const uploadResult = await uploadGoalAttachment(selectedGoal.id, file)
        if (!uploadResult) continue

        // 2. 提取文字内容
        const extractedText = await extractTextFromFile(file)
        const attType = getAttachmentType(file.type)

        // 3. 构建附件对象
        const attachment: GoalAttachment = {
          id: generateId(),
          name: file.name,
          type: attType,
          mimeType: file.type,
          size: file.size,
          storagePath: uploadResult.storagePath,
          url: uploadResult.url,
          extractedText: attType === 'document' ? extractedText || undefined : undefined,
          uploadedAt: new Date().toISOString(),
        }

        newAttachments.push(attachment)
      }

      if (newAttachments.length > (selectedGoal.attachments?.length || 0)) {
        updateGoal(selectedGoal.id, { attachments: newAttachments })
      }
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setIsUploading(false)
      // 重置 input 以便再次选择同一文件
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // 删除附件
  const handleRemoveAttachment = async (att: GoalAttachment) => {
    if (!selectedGoal) return
    // 从 Storage 删除
    await deleteGoalAttachment(att.storagePath)
    // 从列表中移除
    const newAttachments = (selectedGoal.attachments || []).filter(a => a.id !== att.id)
    updateGoal(selectedGoal.id, { attachments: newAttachments })
  }

  // 保存图片描述
  const handleSaveImageDesc = (attId: string) => {
    if (!selectedGoal) return
    const newAttachments = (selectedGoal.attachments || []).map(a =>
      a.id === attId ? { ...a, imageDescription: imageDescDraft || undefined } : a
    )
    updateGoal(selectedGoal.id, { attachments: newAttachments })
    setEditingImageDescId(null)
    setImageDescDraft('')
  }

  // 格式化时间（共享给 DailyTaskCard）
  const _formatTime = formatTimeDisplay

  if (!selectedGoal) {
    return (
      <div className="flex-1 min-w-0 rounded-2xl border border-sakura-light/30 bg-white/90 overflow-hidden shadow-sm flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <div className="text-6xl mb-4 animate-bounce-gentle">🎯</div>
          <h3 className="text-lg font-bold text-foreground mb-2">选择一个目标查看详情</h3>
          <p className="text-sm text-muted-foreground mb-6">从左侧列表选择目标，或创建新的目标</p>
          <div className="flex items-center gap-3">
            <button onClick={onShowNewGoal} className="btn-gal inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />手动创建
            </button>
            <button onClick={onShowSmartCreate} className="btn-peach inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm">
              ✨ 艾莉丝创建
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 rounded-2xl border border-sakura-light/30 bg-white/90 overflow-hidden shadow-sm flex flex-col">
      {/* Detail header */}
      <div className="p-5 border-b border-sakura-light/20">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{categoryConfig[selectedGoal.category || 'study']?.emoji || '🎯'}</span>
              <h2 className={cn(
                'text-lg font-extrabold',
                selectedGoal.status === 'completed' ? 'text-muted-foreground line-through' : 'text-foreground'
              )}>
                {selectedGoal.title}
              </h2>
            </div>
            {selectedGoal.description && (
              <p className="text-sm text-muted-foreground mt-1">{selectedGoal.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(selectedGoal.startDate)} → {formatDate(selectedGoal.endDate)}
              </span>
              <span className={cn('font-medium', priorityConfig[selectedGoal.priority]?.color)}>
                <Flag className="w-3 h-3 inline mr-0.5" />
                {priorityConfig[selectedGoal.priority]?.label}优先级
              </span>
              <span className={cn('font-medium', statusLabel[selectedGoal.status]?.color)}>
                {statusLabel[selectedGoal.status]?.label}
              </span>
            </div>
          </div>
          <CircularProgress value={selectedGoal.progress} size={100} strokeWidth={7} />
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-4">
          {selectedGoal.status === 'active' && (
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 border-amber-200/60 text-amber-500 hover:bg-amber-50 rounded-lg"
              onClick={() => updateGoal(selectedGoal.id, { status: 'paused' })}>
              <Pause className="w-3 h-3" />暂停
            </Button>
          )}
          {selectedGoal.status === 'paused' && (
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 border-green-200/60 text-green-500 hover:bg-green-50 rounded-lg"
              onClick={() => updateGoal(selectedGoal.id, { status: 'active' })}>
              <Play className="w-3 h-3" />继续
            </Button>
          )}
          {selectedGoal.status !== 'completed' && (
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 border-green-200/60 text-green-500 hover:bg-green-50 rounded-lg"
              onClick={() => {
                updateGoal(selectedGoal.id, { status: 'completed', progress: 100 })
                showCoinToast(200, '目标达成！+200 金币！')
              }}>
              <CheckCircle2 className="w-3 h-3" />完成目标
            </Button>
          )}
          <div className="flex-1" />
          <Button size="sm" variant="ghost" className="text-xs h-7 gap-1 text-red-400 hover:bg-red-50 hover:text-red-500 rounded-lg"
            onClick={() => {
              if (confirm('确定要删除这个目标吗？')) {
                onDeleteGoal(selectedGoal.id)
              }
            }}>
            <Trash2 className="w-3 h-3" />删除
          </Button>
        </div>
      </div>

      {/* Detail body */}
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-6">

          {/* ===== 补充信息区块 ===== */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-lavender" />
                补充信息
              </h3>
              <button onClick={handleEditContext} className="text-[10px] text-sakura hover:text-sakura-pink transition-colors">
                编辑
              </button>
            </div>

            {/* 上下文编辑/展示 */}
            {isEditingContext ? (
              <div className="space-y-2">
                <textarea
                  value={contextDraft}
                  onChange={e => setContextDraft(e.target.value)}
                  className="w-full min-h-[80px] text-sm rounded-xl border border-sakura-light/30 bg-white p-3 placeholder:text-muted-foreground/50 focus:border-sakura-pink focus:outline-none focus:ring-1 focus:ring-sakura-pink/20 transition-all resize-y"
                  placeholder="添加补充上下文，帮助 AI 更好理解你的目标...&#10;例如：项目背景、学习要求、参考资料链接等"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" className="text-xs h-7 rounded-lg" onClick={() => setIsEditingContext(false)}>
                    取消
                  </Button>
                  <Button size="sm" className="text-xs h-7 rounded-xl bg-gradient-to-r from-sakura-pink to-peach-orange text-white border-0"
                    onClick={handleSaveContext}>
                    保存
                  </Button>
                </div>
              </div>
            ) : (
              selectedGoal.context && (
                <p className="text-sm text-muted-foreground bg-sakura-pale/20 rounded-xl p-3 whitespace-pre-wrap leading-relaxed">
                  {selectedGoal.context}
                </p>
              )
            )}
            {!isEditingContext && !selectedGoal.context && (
              <p className="text-xs text-muted-foreground/60 italic">
                暂无补充信息。点击"编辑"添加背景描述，AI 将据此提供更精准的分析。
              </p>
            )}

            {/* 附件列表 */}
            {selectedGoal.attachments && selectedGoal.attachments.length > 0 && (
              <div className="space-y-1.5">
                {selectedGoal.attachments.map(att => (
                  <div key={att.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-sakura-light/20 group">
                    <AttachmentIcon type={att.type} />
                    <span className="text-xs text-foreground flex-1 truncate">{att.name}</span>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">{formatFileSize(att.size)}</span>
                    {/* 图片描述编辑 */}
                    {att.type === 'image' && !att.imageDescription && editingImageDescId !== att.id && (
                      <button
                        onClick={() => { setEditingImageDescId(att.id); setImageDescDraft('') }}
                        className="text-[10px] text-lavender hover:text-lavender-dark shrink-0 transition-colors"
                      >
                        +描述
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveAttachment(att)}
                      className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-red-300 hover:text-red-400 transition-all shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {/* 图片描述 inline 编辑 */}
                {selectedGoal.attachments.filter(a => a.id === editingImageDescId).map(att => (
                  <div key={`desc-${att.id}`} className="flex items-center gap-2 pl-3">
                    <input
                      type="text"
                      value={imageDescDraft}
                      onChange={e => setImageDescDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveImageDesc(att.id) }}
                      placeholder="描述这张图片的内容..."
                      className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-lavender-light/40 bg-white placeholder:text-muted-foreground/50 focus:border-lavender focus:outline-none"
                      autoFocus
                    />
                    <button onClick={() => handleSaveImageDesc(att.id)} className="text-[10px] text-lavender font-medium">保存</button>
                    <button onClick={() => setEditingImageDescId(null)} className="text-[10px] text-muted-foreground">取消</button>
                  </div>
                ))}
              </div>
            )}

            {/* 上传按钮 */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleUploadClick}
                disabled={isUploading}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-sakura disabled:opacity-40 transition-colors"
              >
                {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {isUploading ? '上传中...' : '上传文件'}
              </button>
              <span className="text-[10px] text-muted-foreground/40">PDF / DOCX / TXT / MD / 图片</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept=".txt,.md,.pdf,.docx,.jpg,.jpeg,.png,.gif,.webp"
              onChange={handleFileSelect}
              multiple
            />
          </div>

          {/* Sub Goals */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Target className="w-4 h-4 text-sakura" />
                子目标
                <span className="text-[10px] text-muted-foreground font-normal">
                  ({selectedGoal.subGoals.filter(sg => sg.completed).length}/{selectedGoal.subGoals.length})
                </span>
              </h3>
              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 gap-1 text-sakura hover:bg-sakura-pale rounded-lg"
                onClick={() => {
                  const title = prompt('输入子目标名称')
                  if (title?.trim()) {
                    const newSubGoals = [...selectedGoal.subGoals, { id: generateId(), goalId: selectedGoal.id, title: title.trim(), completed: false }]
                    updateGoal(selectedGoal.id, { subGoals: newSubGoals } as any)
                  }
                }}>
                <Plus className="w-3 h-3" />添加
              </Button>
            </div>
            <div className="space-y-1.5">
              {selectedGoal.subGoals.map((sg) => (
                <div key={sg.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sakura-pale/20 transition-colors group">
                  {sg.completed ? (
                    <div className="w-5 h-5 rounded-md bg-green-400 border-2 border-green-400 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  ) : (
                    <button
                      onClick={() => onStartQuiz(selectedGoal.id, sg.id, sg.title)}
                      className="w-5 h-5 rounded-md border-2 border-gray-300 hover:border-sakura-pink flex items-center justify-center shrink-0 transition-all group/btn"
                      title="点击进行考核验证"
                    >
                      <HelpCircle className="w-3 h-3 text-gray-300 group-hover/btn:text-sakura-pink transition-colors" />
                    </button>
                  )}
                  <span className={cn(
                    'flex-1 text-sm',
                    sg.completed ? 'text-muted-foreground line-through' : 'text-foreground'
                  )}>
                    {sg.title}
                  </span>
                  <button
                    onClick={() => {
                      const newSubGoals = selectedGoal.subGoals.filter(s => s.id !== sg.id)
                      updateGoal(selectedGoal.id, { subGoals: newSubGoals } as any)
                    }}
                    className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 text-red-300 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {selectedGoal.subGoals.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">暂无子目标</p>
              )}
            </div>
          </div>

          {/* AI 学习指南概览卡片 */}
          {selectedGoal.dailyTasks && selectedGoal.dailyTasks.length > 0 && (
            <StudyGuideCard
              goalTitle={selectedGoal.title}
              goalContext={selectedGoal.context || selectedGoal.description || undefined}
              dailyTasks={selectedGoal.dailyTasks}
            />
          )}

          {/* Daily Tasks */}
          {selectedGoal.dailyTasks && selectedGoal.dailyTasks.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
                <ClipboardList className="w-4 h-4 text-peach" />
                每日任务
              </h3>
              <div className="space-y-2">
                {selectedGoal.dailyTasks.map(task => (
                  <DailyTaskCard
                    key={task.id}
                    task={task}
                    goal={selectedGoal}
                    goalsVersion={goalsVersion}
                    isStudyGuideOpen={activeStudyTaskId === task.id}
                    onToggleStudyGuide={handleToggleStudyGuide}
                    onStartTask={startDailyTask}
                    onStopTask={stopDailyTask}
                    formatTimeDisplay={_formatTime}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
