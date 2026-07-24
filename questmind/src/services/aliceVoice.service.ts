import type { AliceExpression } from '@/assets/alice'

const VOICE_SETTINGS_KEY = 'questmind:alice-voice-settings-v2'

export type AliceVoiceStyle = 'gentle' | 'confident' | 'lively'

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
  '音色明亮清澈、温暖通透，处于自然的中高音区，但绝不尖细或幼态。',
  '声音带少量柔和气息和丝绸般的质感，咬字精致清楚，尾音轻盈而克制。',
  '她有黑金礼服般的优雅与大小姐式的从容自信，同时保留亲近、体贴的笑意。',
  '日常交谈自然、不播音腔、不夸张卖萌；认真解释时沉稳可信，开心时灵动但不吵闹。',
  '整体听感独特、有辨识度，像一位聪明温柔、偶尔有点小骄傲的长期陪伴者。',
].join('')

export const DEFAULT_ALICE_VOICE_SETTINGS: AliceVoiceSettings = {
  speed: 0.95,
  pitch: 0,
  style: 'gentle',
  description: ALICE_VOICE_DESCRIPTION,
  voiceId: null,
}

function isVoiceStyle(value: unknown): value is AliceVoiceStyle {
  return value === 'gentle' || value === 'confident' || value === 'lively'
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

export async function synthesizeAliceVoice(
  text: string,
  expression: AliceExpression | null,
  settings: AliceVoiceSettings,
  signal?: AbortSignal
): Promise<AliceVoiceAudio> {
  return requestVoiceAudio({
    action: 'synthesize',
    text,
    expression,
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
