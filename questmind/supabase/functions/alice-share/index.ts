const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Category = 'technology' | 'science' | 'culture' | 'world' | 'games' | 'life'

interface Story {
  category: Category
  title: string
  summary: string
  url: string
  source: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function isSafeUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

async function fetchHackerNews(excluded: Set<string>): Promise<Story | null> {
  const response = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json')
  if (!response.ok) return null
  const ids = (await response.json()) as number[]
  for (const id of ids.slice(0, 24)) {
    const itemResponse = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
    if (!itemResponse.ok) continue
    const item = await itemResponse.json()
    const url = isSafeUrl(item?.url) ? item.url : `https://news.ycombinator.com/item?id=${id}`
    if (!item?.title || excluded.has(url)) continue
    return {
      category: 'technology',
      title: String(item.title).slice(0, 240),
      summary: `这是 Hacker News 当前热门讨论之一，已有 ${Number(item.score || 0)} 点热度。`,
      url,
      source: 'Hacker News',
    }
  }
  return null
}

const gdeltQueries: Record<Exclude<Category, 'technology'>, string> = {
  science: '(science OR discovery OR research)',
  culture: '(culture OR books OR film OR art)',
  world: '(world OR society OR cities)',
  games: '(games OR gaming OR videogame)',
  life: '(lifestyle OR wellbeing OR creativity)',
}

async function fetchGdelt(category: Exclude<Category, 'technology'>, excluded: Set<string>): Promise<Story | null> {
  const params = new URLSearchParams({
    query: gdeltQueries[category],
    mode: 'artlist',
    maxrecords: '20',
    timespan: '24h',
    sort: 'hybridrel',
    format: 'json',
  })
  const response = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`, {
    headers: { 'User-Agent': 'QuestMind-Alice/1.0' },
  })
  if (!response.ok) return null
  const payload = await response.json()
  const articles = Array.isArray(payload?.articles) ? payload.articles : []
  const article = articles.find((item: Record<string, unknown>) => (
    typeof item.title === 'string'
    && isSafeUrl(item.url)
    && !excluded.has(item.url)
  ))
  if (!article) return null
  const url = String(article.url)
  const source = typeof article.domain === 'string' ? article.domain : new URL(url).hostname
  return {
    category,
    title: String(article.title).slice(0, 240),
    summary: `这是一则过去 24 小时内被公开新闻索引收录的内容，来自 ${source}。`,
    url,
    source,
  }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await request.json().catch(() => ({}))
    const allowed: Category[] = ['technology', 'science', 'culture', 'world', 'games', 'life']
    const category = allowed.includes(body?.category) ? body.category as Category : 'life'
    const excluded = new Set<string>(Array.isArray(body?.excludedUrls) ? body.excludedUrls.filter(isSafeUrl).slice(0, 20) : [])
    const story = category === 'technology'
      ? await fetchHackerNews(excluded)
      : await fetchGdelt(category, excluded)
    return story ? json({ story }) : json({ story: null }, 404)
  } catch (error) {
    console.error('alice-share failed', error)
    return json({ error: 'Unable to find a shareable story right now.' }, 502)
  }
})
