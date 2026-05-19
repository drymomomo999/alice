/**
 * 手动创建目标对话框
 */
import { useState, useRef } from 'react'
import { Plus, X, Upload, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { categoryConfig } from './GoalListPanel'
import { uploadGoalAttachment, isAcceptableFileType, getAttachmentType, formatFileSize } from '@/services/supabase'
import { extractTextFromFile } from '@/lib/fileExtractor'
import { generateId } from '@/lib/utils'
import type { GoalCategory, GoalPriority, GoalAttachment } from '@/types'

interface NewGoalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  newGoal: {
    title: string
    description: string
    context: string
    category: GoalCategory
    priority: GoalPriority
    endDate: string
    subGoals: { title: string }[]
    attachments: GoalAttachment[]
  }
  setNewGoal: React.Dispatch<React.SetStateAction<{
    title: string
    description: string
    context: string
    category: GoalCategory
    priority: GoalPriority
    endDate: string
    subGoals: { title: string }[]
    attachments: GoalAttachment[]
  }>>
  onCreateGoal: () => void
}

export function NewGoalDialog({ open, onOpenChange, newGoal, setNewGoal, onCreateGoal }: NewGoalDialogProps) {
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const files = Array.from(e.target.files)
    setIsUploading(true)

    try {
      const newAttachments = [...newGoal.attachments]

      for (const file of files) {
        if (!isAcceptableFileType(file) || file.size > 10 * 1024 * 1024) continue

        // 上传到 Storage（goalId 用临时值，目标创建后不会再次同步附件）
        const uploadResult = await uploadGoalAttachment('pending', file)
        if (!uploadResult) continue

        const extractedText = await extractTextFromFile(file)
        const attType = getAttachmentType(file.type)

        newAttachments.push({
          id: generateId(),
          name: file.name,
          type: attType,
          mimeType: file.type,
          size: file.size,
          storagePath: uploadResult.storagePath,
          url: uploadResult.url,
          extractedText: attType === 'document' ? extractedText || undefined : undefined,
          uploadedAt: new Date().toISOString(),
        })
      }

      setNewGoal(prev => ({ ...prev, attachments: newAttachments }))
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveAttachment = (attId: string) => {
    setNewGoal(prev => ({
      ...prev,
      attachments: prev.attachments.filter(a => a.id !== attId),
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col rounded-2xl overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2"><span>🎯</span>创建新目标</DialogTitle>
          <DialogDescription>设定一个清晰的目标，AI 伙伴陪你完成</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-4 px-1">
          <div className="space-y-2">
            <label className="text-sm font-semibold">目标名称</label>
            <Input placeholder="例如：三个月学会 Python" value={newGoal.title}
              onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })} className="rounded-xl" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold">目标描述</label>
            <textarea placeholder="简要描述你的目标..." value={newGoal.description}
              onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
              className="w-full min-h-[60px] text-sm rounded-xl border bg-background px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold">补充上下文 <span className="text-muted-foreground font-normal text-xs">（可选，帮助 AI 更好理解你的目标）</span></label>
            <textarea placeholder="例如：项目背景、学习要求、参考资料等..." value={newGoal.context}
              onChange={(e) => setNewGoal({ ...newGoal, context: e.target.value })}
              className="w-full min-h-[60px] text-sm rounded-xl border bg-background px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-semibold">分类</label>
              <select value={newGoal.category}
                onChange={(e) => setNewGoal({ ...newGoal, category: e.target.value as GoalCategory })}
                className="w-full h-10 px-3 rounded-xl border bg-background text-sm">
                {Object.entries(categoryConfig).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.emoji} {cfg.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">优先级</label>
              <select value={newGoal.priority}
                onChange={(e) => setNewGoal({ ...newGoal, priority: e.target.value as GoalPriority })}
                className="w-full h-10 px-3 rounded-xl border bg-background text-sm">
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">截止日期</label>
              <Input type="date" value={newGoal.endDate}
                onChange={(e) => setNewGoal({ ...newGoal, endDate: e.target.value })} className="rounded-xl" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">子目标</label>
              <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 text-sakura"
                onClick={() => setNewGoal({ ...newGoal, subGoals: [...newGoal.subGoals, { title: '' }] })}>
                <Plus className="w-3 h-3" />添加
              </Button>
            </div>
            {newGoal.subGoals.map((sg, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input placeholder={`子目标 ${idx + 1}`} value={sg.title}
                  onChange={(e) => {
                    const updated = [...newGoal.subGoals]; updated[idx] = { title: e.target.value }
                    setNewGoal({ ...newGoal, subGoals: updated })
                  }} className="rounded-xl" />
                {newGoal.subGoals.length > 1 && (
                  <button onClick={() => setNewGoal({ ...newGoal, subGoals: newGoal.subGoals.filter((_, i) => i !== idx) })}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-300 hover:text-red-400 transition-all">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* 文件附件上传 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">附件 <span className="text-muted-foreground font-normal text-xs">（可选，上传参考资料供 AI 分析）</span></label>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="h-6 text-xs gap-1 text-sakura inline-flex items-center hover:text-sakura-pink disabled:opacity-40 transition-colors"
              >
                {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                上传
              </button>
            </div>
            {newGoal.attachments.length > 0 && (
              <div className="space-y-1">
                {newGoal.attachments.map(att => (
                  <div key={att.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-sakura-pale/20 text-xs">
                    <span className="flex-1 truncate text-foreground">{att.name}</span>
                    <span className="text-muted-foreground shrink-0">{formatFileSize(att.size)}</span>
                    <button onClick={() => handleRemoveAttachment(att.id)}
                      className="p-0.5 rounded hover:bg-red-50 text-red-300 hover:text-red-400 transition-all">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept=".txt,.md,.pdf,.docx,.jpg,.jpeg,.png,.gif,.webp"
              onChange={handleFileSelect}
              multiple
            />
          </div>
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">取消</Button>
          <Button onClick={onCreateGoal} disabled={!newGoal.title || !newGoal.endDate}
            className="rounded-xl bg-gradient-to-r from-sakura-pink to-peach-orange text-white border-0">
            创建目标
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
