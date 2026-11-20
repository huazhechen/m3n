import { useEffect, useState } from 'react'
import { isLocalScoreId, loadLocalScore } from '../lib/local-scores'
import { loadPresetScore, presetScores } from '../lib/samples'
import { loadSharedScore } from '../lib/shared-scores'

type ScoreSourceState = {
  id: string | undefined
  status: 'loading' | 'ready' | 'missing' | 'error'
  source?: string
  error?: string
}

export async function loadScoreSource(id: string, collection: 'scores' | 'works' = 'scores'): Promise<string | null> {
  if (collection === 'works') return (await import('../lib/works')).loadWorkScore(id)
  if (isLocalScoreId(id)) return loadLocalScore(id)?.source ?? null
  if (presetScores.some(score => score.slug === id)) return loadPresetScore(id)
  return (await loadSharedScore(id))?.source ?? null
}

/** Resolves all score origins with one lifecycle and never displays the previous route's score. */
export function useScoreSource(id: string | undefined, collection: 'scores' | 'works' = 'scores') {
  const identity = `${collection}:${id ?? ''}`
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<ScoreSourceState>({ id: identity, status: id ? 'loading' : 'ready' })
  useEffect(() => {
    if (!id) {
      setState({ id: identity, status: 'ready' })
      return
    }
    let cancelled = false
    setState({ id: identity, status: 'loading' })
    void loadScoreSource(id, collection).then(source => {
      if (!cancelled) setState(source === null ? { id: identity, status: 'missing' } : { id: identity, status: 'ready', source })
    }).catch((error: unknown) => {
      if (!cancelled) setState({ id: identity, status: 'error', error: error instanceof Error ? error.message : '乐谱加载失败。' })
    })
    return () => { cancelled = true }
  }, [attempt, id, collection, identity])
  const current: ScoreSourceState = state.id === identity ? state : { id: identity, status: id ? 'loading' : 'ready' }
  return { ...current, retry: () => setAttempt(value => value + 1) }
}
