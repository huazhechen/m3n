import { Link, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { analyzeM3N, formatScoreDiagnostic } from '@m3n/notation'
import { ScoreRenderer } from '../components/ScoreRenderer'
import { ScoreExportDialog } from '../components/ScoreExportDialog'
import type { ScoreExportDialogRef } from '../components/ScoreExportDialog'
import { NavActionContent, TopNav } from '../components/TopNav'
import { presetScores } from '../lib/samples'
import { sortScoresByCategory } from '../lib/score-order'
import { useScoreSource } from '../hooks/useScoreSource'
import type { ScoreDisplaySettings } from '../lib/render-score'
import { readRenderMode } from '../lib/renderer-settings'
import { ScoreLoadStatus } from '../components/ScoreLoadStatus'
import { attachScoreSwipe } from '../lib/score-swipe'
import { attachScoreKeyboard } from '../lib/score-reader-keyboard'

export function ScoreReaderPage({ collection = 'scores' }: { collection?: 'scores' | 'works' }) {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [immersive, setImmersive] = useState(false)
  const readerRef = useRef<HTMLElement>(null)
  const [works, setWorks] = useState<typeof presetScores>([])
  const basePath = collection === 'works' ? '/works' : '/scores'
  const navProps = collection === 'works' ? { libraryTo: basePath, libraryLabel: '独立作品' } : {}
  const orderedScores = useMemo(() => collection === 'works' ? works : sortScoresByCategory(presetScores), [collection, works])
  const score = orderedScores.find((item) => item.slug === slug)
  const { source: scoreSource, status, error, retry, progress } = useScoreSource(slug, collection)
  useEffect(() => {
    if (collection !== 'works') return
    let cancelled = false
    void import('../lib/works').then(module => module.getWorks()).then(value => {
      if (!cancelled) setWorks(value)
    }).catch(() => { /* Source loading owns the retry UI. */ })
    return () => { cancelled = true }
  }, [collection, slug, status])
  const exportDialogRef = useRef<ScoreExportDialogRef>(null)
  const [displaySettings, setDisplaySettings] = useState<ScoreDisplaySettings | null>(null)
  const [exportError, setExportError] = useState('')
  const analysis = useMemo(() => analyzeM3N(scoreSource ?? ''), [scoreSource])
  const { invalidMeasureIds: invalidMeasures } = analysis
  const result = { ...analysis.score, ...analysis.interaction, diagnostics: analysis.diagnostics }

  const scoreIndex = score ? orderedScores.indexOf(score) : -1
  const previousScore = scoreIndex > 0 ? orderedScores[scoreIndex - 1] : undefined
  const nextScore = scoreIndex >= 0 ? orderedScores[scoreIndex + 1] : undefined
  useEffect(() => {
    if (status !== 'ready' || !readerRef.current) return
    const changeScore = (direction: 'previous' | 'next') => {
      const destination = direction === 'previous' ? previousScore : nextScore
      if (destination) void navigate(`${basePath}/${destination.slug}`)
    }
    const stopSwipe = attachScoreSwipe(readerRef.current, changeScore)
    const stopKeyboard = attachScoreKeyboard(readerRef.current, changeScore)
    return () => { stopSwipe(); stopKeyboard() }
  }, [status, basePath, previousScore, nextScore, navigate])

  if (status !== 'ready') return <main><TopNav {...navProps} /><ScoreLoadStatus {...navProps} status={status} progress={progress} error={error} onRetry={retry} /></main>

  return (
    <main ref={readerRef} data-reader-immersive={immersive || undefined}>
      <TopNav {...navProps} actions={<div className="score-reader-actions">
        <div className="score-reader-tools" role="group" aria-label="乐谱操作">
          <button
            type="button"
            className="action-button"
            aria-label="打印"
            title="打印"
            onClick={() => exportDialogRef.current?.open()}
          >
            <NavActionContent action="print" />
          </button>
          <Link className="action-button" aria-label="编辑" title="编辑" to={collection === 'works' ? `/works/${slug}/edit` : `/editor/${slug}`}>
            <NavActionContent action="edit" />
          </Link>
        </div>
      </div>} />
      <section className="score-reader" aria-label={`${result.title || score?.title || 'Shared'} 乐谱`}>
        <ScoreRenderer
          immersive={immersive}
          onImmersiveChange={() => {
            const paper = readerRef.current?.querySelector('.score-paper')
            const anchor = [...paper?.querySelectorAll('g.measure') ?? []].find(element => element.getBoundingClientRect().bottom > 100)
            const top = anchor?.getBoundingClientRect().top
            setImmersive(value => !value)
            requestAnimationFrame(() => requestAnimationFrame(() => {
              if (anchor && top !== undefined) window.scrollBy({ top: anchor.getBoundingClientRect().top - top, behavior: 'instant' })
            }))
          }}
          fitPagedToViewport
          scoreId={collection === 'works' ? `works:${slug}` : slug}
          scoreDocument={analysis.score}

          sourceMap={result.sourceMap}
          invalidMeasureIds={invalidMeasures}
          onDisplaySettingsChange={setDisplaySettings}
        />
        <ScoreExportDialog
          ref={exportDialogRef}
          scoreDocument={analysis.score}
          title={result.title}
          scoreUrl={`https://score.cheesefans.com${basePath}/${encodeURIComponent(slug ?? '')}`}
          settings={displaySettings ?? { width: 720, paged: readRenderMode() === 'paged' }}
          onError={setExportError}
        />
        {exportError && <p className="render-message" role="alert">{exportError}</p>}
        {result.diagnostics.length > 0 && (
          <ul className="diagnostics score-reader-diagnostics" aria-label="乐谱校验错误">
            {result.diagnostics.map((item) => <li key={`${item.code}:${item.message}`}>{formatScoreDiagnostic(item)}</li>)}
          </ul>
        )}
      </section>
    </main>
  )
}
