import { describe, expect, it } from 'vitest'
import { createWorker, isSharedScoreId, type Env } from './index'

function testWorker() {
  const values = new Map<string, unknown>()
  const env: Env = {
    M3N_SCORES: {
      async get(key) { return values.get(key) ?? null },
      async put(key, value) { values.set(key, JSON.parse(value)) },
    },
    ASSETS: { async fetch() { return new Response('asset') } },
  }
  return { worker: createWorker(env) }
}

describe('Cloudflare KV score API', () => {
  it('creates an immutable score record and retrieves it by ID', async () => {
    const { worker } = testWorker()
    const created = await worker.fetch(new Request('https://m3n.example/api/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: '{2/4}\nN: 1 2 |||' }),
    }))

    expect(created.status).toBe(201)
    const { id } = await created.json() as { id: string }
    expect(isSharedScoreId(id)).toBe(true)

    const loaded = await worker.fetch(new Request(`https://m3n.example/api/scores/${id}`))
    expect(loaded.status).toBe(200)
    expect(await loaded.json()).toMatchObject({ source: '{2/4}\nN: 1 2 |||' })
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
