/**
 * AI 智能创建目标对话框（支持附件上传）
 */
import { useState, useRef } from 'react'
import { CheckCircle2, ArrowRight, Upload, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { uploadGoalAttachment, isAcceptableFileType, getAttachmentType, formatFileSize } from '@/services/supabase'
import { extractTextFromFile } from '@/lib/fileExtractor'
import { generateId } from '@/lib/utils'
import type { GoalAttachment } from '@/types'
import type { GoalPlanResult } from '@/services/ai.service'
import AliceCharacter from '@/assets/alice-character.png'

type AIWizardStep = 'goal' | 'status' | 'plan'

interface AIWizardState {
  step: AIWizardStep
  goalTitle: string
  goalContext: string
  attachments: GoalAttachment[]
  questions: string[]
  statusAnswers: string[]
  planResult: GoalPlanResult | null
  isLoading: boolean
  error: string | null
}

interface SmartCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  wizardState: AIWizardState
  setWizardState: React.Dispatch<React.SetStateAction<AIWizardState>>
  onSubmitGoal: () => void
  onSubmitStatus: () => void
  onConfirmAndCreate: () => void
}

export function SmartCreateDialog({
  open, onOpenChange, wizardState, setWizardState,
  onSubmitGoal, onSubmitStatus, onConfirmAndCreate,
}: SmartCreateDialogProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    setIsUploading(true)
    setUploadError(null)

    try {
      const newAttachments = [...wizardState.attachments]

      for (const file of files) {
        // 格式/大小校验
        if (file.size > 10 * 1024 * 1024) {
          setUploadError(`"${file.name}" 超过 10MB 限制，已跳过`)
          continue
        }
        if (!isAcceptableFileType(file)) {
          setUploadError(`"${file.name}" 格式不支持，已跳过`)
          continue
        }

        // 尝试上传到 Storage（可能因未登录而失败，不阻断流程）
        let storagePath = ''
        let url = ''
        try {
          const uploadResult = await uploadGoalAttachment('pending', file)
          if (uploadResult) {
            storagePath = uploadResult.storagePath
            url = uploadResult.url
          }
        } catch (err) {
          console.warn('[SmartCreate] Storage 上传失败，文件仅在本地使用:', err)
        }

        // 提取文字内容（供 AI 分析）
        let extractedText: string | undefined
        try {
          const text = await extractTextFromFile(file)
          const attType = getAttachmentType(file.type)
          extractedText = attType === 'document' ? (text || undefined) : undefined
        } catch (err) {
          console.warn('[SmartCreate] 文件内容提取失败:', err)
        }

        const attType = getAttachmentType(file.type)
        newAttachments.push({
          id: generateId(),
          name: file.name,
          type: attType,
          mimeType: file.type,
          size: file.size,
          storagePath: storagePath || undefined,
          url: url || undefined,
          extractedText,
          uploadedAt: new Date().toISOString(),
        })
      }

      setWizardState(prev => ({ ...prev, attachments: newAttachments }))
    } catch (err) {
      console.error('Upload failed:', err)
      setUploadError('文件处理失败，请重试')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveAttachment = (attId: string) => {
    setWizardState(prev => ({
      ...prev,
      attachments: prev.attachments.filter(a => a.id !== attId),
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col rounded-2xl overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-sakura-light/40 shadow-sm">
              <img src={AliceCharacter} alt="艾莉丝" className="w-full h-full object-cover" />
            </div>
            艾莉丝 · AI 目标规划
          </DialogTitle>
          <DialogDescription>让我来帮你制定专属目标计划 ✨</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center gap-2 py-2 shrink-0">
          {(['goal', 'status', 'plan'] as const).map((step, idx) => (
            <div key={step} className="flex items-center">
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all',
                wizardState.step === step ? 'bg-gradient-to-r from-sakura-pink to-peach-orange text-white shadow-md' :
                (['goal', 'status', 'plan'].indexOf(wizardState.step) > idx) ? 'bg-green-400 text-white' : 'bg-gray-100 text-muted-foreground')}>
                {(['goal', 'status', 'plan'].indexOf(wizardState.step) > idx) ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
              </div>
              {idx < 2 && <div className={cn('w-8 h-0.5 mx-1', ['goal', 'status', 'plan'].indexOf(wizardState.step) > idx ? 'bg-green-400' : 'bg-gray-100')} />}
            </div>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-1">
          <div className="py-4 space-y-4">
            {wizardState.step === 'goal' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-sakura-light/50 shadow-md shrink-0">
                    <img src={AliceCharacter} alt="艾莉丝" className="w-full h-full object-cover" />
                  </div>
                  <div className="bg-sakura-pale/40 p-4 rounded-2xl rounded-tl-sm flex-1">
                    <p className="font-bold text-sm text-foreground">你好，很高兴见到你。🌸</p>
                    <p className="text-sm text-muted-foreground mt-1.5">我是艾莉丝，你的学习引导员。<br />告诉我你想要达成的目标，我来帮你制定可行的计划。</p>
                  </div>
                </div>
                <Input placeholder="例如：三个月学会Python、减肥到65公斤..."
                  value={wizardState.goalTitle}
                  onChange={(e) => setWizardState(prev => ({ ...prev, goalTitle: e.target.value }))}
                  onKeyPress={(e) => e.key === 'Enter' && onSubmitGoal()}
                  className="text-base rounded-xl" />
                <textarea placeholder="（可选）补充上下文、参考资料、学习材料等，帮助 AI 制定更精准的计划..."
                  value={wizardState.goalContext}
                  onChange={(e) => setWizardState(prev => ({ ...prev, goalContext: e.target.value }))}
                  className="w-full min-h-[50px] text-sm rounded-xl border bg-background px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y" />

                {/* 附件上传区域 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold">参考资料附件 <span className="text-muted-foreground font-normal text-xs">（PDF/DOC/图片，可选）</span></label>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="h-6 text-xs gap-1 text-sakura inline-flex items-center hover:text-sakura-pink disabled:opacity-40 transition-colors"
                    >
                      {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                      上传文件
                    </button>
                  </div>
                  {wizardState.attachments.length > 0 && (
                    <div className="space-y-1">
                      {wizardState.attachments.map(att => (
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
                  {uploadError && (
                    <p className="text-xs text-amber-600">{uploadError}</p>
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
            )}
            {wizardState.step === 'status' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-lavender-light/50 shadow-md shrink-0">
                    <img src={AliceCharacter} alt="艾莉丝" className="w-full h-full object-cover" />
                  </div>
                  <div className="bg-lavender-light/25 p-4 rounded-2xl rounded-tl-sm flex-1">
                    <p className="font-bold text-sm text-foreground">了解了。让我进一步了解您的现状。📋</p>
                    <p className="text-sm text-muted-foreground mt-1.5">为了制定更精准的计划，请回答以下问题——这些信息将帮助我为您规划合理的行动路径。</p>
                  </div>
                </div>

                {/* status 步骤也展示已上传附件，可删除 */}
                {wizardState.attachments.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-muted-foreground">已上传参考资料</label>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="h-5 text-xs gap-1 text-sakura inline-flex items-center hover:text-sakura-pink disabled:opacity-40 transition-colors"
                      >
                        {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                        继续上传
                      </button>
                    </div>
                    {wizardState.attachments.map(att => (
                      <div key={att.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-sakura-pale/20 text-xs">
                        <span className="flex-1 truncate text-foreground">{att.name}</span>
                        <span className="text-muted-foreground shrink-0">{formatFileSize(att.size)}</span>
                        <button onClick={() => handleRemoveAttachment(att.id)}
                          className="p-0.5 rounded hover:bg-red-50 text-red-300 hover:text-red-400 transition-all">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <input
                      ref={fileInputRef}
                      type="file"
                      hidden
                      accept=".txt,.md,.pdf,.docx,.jpg,.jpeg,.png,.gif,.webp"
                      onChange={handleFileSelect}
                      multiple
                    />
                  </div>
                )}

                {wizardState.questions.map((question, idx) => (
                  <div key={idx} className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-sakura-pale flex items-center justify-center text-xs text-sakura font-bold">{idx + 1}</span>
                      {question}
                    </label>
                    <Input placeholder="请输入你的回答..." value={wizardState.statusAnswers[idx] || ''}
                      onChange={(e) => {
                        const newAnswers = [...wizardState.statusAnswers]; newAnswers[idx] = e.target.value
                        setWizardState(prev => ({ ...prev, statusAnswers: newAnswers }))
                      }} className="rounded-xl" />
                  </div>
                ))}
              </div>
            )}
            {wizardState.step === 'plan' && wizardState.planResult && (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-green-200/60 shadow-md shrink-0">
                    <img src={AliceCharacter} alt="艾莉丝" className="w-full h-full object-cover" />
                  </div>
                  <div className="bg-green-50 p-4 rounded-2xl rounded-tl-sm flex-1">
                    <p className="font-bold text-sm text-foreground">计划已为您整理完毕。🌹</p>
                    <p className="text-sm text-muted-foreground mt-1.5">以下是根据您的情况定制的行动方案——请确认后即可开始执行。</p>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-sakura-pale/30 border border-sakura-light/30">
                  <p className="text-xs text-muted-foreground">你的当前状态</p>
                  <p className="text-sm font-medium">{wizardState.planResult.currentStatus}</p>
                </div>
                {/* 个性化差异说明 */}
                {wizardState.planResult.personalizationNote && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/50 flex items-start gap-2">
                    <span className="text-base shrink-0">✨</span>
                    <div>
                      <p className="text-xs font-semibold text-amber-700 mb-0.5">专属定制说明</p>
                      <p className="text-xs text-amber-800">{wizardState.planResult.personalizationNote}</p>
                    </div>
                  </div>
                )}
                {wizardState.attachments.length > 0 && (
                  <div className="p-3 rounded-xl bg-sakura-pale/20 border border-sakura-light/30">
                    <p className="text-xs text-muted-foreground mb-1">已上传的参考资料</p>
                    {wizardState.attachments.map(att => (
                      <div key={att.id} className="text-xs text-foreground truncate">{att.name}</div>
                    ))}
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">🎯 阶段性目标</p>
                  {wizardState.planResult.subGoals.map((sg: any, idx: number) => (
                    <div key={idx} className="p-3 rounded-xl border border-sakura-light/30 bg-white">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-r from-sakura-pink to-peach-orange flex items-center justify-center text-xs font-bold text-white">{idx + 1}</div>
                        <span className="font-medium">{sg.title}</span>
                        <Badge variant="outline" className="ml-auto text-xs">{sg.estimatedTime}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 ml-8">{sg.action}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {wizardState.isLoading && (
              <div className="flex flex-col items-center py-6">
                <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-sakura-light/50 shadow-md mb-3 animate-bounce-gentle">
                  <img src={AliceCharacter} alt="艾莉丝" className="w-full h-full object-cover" />
                </div>
                <div className="loading-sakura"><span /><span /><span /></div>
                <p className="text-sm text-muted-foreground mt-3">正在为您整理计划，请稍候...</p>
              </div>
            )}
            {wizardState.error && (
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden border border-red-200/50 shrink-0">
                  <img src={AliceCharacter} alt="艾莉丝" className="w-full h-full object-cover" />
                </div>
                <div className="p-3 rounded-xl rounded-tl-sm bg-red-50 text-red-500 text-sm flex-1">
                  抱歉，系统出现了异常。请允许我重新为您处理。
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="flex-row gap-2 shrink-0">
          <Button variant="outline" onClick={() => {
            if (wizardState.step === 'goal') onOpenChange(false)
            else if (wizardState.step === 'status') setWizardState(prev => ({ ...prev, step: 'goal', questions: [], statusAnswers: [] }))
            else if (wizardState.step === 'plan') setWizardState(prev => ({ ...prev, step: 'status', planResult: null }))
          }} className="rounded-xl">{wizardState.step === 'goal' ? '取消' : '上一步'}</Button>
          {wizardState.step === 'goal' && <Button onClick={onSubmitGoal} disabled={!wizardState.goalTitle.trim()}
            className="rounded-xl bg-gradient-to-r from-sakura-pink to-peach-orange text-white border-0">开始规划 <ArrowRight className="w-4 h-4 ml-2" /></Button>}
          {wizardState.step === 'status' && <Button onClick={onSubmitStatus} disabled={wizardState.statusAnswers.some(a => !a.trim())}
            className="rounded-xl bg-gradient-to-r from-sakura-pink to-peach-orange text-white border-0">生成计划 <ArrowRight className="w-4 h-4 ml-2" /></Button>}
          {wizardState.step === 'plan' && <Button onClick={onConfirmAndCreate}
            className="rounded-xl bg-gradient-to-r from-sakura-pink to-peach-orange text-white border-0"><CheckCircle2 className="w-4 h-4 mr-2" />确认并开始执行</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
