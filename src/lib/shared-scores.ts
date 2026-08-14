import { pinyin } from 'pinyin-pro'
import { loadSimulatedSubmission, saveSimulatedSubmission } from './simulated-submissions'
import { isSimulatedSubmit } from './submit-mode'

export type SharedScore = {
  source: string
  createdAt: string
}

export function isSharedScoreId(value: string | undefined) {
  return value !== undefined && (/^[a-f0-9]{12}$/.test(value) || /^[a-z0-9]+(?:_[a-z0-9]+)*_[0-9]{13}$/.test(value))
}

function scoreTitle(source: string) {
  return source.match(/\{title=([^}]*)\}/)?.[1]?.trim() ?? ''
}

export function submittedScoreId(source: string, timestamp = Date.now()) {
  const transliterated = pinyin(scoreTitle(source), { toneType: 'none', separator: '_' })
  const slug = transliterated
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 128) || 'untitled'
  return `${slug}_${timestamp}`
}

async function responseError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: unknown } | null
  return typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status}).`
}

export async function submitScore(source: string) {
  const id = submittedScoreId(source)
  if (isSimulatedSubmit()) {
    saveSimulatedSubmission(id, source)
    return id
  }
  const response = await fetch('/api/scores/submissions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source, id }),
  })
  if (!response.ok) throw new Error(await responseError(response))
  const payload = await response.json() as { id?: unknown }
  if (typeof payload.id !== 'string' || payload.id !== id || !isSharedScoreId(payload.id)) throw new Error('Server returned an invalid score ID.')
  return payload.id
}

export async function loadSharedScore(id: string): Promise<SharedScore | null> {
  if (!isSharedScoreId(id)) return null
  if (isSimulatedSubmit()) return loadSimulatedSubmission(id)
  const response = await fetch(`/api/scores/${encodeURIComponent(id)}`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(await responseError(response))
  const payload = await response.json() as Partial<SharedScore>
  if (typeof payload.source !== 'string' || typeof payload.createdAt !== 'string') throw new Error('Server returned an invalid score.')
  return { source: payload.source, createdAt: payload.createdAt }
}
