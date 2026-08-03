import { describe, expect, it } from 'vitest'
import { createWorker, isSharedScoreId, type Env } from './index'

function testWorker() {
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
    ASSETS: { async fetch() { return new Response('asset') } },
  }
  return { worker: createWorker(env), puts }
}

describe('Cloudflare KV score API', () => {
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
    const id = 'xiao-xing-xing_1785859200000'
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
