import { useEffect, useMemo, useRef, useState } from 'react'
import { analyzeM3N, restoreM3NAnalysis } from '@m3n/notation'
import { AnalysisClient } from '../lib/analysis-client'

export function useM3NAnalysis(source: string, { background = true, suspended = false } = {}) {
  const [analysis, setAnalysis] = useState(() => analyzeM3N(source))
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const client = useRef<AnalysisClient | null>(null)
  const synchronous = useMemo(() => background ? null : analysis.source === source ? analysis : analyzeM3N(source), [analysis, background, source])

  useEffect(() => () => { client.current?.destroy(); client.current = null }, [])
  useEffect(() => {
    if (!background) return
    if (analysis.source === source) { setError(''); return }
    if (suspended) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      try {
        client.current ??= new AnalysisClient(new Worker(new URL('../lib/analysis.worker.ts', import.meta.url), { type: 'module' }))
        void client.current.analyze(source).then(snapshot => {
          if (!cancelled) { setAnalysis(restoreM3NAnalysis(snapshot)); setError('') }
        }).catch((error: unknown) => {
          if (!cancelled && !(error instanceof DOMException && error.name === 'AbortError')) {
            client.current?.destroy()
            client.current = null
            setError(error instanceof Error ? error.message : '乐谱分析失败。')
          }
        })
      } catch {
        // Browsers without module workers still support editing; defer the fallback until typing pauses.
        if (!cancelled) { setAnalysis(analyzeM3N(source)); setError('') }
      }
    }, 80)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [analysis.source, attempt, background, source, suspended])

  return { analysis: synchronous ?? analysis, isAnalyzing: background && analysis.source !== source, error, retry: () => setAttempt(value => value + 1) }
}
