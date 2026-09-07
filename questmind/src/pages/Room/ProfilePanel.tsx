import { useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { X, Save, RotateCcw, Download, Upload, BookOpen, Trash2, Brain } from 'lucide-react'
import type { AliceProfile } from '@/services/aliceProfile.service'
import {
  getDefaultProfile,
  exportProfileToFile,
  importProfileFromFile,
} from '@/services/aliceProfile.service'
import {
  clearRelationshipMemories,
  deleteRelationshipMemory,
  getRelationshipStage,
  loadRelationshipStore,
  type RelationshipStore,
} from '@/services/aliceRelationship.service'
import {
  clearRelationshipMemoriesFromCloud,
  deleteRelationshipMemoryFromCloud,
} from '@/services/aliceRelationshipCloud.service'

interface ProfilePanelProps {
  profile: AliceProfile
  userId: string
  onSave: (profile: AliceProfile) => void
  onClose: () => void
}

export function ProfilePanel({ profile, userId, onSave, onClose }: ProfilePanelProps) {
  const [personality, setPersonality] = useState(profile.personality)
  const [speakingStyle, setSpeakingStyle] = useState(profile.speakingStyle)
  const [savedFlash, setSavedFlash] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [relationship, setRelationship] = useState<RelationshipStore>(() => loadRelationshipStore(userId))

  const hasChanges =
    personality !== profile.personality || speakingStyle !== profile.speakingStyle

  const handleSave = useCallback(() => {
    onSave({
      ...profile,
      personality,
      speakingStyle,
    })
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
  }, [profile, personality, speakingStyle, onSave])

  const handleReset = useCallback(() => {
    const def = getDefaultProfile()
    setPersonality(def.personality)
    setSpeakingStyle(def.speakingStyle)
  }, [])

  const handleExport = useCallback(() => {
    // 导出当前编辑中的内容（含已有隐藏分析数据）
    exportProfileToFile({
      ...profile,
      personality,
      speakingStyle,
    })
  }, [profile, personality, speakingStyle])

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const imported = await importProfileFromFile(file)
      if (imported) {
        setPersonality(imported.personality)
        setSpeakingStyle(imported.speakingStyle)
        // 同时保存隐藏的分析数据
        onSave(imported)
        setImportMsg('导入成功')
      } else {
        setImportMsg('导入失败：文件格式不正确')
      }
      setTimeout(() => setImportMsg(''), 2000)
      // 重置 input 以便重复导入同一文件
      e.target.value = ''
    },
    [onSave]
  )

  const removeMemory = useCallback((kind: 'preference' | 'moment' | 'followup', id: string) => {
    setRelationship(deleteRelationshipMemory(userId, kind, id))
    void deleteRelationshipMemoryFromCloud(userId, kind, id)
  }, [userId])

  const clearMemories = useCallback(() => {
    setRelationship(clearRelationshipMemories(userId))
    void clearRelationshipMemoriesFromCloud(userId)
  }, [userId])

  const memoryItems = [
    ...relationship.preferences.filter(item => item.active).map(item => ({ kind: 'preference' as const, id: item.id, label: '交流偏好', text: item.value })),
    ...relationship.moments.filter(item => item.active).map(item => ({ kind: 'moment' as const, id: item.id, label: '共同经历', text: item.summary })),
    ...relationship.followups.filter(item => !item.dismissedAt && !item.askedAt).map(item => ({ kind: 'followup' as const, id: item.id, label: '待回访', text: item.summary })),
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="w-full max-w-lg max-h-[80vh] mx-4 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{
          background: 'rgba(255, 250, 247, 0.96)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(220, 170, 150, 0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-pink-100/50 shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-pink-500" />
            <h3 className="text-sm font-bold text-pink-800">人物档案</h3>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-pink-50 transition-colors"
          >
            <X className="w-4 h-4 text-pink-400" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="overflow-y-auto p-5 space-y-4">
          {/* 说明 */}
          <p className="text-xs text-pink-400/80 leading-relaxed">
            设定艾莉丝的性格基底和说话方式。随着你们对话增多，她会逐渐了解你，自然地变成你喜欢的样子。
          </p>

          <div className="pt-3 border-t border-pink-100/70">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Brain className="w-4 h-4 text-pink-500" />
                <h4 className="text-xs font-semibold text-pink-700">艾莉丝记住的事</h4>
                <span className="text-[10px] text-pink-400">熟悉阶段 {getRelationshipStage(userId)}</span>
              </div>
              {memoryItems.length > 0 && (
                <button onClick={clearMemories} className="text-[10px] text-red-400 hover:text-red-500">
                  全部清除
                </button>
              )}
            </div>
            <p className="text-[11px] text-pink-400/80 leading-relaxed mb-2">
              这里只显示会影响后续交流的重要偏好、共同经历和一次性回访。你可以随时删除。
            </p>
            {memoryItems.length === 0 ? (
              <p className="py-3 text-center text-xs text-pink-300">还没有形成关系记忆</p>
            ) : (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {memoryItems.map(item => (
                  <div key={`${item.kind}-${item.id}`} className="flex items-start gap-2 rounded-xl bg-white/60 border border-pink-100/70 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-medium text-pink-500">{item.label}</p>
                      <p className="text-xs text-pink-900/75 leading-relaxed break-words">{item.text}</p>
                    </div>
                    <button
                      onClick={() => removeMemory(item.kind, item.id)}
                      className="p-1 rounded-md text-pink-300 hover:text-red-400 hover:bg-red-50"
                      aria-label={`删除${item.label}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 性格基底 */}
          <div>
            <label className="block text-xs font-semibold text-pink-700 mb-1.5">
              性格基底
            </label>
            <textarea
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-xl text-sm text-pink-900/80 bg-white/60 border border-pink-200/40 focus:outline-none focus:border-pink-300/60 focus:ring-1 focus:ring-pink-300/30 resize-none leading-relaxed"
              placeholder="描述艾莉丝的性格特质..."
            />
          </div>

          {/* 说话方式 */}
          <div>
            <label className="block text-xs font-semibold text-pink-700 mb-1.5">
              说话方式
            </label>
            <textarea
              value={speakingStyle}
              onChange={(e) => setSpeakingStyle(e.target.value)}
              rows={5}
              className="w-full px-3 py-2 rounded-xl text-sm text-pink-900/80 bg-white/60 border border-pink-200/40 focus:outline-none focus:border-pink-300/60 focus:ring-1 focus:ring-pink-300/30 resize-none leading-relaxed"
              placeholder="描述艾莉丝的说话风格、语气、用词习惯..."
            />
          </div>

          {/* 导入导出 */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-pink-600 bg-pink-50/80 hover:bg-pink-100/80 border border-pink-200/30 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              导出
            </button>
            <button
              onClick={handleImportClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-pink-600 bg-pink-50/80 hover:bg-pink-100/80 border border-pink-200/30 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              导入
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportFile}
              className="hidden"
            />
            {importMsg && (
              <span className="text-xs text-pink-500">{importMsg}</span>
            )}
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-pink-100/50 shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-pink-400 hover:text-pink-600 hover:bg-pink-50/60 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重置默认
          </button>
          <div className="flex-1" />
          {savedFlash && (
            <span className="text-xs text-green-500 font-medium animate-pulse">
              已保存
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              hasChanges
                ? 'bg-gradient-to-r from-pink-400 to-pink-500 text-white hover:from-pink-500 hover:to-pink-600 shadow-sm'
                : 'bg-pink-100/50 text-pink-300 cursor-not-allowed'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            保存
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
