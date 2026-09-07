/**
 * Supabase Edge Function: alice-voice
 *
 * Secret:
 *   supabase secrets set MINIMAX_API_KEY=你的Key
 *
 * Deploy:
 *   supabase functions deploy alice-voice
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const MINIMAX_API_URL = 'https://api.minimaxi.com/v1'
const DEFAULT_VOICE_ID = 'questmind-alice-voice-v4'
const PREVIEW_TEXT =
  '早上好。今天的安排我已经整理好了：十点前先处理最紧急的两项任务，其余事项我会按优先级提醒你。不过……你昨晚休息得太晚了。先喝口水，稍微缓一缓吧。别担心，剩下的交给我。'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'X-Alice-Voice-Id, X-Alice-Voice-Source',
}

type AliceExpression =
  | 'happy'
  | 'shy'
  | 'angry'
  | 'surprised'
  | 'sleepy'
  | 'thinking'
  | 'proud'
  | 'sad'

type VoiceStyle = 'reserved' | 'gentle' | 'sharp'
type VoiceState = 'NEUTRAL' | 'RELAXED' | 'HAPPY' | 'SERIOUS' | 'CONCERNED' | 'PLAYFUL' | 'FOCUSED' | 'SOFT'

interface VoiceRequest {
  action: 'design' | 'synthesize'
  text?: string
  expression?: AliceExpression | null
  voiceState?: VoiceState
  voiceId?: string | null
  speed?: number
  pitch?: number
  style?: VoiceStyle
  description?: string
}

interface MiniMaxResponse {
  voice_id?: string
  trial_audio?: string
  data?: {
    audio?: string
    status?: number
  }
  base_resp?: {
    status_code?: number
    status_msg?: string
  }
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(Math.floor(hex.length / 2))
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

function getEmotion(expression?: AliceExpression | null): string {
  const emotions: Partial<Record<AliceExpression, string>> = {
    happy: 'happy',
    angry: 'angry',
    surprised: 'surprised',
    sad: 'sad',
  }
  return expression ? emotions[expression] || 'calm' : 'calm'
}

function applyVoiceState(speed: number, pitch: number, state: VoiceState = 'NEUTRAL') {
  const modifiers: Record<VoiceState, { speed: number; pitch: number; volume: number }> = {
    NEUTRAL: { speed: 1, pitch: 0, volume: 0.96 },
    RELAXED: { speed: 0.97, pitch: 0, volume: 0.92 },
    HAPPY: { speed: 1.04, pitch: 1, volume: 1 },
    SERIOUS: { speed: 1, pitch: -1, volume: 0.98 },
    CONCERNED: { speed: 0.93, pitch: -1, volume: 0.84 },
    PLAYFUL: { speed: 1.05, pitch: 1, volume: 0.98 },
    FOCUSED: { speed: 1.01, pitch: -1, volume: 0.96 },
    SOFT: { speed: 0.9, pitch: -1, volume: 0.78 },
  }
  const modifier = modifiers[state] || modifiers.NEUTRAL
  return { speed: speed * modifier.speed, pitch: pitch + modifier.pitch, volume: modifier.volume }
}

function getVoiceEmotion(body: VoiceRequest): string {
  if (body.voiceState === 'HAPPY' || body.voiceState === 'PLAYFUL') return 'happy'
  if (body.voiceState === 'CONCERNED') return 'sad'
  if (body.voiceState === 'SERIOUS' || body.voiceState === 'FOCUSED') return 'fluent'
  return getEmotion(body.expression)
}

function directPerformanceText(rawText: string, body: VoiceRequest): string {
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

  const state = body.voiceState || 'NEUTRAL'
  if (state === 'SOFT' || state === 'CONCERNED') text = `(breath)${text}`
  if (state === 'PLAYFUL' && /(?:真是|当然|果然)/.test(text)) text = `(chuckle)${text}`
  if (body.expression === 'surprised' && !text.startsWith('(gasps)')) text = `(gasps)${text}`
  return text
}

function applyStyle(
  speed: number,
  pitch: number,
  style: VoiceStyle
): { speed: number; pitch: number } {
  if (style === 'reserved') {
    return { speed, pitch: pitch - 1 }
  }
  if (style === 'sharp') {
    return { speed: speed * 1.04, pitch: pitch - 1 }
  }
  return { speed: speed * 0.92, pitch: pitch - 1 }
}

async function callMiniMax(
  path: string,
  apiKey: string,
  body: Record<string, unknown>
): Promise<MiniMaxResponse> {
  const response = await fetch(`${MINIMAX_API_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await response.json() as MiniMaxResponse
  if (!response.ok || data.base_resp?.status_code !== 0) {
    const message = data.base_resp?.status_msg || `MiniMax 请求失败（${response.status}）`
    throw new Error(message)
  }
  return data
}

async function designVoice(
  apiKey: string,
  description: string,
  requestedVoiceId?: string
): Promise<{ voiceId: string; audioHex: string }> {
  const data = await callMiniMax('/voice_design', apiKey, {
    prompt: description,
    preview_text: PREVIEW_TEXT,
    ...(requestedVoiceId ? { voice_id: requestedVoiceId } : {}),
    aigc_watermark: false,
  })

  if (!data.voice_id || !data.trial_audio) {
    throw new Error('音色设计服务没有返回有效音频')
  }
  return { voiceId: data.voice_id, audioHex: data.trial_audio }
}

async function synthesize(
  apiKey: string,
  body: VoiceRequest,
  voiceId: string
): Promise<string> {
  const style = body.style === 'reserved' || body.style === 'sharp'
    ? body.style
    : 'reserved'
  const styled = applyStyle(
    clamp(typeof body.speed === 'number' ? body.speed : 0.95, 0.5, 2),
    clamp(Math.round(typeof body.pitch === 'number' ? body.pitch : 0), -12, 12),
    style
  )
  const adjusted = applyVoiceState(styled.speed, styled.pitch, body.voiceState)
  const data = await callMiniMax('/t2a_v2', apiKey, {
    model: 'speech-2.8-hd',
    text: directPerformanceText(body.text || '', body),
    stream: false,
    voice_setting: {
      voice_id: voiceId,
      speed: clamp(adjusted.speed, 0.5, 2),
      vol: adjusted.volume,
      pitch: clamp(adjusted.pitch, -12, 12),
      emotion: getVoiceEmotion(body),
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: 'mp3',
      channel: 1,
    },
    language_boost: 'Chinese',
    output_format: 'hex',
    subtitle_enable: false,
    aigc_watermark: false,
  })

  if (!data.data?.audio) throw new Error('语音合成服务没有返回有效音频')
  return data.data.audio
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') return jsonError('Method not allowed', 405)

  const apiKey = Deno.env.get('MINIMAX_API_KEY')
  if (!apiKey) return jsonError('定制声线服务尚未配置 MINIMAX_API_KEY', 503)

  try {
    const body = await req.json() as VoiceRequest
    const description = body.description?.trim() || ''
    if (description.length < 20 || description.length > 1000) {
      return jsonError('声线描述长度需要在 20–1000 字之间', 400)
    }

    if (body.action === 'design') {
      const designed = await designVoice(apiKey, description)
      return new Response(hexToBytes(designed.audioHex), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'no-store',
          'X-Alice-Voice-Id': designed.voiceId,
          'X-Alice-Voice-Source': 'designed',
        },
      })
    }

    if (body.action !== 'synthesize') {
      return jsonError('不支持的语音操作', 400)
    }
    const text = body.text?.trim() || ''
    if (!text || text.length > 3000) {
      return jsonError('待朗读文字长度需要在 1–3000 字之间', 400)
    }

    const configuredVoiceId = Deno.env.get('ALICE_VOICE_ID')
    let voiceId = body.voiceId || configuredVoiceId || DEFAULT_VOICE_ID
    let audioHex: string

    try {
      audioHex = await synthesize(apiKey, body, voiceId)
    } catch (firstError) {
      if (body.voiceId || configuredVoiceId) throw firstError
      const designed = await designVoice(apiKey, description, DEFAULT_VOICE_ID)
      voiceId = designed.voiceId
      audioHex = await synthesize(apiKey, body, voiceId)
    }

    return new Response(hexToBytes(audioHex), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-Alice-Voice-Id': voiceId,
        'X-Alice-Voice-Source': 'custom',
      },
    })
  } catch (error) {
    console.error('Alice voice error:', error)
    const message = error instanceof Error ? error.message : '定制声线服务异常'
    return jsonError(message, 502)
  }
})
