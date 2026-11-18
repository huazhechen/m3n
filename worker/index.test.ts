import { describe, expect, it } from 'vitest'
import { createWorker, isSharedScoreId, type Env } from './index'

function testWorker(assetResponse?: () => Response) {
  const values = new Map<string, unknown>()
  const puts: Array<{ key: string; options: { expirationTtl: number } }> = []
  const env: Env = {
    M3N_SCORES: {
      async get(key) { return values.get(key) ?? null },
      async put(key, value, options) {
        values.set(key, JSON.parse(value))
        puts.push({ key, options })
      },
    },
    ASSETS: { async fetch() { return assetResponse?.() ?? new Response('asset') } },
  }
  return { worker: createWorker(env), puts }
}

describe('Cloudflare KV score API', () => {
  it.each(['GET', 'HEAD'])('rejects SPA HTML returned for a missing module (%s)', async method => {
    const { worker } = testWorker(() => new Response('<html>SPA</html>', {
      headers: { 'content-type': 'text/html', 'cache-control': 'public, max-age=31536000, immutable' },
    }))
    const response = await worker.fetch(new Request('https://m3n.example/assets/old-build.js', { method }))
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-type')).toContain('text/plain')
    if (method === 'HEAD') expect(await response.text()).toBe('')
  })

  it('preserves valid JavaScript, immutable caching and deep-link HTML', async () => {
    const script = 'export default 1'
    const { worker } = testWorker(() => new Response(script, {
      headers: { 'content-type': 'text/javascript', 'cache-control': 'public, max-age=31536000, immutable' },
    }))
    const response = await worker.fetch(new Request('https://m3n.example/assets/current.js'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/javascript')
    expect(response.headers.get('cache-control')).toContain('immutable')
    expect(await response.text()).toBe(script)
    const page = testWorker(() => new Response('<html>SPA</html>', { headers: { 'content-type': 'text/html' } }))
    const deepLink = await page.worker.fetch(new Request('https://m3n.example/scores/huan_le_song_01'))
    expect(deepLink.status).toBe(200)
    expect(await deepLink.text()).toBe('<html>SPA</html>')
  })

  it('creates a temporary content-hash score record and retrieves it by ID', async () => {
    const { worker, puts } = testWorker()
    const created = await worker.fetch(new Request('https://m3n.example/api/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: '{2/4}\nN: 1 2 |||' }),
    }))

    expect(created.status).toBe(201)
    const { id } = await created.json() as { id: string }
    expect(id).toBe('4a129a221812')
    expect(isSharedScoreId(id)).toBe(true)
    expect(puts).toEqual([{ key: `score:${id}`, options: { expirationTtl: 7 * 24 * 60 * 60 } }])

    const loaded = await worker.fetch(new Request(`https://m3n.example/api/scores/${id}`))
    expect(loaded.status).toBe(200)
    expect(await loaded.json()).toMatchObject({ source: '{2/4}\nN: 1 2 |||' })
  })

  it('stores submitted scores for fifteen days', async () => {
    const { worker, puts } = testWorker()
    const id = 'xiao_xing_xing_1785859200000'
    const created = await worker.fetch(new Request('https://m3n.example/api/scores/submissions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, source: '{title=小星星}\n{2/4}\nN: 1 2 |||' }),
    }))

    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({ id })
    expect(puts).toEqual([{ key: `score:${id}`, options: { expirationTtl: 15 * 24 * 60 * 60 } }])
  })

  it('rejects empty and malformed score requests', async () => {
    const { worker } = testWorker()
    const empty = await worker.fetch(new Request('https://m3n.example/api/scores', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: '' }),
    }))
    const malformed = await worker.fetch(new Request('https://m3n.example/api/scores/not-an-id'))

    expect(empty.status).toBe(400)
    expect(malformed.status).toBe(404)
  })
})
