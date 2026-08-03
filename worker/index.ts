export type ScoreStore = {
  get(key: string, type: 'json'): Promise<unknown>
  put(key: string, value: string): Promise<void>
}

export type AssetFetcher = {
  fetch(request: Request): Promise<Response>
}

export type Env = {
  M3N_SCORES: ScoreStore
  ASSETS: AssetFetcher
}

type SharedScore = {
  source: string
  createdAt: string
}

const scoreIdPattern = /^[A-Za-z0-9_-]{20,80}$/
const maxSourceBytes = 256 * 1024

function json(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(value), { ...init, headers })
}

function scoreKey(id: string) {
  return `score:${id}`
}

function invalidRequest(message: string) {
  return json({ error: message }, { status: 400 })
}

export function isSharedScoreId(value: string) {
  return scoreIdPattern.test(value)
}

export function createWorker(env: Env) {
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url)
      const match = /^\/api\/scores\/([^/]+)$/.exec(url.pathname)

      if (request.method === 'POST' && url.pathname === '/api/scores') {
        const contentType = request.headers.get('content-type') ?? ''
        if (!contentType.includes('application/json')) return invalidRequest('Content-Type must be application/json.')
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return invalidRequest('Request body must be valid JSON.')
        }
        const source = typeof body === 'object' && body !== null && 'source' in body && typeof body.source === 'string'
          ? body.source
          : undefined
        if (!source?.trim()) return invalidRequest('Score source is required.')
        if (new TextEncoder().encode(source).byteLength > maxSourceBytes) return invalidRequest('Score source exceeds 256 KiB.')

        const id = crypto.randomUUID().replaceAll('-', '')
        const score: SharedScore = { source, createdAt: new Date().toISOString() }
        await env.M3N_SCORES.put(scoreKey(id), JSON.stringify(score))
        return json({ id }, { status: 201, headers: { 'cache-control': 'no-store' } })
      }

      if (request.method === 'GET' && match) {
        const id = match[1] ?? ''
        if (!isSharedScoreId(id)) return json({ error: 'Invalid score id.' }, { status: 404 })
        const score = await env.M3N_SCORES.get(scoreKey(id), 'json') as SharedScore | null
        if (!score || typeof score.source !== 'string') return json({ error: 'Score not found.' }, { status: 404 })
        return json(score, { headers: { 'cache-control': 'public, max-age=31536000, immutable' } })
      }

      return env.ASSETS.fetch(request)
    },
  }
}

export default {
  fetch(request: Request, env: Env) {
    return createWorker(env).fetch(request)
  },
}
