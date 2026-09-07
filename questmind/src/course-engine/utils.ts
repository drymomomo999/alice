export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value))
}

export function round(value: number, digits = 3): number {
  const power = 10 ** digits
  return Math.round(value * power) / power
}

export function stableId(prefix: string, input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`
}

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .replace(/(的定义|定义|概念|公式|定理|方法|简介|介绍|小结|总结)$/u, '')
}

export function tokenize(value: string): Set<string> {
  const normalized = value.toLowerCase()
  const latin = normalized.match(/[a-z][a-z0-9_-]{1,}/g) || []
  const chinese = normalized.match(/[\u4e00-\u9fff]{2,}/g) || []
  const grams = chinese.flatMap(word => {
    if (word.length <= 4) return [word]
    const result: string[] = []
    for (let i = 0; i < word.length - 1; i += 1) result.push(word.slice(i, i + 2))
    return result
  })
  return new Set([...latin, ...grams])
}

export function similarity(a: string, b: string): number {
  const normalizedA = normalizeName(a)
  const normalizedB = normalizeName(b)
  if (!normalizedA || !normalizedB) return 0
  if (normalizedA === normalizedB) return 1
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) return 0.86
  const left = tokenize(a)
  const right = tokenize(b)
  if (!left.size || !right.size) return 0
  let intersection = 0
  left.forEach(token => { if (right.has(token)) intersection += 1 })
  return intersection / (left.size + right.size - intersection)
}

export function estimateTokens(value: string): number {
  const chineseChars = (value.match(/[\u4e00-\u9fff]/g) || []).length
  const otherChars = value.length - chineseChars
  return Math.ceil(chineseChars / 1.5 + otherChars / 4)
}

export function addDays(iso: string, days: number): string {
  const date = new Date(iso)
  date.setDate(date.getDate() + days)
  return date.toISOString()
}
