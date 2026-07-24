import { motion } from 'framer-motion'
import {
  AudioLines,
  Loader2,
  RotateCcw,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react'
import {
  type AliceVoiceSettings,
  type AliceVoiceStyle,
} from '@/services/aliceVoice.service'
import type { AliceVoiceSource } from '@/hooks/useAliceVoice'

interface VoiceSettingsPanelProps {
  settings: AliceVoiceSettings
  source: AliceVoiceSource
  isDesigning: boolean
  error: string | null
  onChange: (patch: Partial<AliceVoiceSettings>) => void
  onPreview: () => void
  onReset: () => void
  onClose: () => void
}

const STYLE_OPTIONS: Array<{
  id: AliceVoiceStyle
  label: string
  description: string
}> = [
  { id: 'gentle', label: '温柔', description: '轻柔、亲近、略慢' },
  { id: 'confident', label: '自信', description: '从容、清晰、有主见' },
  { id: 'lively', label: '灵动', description: '明快、轻盈、有活力' },
]

function getSourceLabel(source: AliceVoiceSource, voiceId: string | null): string {
  if (source === 'custom' || voiceId) return '生成式定制音色'
  if (source === 'system') return '系统降级音色'
  return '等待首次生成'
}

export function VoiceSettingsPanel({
  settings,
  source,
  isDesigning,
  error,
  onChange,
  onPreview,
  onReset,
  onClose,
}: VoiceSettingsPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 18 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 18 }}
        className="w-full max-w-lg max-h-[84vh] mx-4 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{
          background: 'rgba(255, 250, 247, 0.97)',
          border: '1px solid rgba(220, 170, 150, 0.24)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-pink-100/60">
          <div className="flex items-center gap-2">
            <AudioLines className="w-4 h-4 text-pink-500" />
            <div>
              <h3 className="text-sm font-bold text-pink-800">艾莉丝的声线工坊</h3>
              <p className="text-[11px] text-pink-400 mt-0.5">
                {getSourceLabel(source, settings.voiceId)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-pink-50 transition-colors"
            aria-label="关闭声线设置"
          >
            <X className="w-4 h-4 text-pink-400" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-pink-700 mb-1.5">
              角色声线描述
            </label>
            <textarea
              value={settings.description}
              onChange={(event) => onChange({
                description: event.target.value,
                voiceId: null,
              })}
              rows={6}
              maxLength={1000}
              className="w-full px-3 py-2 rounded-xl text-sm leading-relaxed text-pink-900/80 bg-white/70 border border-pink-200/50 focus:outline-none focus:border-pink-300 focus:ring-1 focus:ring-pink-300/30 resize-none"
            />
            <div className="flex justify-between mt-1">
              <p className="text-[11px] text-pink-400">
                修改描述后需重新生成，才能得到新的独特音色。
              </p>
              <span className="text-[10px] text-pink-300">
                {settings.description.length}/1000
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-pink-700 mb-2">
              日常表现风格
            </label>
            <div className="grid grid-cols-3 gap-2">
              {STYLE_OPTIONS.map((option) => {
                const selected = settings.style === option.id
                return (
                  <button
                    key={option.id}
                    onClick={() => onChange({ style: option.id })}
                    className={`rounded-xl px-2 py-2.5 text-left border transition-colors ${
                      selected
                        ? 'bg-pink-100/80 border-pink-300/70'
                        : 'bg-white/60 border-pink-100 hover:bg-pink-50/70'
                    }`}
                  >
                    <span className={`block text-xs font-semibold ${
                      selected ? 'text-pink-700' : 'text-pink-500'
                    }`}>
                      {option.label}
                    </span>
                    <span className="block text-[10px] text-pink-400 mt-1 leading-tight">
                      {option.description}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-4 rounded-xl bg-white/55 border border-pink-100/70 p-3.5">
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-xs font-semibold text-pink-700">语速</label>
                <span className="text-xs tabular-nums text-pink-500">
                  {settings.speed.toFixed(2)}×
                </span>
              </div>
              <input
                type="range"
                min="0.8"
                max="1.2"
                step="0.05"
                value={settings.speed}
                onChange={(event) => onChange({ speed: Number(event.target.value) })}
                className="w-full accent-pink-500"
              />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-xs font-semibold text-pink-700">音调微调</label>
                <span className="text-xs tabular-nums text-pink-500">
                  {settings.pitch > 0 ? '+' : ''}{settings.pitch}
                </span>
              </div>
              <input
                type="range"
                min="-3"
                max="3"
                step="1"
                value={settings.pitch}
                onChange={(event) => onChange({ pitch: Number(event.target.value) })}
                className="w-full accent-pink-500"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-amber-50 border border-amber-200/70 px-3 py-2.5">
              <p className="text-xs text-amber-700 leading-relaxed">{error}</p>
            </div>
          )}

          <div className="rounded-xl bg-pink-50/70 border border-pink-100 px-3 py-2.5">
            <p className="text-[11px] text-pink-500 leading-relaxed">
              声线由角色外观转译出的文字设定生成，不复刻或模仿任何真人。重新生成试听会调用语音设计服务并产生少量字符费用。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-pink-100/60">
          <button
            onClick={onReset}
            disabled={isDesigning}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-pink-400 hover:text-pink-600 hover:bg-pink-50 disabled:opacity-50 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            恢复角色设定
          </button>
          <div className="flex-1" />
          <button
            onClick={onPreview}
            disabled={isDesigning || settings.description.trim().length < 20}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-pink-400 to-pink-500 hover:from-pink-500 hover:to-pink-600 disabled:opacity-50 shadow-sm transition-colors"
          >
            {isDesigning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : settings.voiceId ? (
              <Sparkles className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
            {isDesigning ? '正在设计声线…' : settings.voiceId ? '重新生成并试听' : '生成并试听'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
