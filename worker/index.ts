export type ScoreStore = {
  get(key: string, type: 'json'): Promise<unknown>
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>
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

const temporaryScoreIdPattern = /^[a-f0-9]{12}$/
const submittedScoreIdPattern = /^[a-z0-9]+(?:_[a-z0-9]+)*_[0-9]{13}$/
const maxSourceBytes = 256 * 1024
const temporaryScoreTtl = 7 * 24 * 60 * 60
const submittedScoreTtl = 15 * 24 * 60 * 60

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
  return temporaryScoreIdPattern.test(value) || submittedScoreIdPattern.test(value)
}

async function sourceId(source: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  return [...new Uint8Array(digest).slice(0, 6)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function requestSource(body: unknown) {
  return typeof body === 'object' && body !== null && 'source' in body && typeof body.source === 'string'
    ? body.source
    : undefined
}

async function requestBody(request: Request) {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return { ok: false, error: 'Content-Type must be application/json.' } as const
  try {
    return { ok: true, body: await request.json() } as const
  } catch {
    return { ok: false, error: 'Request body must be valid JSON.' } as const
  }
}

function validateSource(source: string | undefined) {
  if (!source?.trim()) return 'Score source is required.'
  if (new TextEncoder().encode(source).byteLength > maxSourceBytes) return 'Score source exceeds 256 KiB.'
  return undefined
}

export function createWorker(env: Env) {
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url)
      const match = /^\/api\/scores\/([^/]+)$/.exec(url.pathname)

      if (request.method === 'POST' && url.pathname === '/api/scores') {
        const parsed = await requestBody(request)
        if (!parsed.ok) return invalidRequest(parsed.error)
        const source = requestSource(parsed.body)
        const sourceError = validateSource(source)
        if (typeof source !== 'string' || sourceError) return invalidRequest(sourceError ?? 'Score source is required.')

        const id = await sourceId(source)
        const score: SharedScore = { source, createdAt: new Date().toISOString() }
        await env.M3N_SCORES.put(scoreKey(id), JSON.stringify(score), { expirationTtl: temporaryScoreTtl })
        return json({ id }, { status: 201, headers: { 'cache-control': 'no-store' } })
      }

      if (request.method === 'POST' && url.pathname === '/api/scores/submissions') {
        const parsed = await requestBody(request)
        if (!parsed.ok) return invalidRequest(parsed.error)
        const source = requestSource(parsed.body)
        const sourceError = validateSource(source)
        if (typeof source !== 'string' || sourceError) return invalidRequest(sourceError ?? 'Score source is required.')
        const id = typeof parsed.body === 'object' && parsed.body !== null && 'id' in parsed.body && typeof parsed.body.id === 'string'
          ? parsed.body.id
          : undefined
        if (!id || !submittedScoreIdPattern.test(id)) return invalidRequest('Submitted score ID is invalid.')

        const score: SharedScore = { source, createdAt: new Date().toISOString() }
        await env.M3N_SCORES.put(scoreKey(id), JSON.stringify(score), { expirationTtl: submittedScoreTtl })
        return json({ id }, { status: 201, headers: { 'cache-control': 'no-store' } })
      }

      if (request.method === 'GET' && match) {
        const id = match[1] ?? ''
        if (!isSharedScoreId(id)) return json({ error: 'Invalid score id.' }, { status: 404 })
        const score = await env.M3N_SCORES.get(scoreKey(id), 'json') as SharedScore | null
        if (!score || typeof score.source !== 'string') return json({ error: 'Score not found.' }, { status: 404 })
        return json(score, { headers: { 'cache-control': 'public, max-age=300' } })
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
