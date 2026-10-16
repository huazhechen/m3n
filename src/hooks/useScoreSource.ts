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

export async function loadScoreSource(id: string): Promise<string | null> {
  if (isLocalScoreId(id)) return loadLocalScore(id)?.source ?? null
  if (presetScores.some(score => score.slug === id)) return loadPresetScore(id)
  return (await loadSharedScore(id))?.source ?? null
}

/** Resolves all score origins with one lifecycle and never displays the previous route's score. */
export function useScoreSource(id: string | undefined): ScoreSourceState {
  const [state, setState] = useState<ScoreSourceState>({ id, status: id ? 'loading' : 'ready' })
  useEffect(() => {
    if (!id) {
      setState({ id, status: 'ready' })
      return
    }
    let cancelled = false
    setState({ id, status: 'loading' })
    void loadScoreSource(id).then(source => {
      if (!cancelled) setState(source === null ? { id, status: 'missing' } : { id, status: 'ready', source })
    }).catch((error: unknown) => {
      if (!cancelled) setState({ id, status: 'error', error: error instanceof Error ? error.message : '乐谱加载失败。' })
    })
    return () => { cancelled = true }
  }, [id])
  return state.id === id ? state : { id, status: id ? 'loading' : 'ready' }
}
