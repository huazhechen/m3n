export type SharedScore = {
  source: string
  createdAt: string
}

export function isSharedScoreId(value: string | undefined) {
  return value !== undefined && /^[A-Za-z0-9_-]{20,80}$/.test(value)
}

async function responseError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: unknown } | null
  return typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status}).`
}

export async function createSharedScore(source: string) {
  const response = await fetch('/api/scores', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source }),
  })
  if (!response.ok) throw new Error(await responseError(response))
  const payload = await response.json() as { id?: unknown }
  if (typeof payload.id !== 'string' || !isSharedScoreId(payload.id)) throw new Error('Server returned an invalid score ID.')
  return payload.id
}

export async function loadSharedScore(id: string): Promise<SharedScore | null> {
  if (!isSharedScoreId(id)) return null
  const response = await fetch(`/api/scores/${encodeURIComponent(id)}`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(await responseError(response))
  const payload = await response.json() as Partial<SharedScore>
  if (typeof payload.source !== 'string' || typeof payload.createdAt !== 'string') throw new Error('Server returned an invalid score.')
  return { source: payload.source, createdAt: payload.createdAt }
}
