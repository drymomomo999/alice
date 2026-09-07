import type { AliceExpression } from '@/assets/alice'
import type { AliceVoiceState } from '@/types'

// Bump this key when replacing Alice's canonical voice so an old generated
// voice id cannot silently override the new direction.
const VOICE_SETTINGS_KEY = 'questmind:alice-voice-settings-v5'

export type AliceVoiceStyle = 'reserved' | 'gentle' | 'sharp'

export interface AliceVoiceSettings {
  speed: number
  pitch: number
  style: AliceVoiceStyle
  description: string
  voiceId: string | null
}

export interface AliceVoiceAudio {
  blob: Blob
  voiceId: string | null
}

export class AliceVoiceServiceError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AliceVoiceServiceError'
    this.status = status
  }
}

export const ALICE_VOICE_DESCRIPTION = [
  '一位二十岁出头的成年女性，普通话母语。',
  '音色清澈偏冷、干净利落，处于自然的中高音区；成熟但不年长，不尖细、不幼态、不甜腻。',
  '她像一位能力很强的私人秘书：专业、周到、始终提前半步，开口时便让人觉得事情已经被妥善接住。',
  '咬字清楚准确，信息段节奏干练，重点明确；每句长短和重音略有变化，不做匀速朗读。',
  '她的礼貌自然而不刻意，不卑微、不谄媚、不像客服；声音里有微弱的笑意和可靠感，但不卖萌。',
  '汇报安排时从容高效，提醒风险时稍微压低声线，确认指令时简洁笃定，给出关心时则放慢并轻轻收住句尾。',
  '她会用很轻的呼吸、短暂停顿和语气转折表达思考；情绪越深，表达越克制，但不失去人味。',
  '整体听感是知性、自律、值得依赖，私下又有一点只留给对方的温度；不用播音腔，不演成高傲、机械或过度热情。',
].join('')

export const DEFAULT_ALICE_VOICE_SETTINGS: AliceVoiceSettings = {
  speed: 0.98,
  pitch: -1,
  style: 'reserved',
  description: ALICE_VOICE_DESCRIPTION,
  voiceId: null,
}

function isVoiceStyle(value: unknown): value is AliceVoiceStyle {
  return value === 'reserved' || value === 'gentle' || value === 'sharp'
}

export function loadAliceVoiceSettings(): AliceVoiceSettings {
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_KEY)
    if (!raw) return DEFAULT_ALICE_VOICE_SETTINGS
    const parsed = JSON.parse(raw) as Partial<AliceVoiceSettings>
    return {
      speed: typeof parsed.speed === 'number' ? parsed.speed : DEFAULT_ALICE_VOICE_SETTINGS.speed,
      pitch: typeof parsed.pitch === 'number' ? parsed.pitch : DEFAULT_ALICE_VOICE_SETTINGS.pitch,
      style: isVoiceStyle(parsed.style) ? parsed.style : DEFAULT_ALICE_VOICE_SETTINGS.style,
      description:
        typeof parsed.description === 'string' && parsed.description.trim().length >= 20
          ? parsed.description
          : DEFAULT_ALICE_VOICE_SETTINGS.description,
      voiceId: typeof parsed.voiceId === 'string' ? parsed.voiceId : null,
    }
  } catch {
    return DEFAULT_ALICE_VOICE_SETTINGS
  }
}

export function saveAliceVoiceSettings(settings: AliceVoiceSettings): void {
  try {
    localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // 存储不可用时仅影响跨会话保存
  }
}

function getFunctionUrl(): string | null {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
  if (!supabaseUrl) return null
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/alice-voice`
}

function getHeaders(): HeadersInit {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  return {
    'Content-Type': 'application/json',
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json() as { error?: string }
    return data.error || `语音服务请求失败（${response.status}）`
  } catch {
    return `语音服务请求失败（${response.status}）`
  }
}

async function requestVoiceAudio(
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<AliceVoiceAudio> {
  const url = getFunctionUrl()
  if (!url) throw new AliceVoiceServiceError('定制声线服务尚未配置', 503)

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    throw new AliceVoiceServiceError(await readError(response), response.status)
  }

  return {
    blob: await response.blob(),
    voiceId: response.headers.get('X-Alice-Voice-Id'),
  }
}

function directPerformanceText(
  rawText: string,
  expression: AliceExpression | null,
  voiceState: AliceVoiceState
): string {
  let text = rawText
    .replace(/<#\d+(?:\.\d+)?#>/g, '')
    .replace(/\((?:laughs|chuckle|coughs|clear-throat|groans|breath|pant|inhale|exhale|gasps|sniffs|sighs|snorts|burps|lip-smacking|humming|hissing|emm|sneezes)\)/gi, '')
    .replace(/(?:……|…|\.{3,})(?=.)/g, '<#0.42#>')
    .replace(/。(?=.)/g, '。<#0.18#>')
    .replace(/[？?](?=.)/g, (mark) => `${mark}<#0.24#>`)
    .replace(/[！!](?=.)/g, (mark) => `${mark}<#0.14#>`)
    .replace(/[；;](?=.)/g, (mark) => `${mark}<#0.2#>`)
    .replace(/^嗯[,，]?/, '(emm)<#0.14#>')
    .replace(/^唉[,，]?/, '(sighs)<#0.16#>')

  if (voiceState === 'SOFT' || voiceState === 'CONCERNED') text = `(breath)${text}`
  if (voiceState === 'PLAYFUL' && /(?:真是|当然|果然)/.test(text)) text = `(chuckle)${text}`
  if (expression === 'surprised' && !text.startsWith('(gasps)')) text = `(gasps)${text}`
  return text
}

export async function synthesizeAliceVoice(
  text: string,
  expression: AliceExpression | null,
  voiceState: AliceVoiceState,
  settings: AliceVoiceSettings,
  signal?: AbortSignal
): Promise<AliceVoiceAudio> {
  return requestVoiceAudio({
    action: 'synthesize',
    text: directPerformanceText(text, expression, voiceState),
    expression,
    voiceState,
    voiceId: settings.voiceId,
    speed: settings.speed,
    pitch: settings.pitch,
    style: settings.style,
    description: settings.description,
  }, signal)
}

export async function designAliceVoice(
  settings: AliceVoiceSettings,
  signal?: AbortSignal
): Promise<AliceVoiceAudio> {
  return requestVoiceAudio({
    action: 'design',
    description: settings.description,
  }, signal)
}
