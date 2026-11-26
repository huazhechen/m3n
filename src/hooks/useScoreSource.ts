import type { LibraryResourceOptions, LibraryResourceProgress } from '../lib/library-resources'
import { useEffect, useState } from 'react'
import { isLocalScoreId, loadLocalScore } from '../lib/local-scores'
import { loadPresetScore, presetScores, preparePresetScores } from '../lib/samples'
import { loadSharedScore } from '../lib/shared-scores'

type ScoreSourceState = {
  id: string | undefined
  status: 'loading' | 'ready' | 'missing' | 'error'
  source?: string
  error?: string
}

export async function loadScoreSource(id: string, collection: 'scores' | 'works' = 'scores', options: LibraryResourceOptions = {}): Promise<string | null> {
  if (collection === 'works') return (await import('../lib/works')).loadWorkScore(id, options.sourcesOnly)
  if (!isLocalScoreId(id) && presetScores.some(score => score.slug === id)) await preparePresetScores(options)
  if (isLocalScoreId(id)) return loadLocalScore(id)?.source ?? null
  if (presetScores.some(score => score.slug === id)) return loadPresetScore(id)
  return (await loadSharedScore(id))?.source ?? null
}

/** Resolves all score origins with one lifecycle and never displays the previous route's score. */
export function useScoreSource(id: string | undefined, collection: 'scores' | 'works' = 'scores', systemCjk = false) {
  const identity = `${collection}:${id ?? ''}`
  const [progress, setProgress] = useState<LibraryResourceProgress | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<ScoreSourceState>({ id: identity, status: id ? 'loading' : 'ready' })
  useEffect(() => {
    if (!id) {
      setState({ id: identity, status: 'ready' })
      return
    }
    const controller = new AbortController()
    let cancelled = false
    setProgress(null)
    setState({ id: identity, status: 'loading' })
    void loadScoreSource(id, collection, { sourcesOnly: systemCjk, signal: controller.signal, onProgress: value => { if (!cancelled) setProgress(value) } }).then(source => {
      if (!cancelled) setState(source === null ? { id: identity, status: 'missing' } : { id: identity, status: 'ready', source })
    }).catch((error: unknown) => {
      if (!cancelled) setState({ id: identity, status: 'error', error: error instanceof Error ? error.message : '乐谱加载失败。' })
    })
    return () => { cancelled = true; controller.abort() }
  }, [attempt, id, collection, identity, systemCjk])
  const current: ScoreSourceState = state.id === identity ? state : { id: identity, status: id ? 'loading' : 'ready' }
  return { ...current, progress, retry: () => setAttempt(value => value + 1) }
}
