import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { MeiSourceMapRange } from '../lib/m3n-mei'
import type { ScoreHeaderMetadata } from '../lib/m3n-mei'
import type { AccompanimentNote } from '../lib/m3n-playback'
import type { TempoChange } from '../lib/m3n-playback'
import type { SpessaPlayer } from '../features/score-renderer/spessa-player'
import type { VerovioScore } from '../features/score-renderer/verovio-score'
import { ScoreExportDialog } from './ScoreExportDialog'
import type { ScoreExportDialogRef } from './ScoreExportDialog'

type ScoreRendererProps = {
  mei: string
  title: string
  hasBassStaff: boolean
  headerMetadata: ScoreHeaderMetadata[]
  sourceMap: MeiSourceMapRange[]
  accompaniment: AccompanimentNote[]
  tempoChanges: TempoChange[]
  tempo: number
  compact?: boolean
  activeXmlId?: string | null
  onActiveXmlId?: (xmlId: string | null) => void
  onNoteClick?: (xmlId: string) => void
  onPaperBlur?: () => void
  showPrintButton?: boolean
  onPrintClick?: () => void
}

type RenderPhase = 'loading-library' | 'waiting-layout' | 'layout'

export interface ScoreRendererRef {
  openExport: () => void
}

let scoreRenderQueue = Promise.resolve()
type PlaybackStopper = { current: () => void }
let activePlayback: PlaybackStopper | null = null

function claimPlayback(stopper: PlaybackStopper) {
  if (activePlayback && activePlayback !== stopper) activePlayback.current()
  activePlayback = stopper
}

function releasePlayback(stopper: PlaybackStopper) {
  if (activePlayback === stopper) activePlayback = null
}

function enqueueScoreRender(task: () => Promise<void>) {
  const queued = scoreRenderQueue.then(async () => {
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    return task()
  })
  scoreRenderQueue = queued.catch(() => undefined)
  return queued
}

function translateVertically(element: SVGElement, offset: number) {
  if (offset <= 0) return
  const transform = element.getAttribute('transform')
  element.setAttribute('transform', `${transform ? `${transform} ` : ''}translate(0 ${offset})`)
}

function resolveLyricCollisions(paper: HTMLElement) {
  for (const page of paper.querySelectorAll<SVGSVGElement>(':scope > svg:not([data-m3n-lyric-adjusted])')) {
    const engraving = page.querySelector<SVGSVGElement>(':scope > svg.definition-scale')
    if (!engraving) continue
    const systems = [...engraving.querySelectorAll<SVGGElement>(':scope > g.page-margin > g.system')]
    let downstreamOffset = 0

    for (const [index, system] of systems.entries()) {
      translateVertically(system, downstreamOffset)
      const verses = [...system.querySelectorAll<SVGGElement>('g.verse')]
      const obstacles = systems.slice(index).flatMap((item) =>
        [...item.querySelectorAll<SVGGraphicsElement>('.notehead, .stem, .flag, .beam')])
      const lyrics = verses.map((verse) => verse.getBBox())
      let lyricOffset = 0

      for (const lyric of lyrics) {
        for (const obstacle of obstacles) {
          const bounds = obstacle.getBBox()
          const overlapsHorizontally = lyric.x < bounds.x + bounds.width && lyric.x + lyric.width > bounds.x
          const overlapsVertically = lyric.y < bounds.y + bounds.height && lyric.y + lyric.height > bounds.y
          if (overlapsHorizontally && overlapsVertically) {
            lyricOffset = Math.max(lyricOffset, bounds.y + bounds.height - lyric.y + 80)
          }
        }
      }

      verses.forEach((verse) => translateVertically(verse, lyricOffset))
      const nextSystem = systems[index + 1]
      if (!nextSystem || lyricOffset === 0 || lyrics.length === 0) continue

      const lyricBottom = Math.max(...lyrics.map((lyric) => lyric.y + lyric.height + lyricOffset))
      const nextTop = nextSystem.getBBox().y
      downstreamOffset += Math.max(0, lyricBottom + 80 - nextTop)
    }

    if (downstreamOffset > 0) {
      const pageViewBox = page.viewBox.baseVal
      const engravingViewBox = engraving.viewBox.baseVal
      const scale = engravingViewBox.height > 0 ? pageViewBox.height / engravingViewBox.height : 1
      page.setAttribute('viewBox', `${pageViewBox.x} ${pageViewBox.y} ${pageViewBox.width} ${pageViewBox.height + downstreamOffset * scale}`)
    }
    page.dataset.m3nLyricAdjusted = 'true'
  }
}

export const ScoreRenderer = forwardRef<ScoreRendererRef, ScoreRendererProps>(function ScoreRenderer({
  mei,
  title,
  hasBassStaff,
  headerMetadata,
  sourceMap,
  accompaniment,
  tempoChanges,
  tempo,
  compact = false,
  activeXmlId,
  onActiveXmlId,
  onNoteClick,
  onPaperBlur,
  showPrintButton = true,
  onPrintClick,
}, ref) {
  const paperRef = useRef<HTMLDivElement>(null)
  const exportDialogRef = useRef<ScoreExportDialogRef>(null)
  const scoreRef = useRef<VerovioScore | null>(null)
  const playerRef = useRef<SpessaPlayer | null>(null)
  const playerInitializationRef = useRef<Promise<SpessaPlayer> | null>(null)
  const stopPlaybackRef = useRef<() => void>(() => undefined)
  const midiRef = useRef<ArrayBuffer | null>(null)
  const speedRef = useRef(100)
  const isSeekingRef = useRef(false)
  const pendingSeekProgressRef = useRef(0)
  const highlightedElementsRef = useRef<Element[]>([])
  const highlightedMeasuresRef = useRef<SVGGElement[]>([])
  const hasRenderedRef = useRef(false)
  const [staffWidth, setStaffWidth] = useState(0)
  const [message, setMessage] = useState('')
  const [playbackProgress, setPlaybackProgress] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(100)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPlayerLoading, setIsPlayerLoading] = useState(false)
  const [hasAudioControls, setHasAudioControls] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [renderPhase, setRenderPhase] = useState<RenderPhase | null>(null)
  const [selectedXmlId, setSelectedXmlId] = useState<string | null>(null)

  useImperativeHandle(ref, () => ({
    openExport: () => exportDialogRef.current?.open(),
  }), [])

  useEffect(() => {
    const paper = paperRef.current
    if (!paper) return
    const updateWidth = () => {
      const width = Math.floor(paper.clientWidth)
      setStaffWidth((current) => current === width ? current : width)
    }
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(paper)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const paper = paperRef.current
    if (!paper || staffWidth === 0) return
    let cancelled = false
    const isInitialRender = !hasRenderedRef.current
    if (isInitialRender) paper.innerHTML = ''
    releasePlayback(stopPlaybackRef)
    playerRef.current?.destroy()
    playerRef.current = null
    scoreRef.current?.destroy()
    scoreRef.current = null
    midiRef.current = null
    highlightedElementsRef.current = []
    highlightedMeasuresRef.current = []
    setMessage('')
    setPlaybackProgress(0)
    setIsPlaying(false)
    setHasAudioControls(false)
    setIsRendering(true)
    setRenderPhase(isInitialRender ? 'loading-library' : null)
    setSelectedXmlId(null)
    onActiveXmlId?.(null)

    void import('../features/score-renderer/verovio-score')
      .then(({ VerovioScore }) => VerovioScore.create(mei))
      .then((score) => {
        if (cancelled) {
          score.destroy()
          return
        }
        scoreRef.current = score
        if (isInitialRender) setRenderPhase('waiting-layout')

        return enqueueScoreRender(() => {
          if (cancelled) return Promise.resolve()
          if (isInitialRender) setRenderPhase('layout')
          const pageCount = score.prepareLayout({ width: Math.max(320, staffWidth), scale: compact ? 38 : 42 })

          return new Promise<void>((resolve, reject) => {
            let page = 1
            const pages: string[] = []
            const renderNextPage = () => {
              if (cancelled) {
                resolve()
                return
              }
              try {
                const svg = score.renderPage(page)
                if (isInitialRender) paper.insertAdjacentHTML('beforeend', svg)
                else pages.push(svg)
                page += 1
                if (page > pageCount) {
                  if (!isInitialRender) paper.innerHTML = pages.join('')
                  resolveLyricCollisions(paper)
                  hasRenderedRef.current = true
                  setHasAudioControls(true)
                  resolve()
                  return
                }
                window.requestAnimationFrame(renderNextPage)
              } catch (error) {
                reject(error)
              }
            }
            window.requestAnimationFrame(renderNextPage)
          })
        })
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'MEI 乐谱渲染失败。')
      })
      .finally(() => {
        if (!cancelled) {
          setIsRendering(false)
          setRenderPhase(null)
        }
      })

    return () => {
      cancelled = true
      releasePlayback(stopPlaybackRef)
      playerRef.current?.destroy()
      playerRef.current = null
      scoreRef.current?.destroy()
      scoreRef.current = null
    }
  }, [compact, mei, onActiveXmlId, staffWidth])

  useEffect(() => {
    paperRef.current?.querySelectorAll('.is-cursor-active').forEach((element) => {
      element.classList.remove('is-cursor-active')
    })
    const xmlId = activeXmlId ?? selectedXmlId
    if (xmlId) paperRef.current?.querySelector(`#${xmlId}`)?.classList.add('is-cursor-active')
  }, [activeXmlId, mei, selectedXmlId])

  const clearPlaybackHighlight = () => {
    highlightedElementsRef.current.forEach((element) => element.classList.remove('is-playing'))
    highlightedElementsRef.current = []
    highlightedMeasuresRef.current.forEach((measure) => measure.classList.remove('is-playing-measure'))
    highlightedMeasuresRef.current = []
    onActiveXmlId?.(null)
  }

  const highlightMeasure = (measure: SVGGElement) => {
    if (!measure.querySelector(':scope > .measure-playback-highlight')) {
      const system = measure.closest<SVGGElement>('g.system')
      const measureBounds = measure.getBBox()
      const systemBounds = system?.getBBox() ?? measureBounds
      const band = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      band.classList.add('measure-playback-highlight')
      band.setAttribute('x', String(measureBounds.x))
      band.setAttribute('y', String(systemBounds.y))
      band.setAttribute('width', String(measureBounds.width))
      band.setAttribute('height', String(systemBounds.height))
      measure.insertBefore(band, measure.firstChild)
    }
    measure.classList.add('is-playing-measure')
  }

  stopPlaybackRef.current = () => {
    playerRef.current?.pause()
    setIsPlaying(false)
    clearPlaybackHighlight()
    releasePlayback(stopPlaybackRef)
  }

  const updatePlaybackHighlight = (seconds: number, duration: number, scoreSeconds = seconds, syncProgress = true) => {
    const progress = duration > 0 ? Math.max(0, Math.min(1, seconds / duration)) : 0
    if (syncProgress) setPlaybackProgress(progress)
    const timedElements = scoreRef.current?.elementsAtTime(scoreSeconds * 1000) ?? []
    const elements = timedElements.flatMap(({ xmlId, rendition }) => {
      const note = paperRef.current?.querySelector<SVGGElement>(`#${xmlId}`)
      if (!note) return []
      const verses = [...note.querySelectorAll<SVGGElement>(':scope > g.verse')]
      return [...note.children].filter((element) => !element.classList.contains('verse') || element === verses[rendition - 1])
    })
    highlightedElementsRef.current.forEach((element) => element.classList.remove('is-playing'))
    elements.forEach((element) => element.classList.add('is-playing'))
    highlightedElementsRef.current = elements
    const measures = [...new Set(elements.map((element) => element.closest<SVGGElement>('g.measure')).filter((measure): measure is SVGGElement => Boolean(measure)))]
    highlightedMeasuresRef.current.forEach((measure) => {
      if (!measures.includes(measure)) measure.classList.remove('is-playing-measure')
    })
    measures.forEach(highlightMeasure)
    highlightedMeasuresRef.current = measures
    onActiveXmlId?.(timedElements.map((element) => element.xmlId).find((id) => sourceMap.some((range) => range.xmlId === id)) ?? null)
  }

  const onPlayerTime = (seconds: number, duration: number, scoreSeconds: number) => {
    if (!isSeekingRef.current) updatePlaybackHighlight(seconds, duration, scoreSeconds)
  }

  const getPlayer = () => {
    if (playerRef.current) return Promise.resolve(playerRef.current)
    if (playerInitializationRef.current) return playerInitializationRef.current
    const score = scoreRef.current
    if (!score) return Promise.reject(new Error('乐谱尚未准备完成。'))
    const initialization = (async () => {
      setIsPlayerLoading(true)
      try {
        midiRef.current ??= score.midi()
        const { SpessaPlayer } = await import('../features/score-renderer/spessa-player')
        const player = await SpessaPlayer.create(midiRef.current, accompaniment, tempo, tempoChanges, {
          onEnded: () => {
            stopPlaybackRef.current()
          },
          onTime: onPlayerTime,
        })
        player.setSpeed(speedRef.current)
        playerRef.current = player
        return player
      } finally {
        setIsPlayerLoading(false)
      }
    })()
    playerInitializationRef.current = initialization
    void initialization.then(
      () => {
        if (playerInitializationRef.current === initialization) playerInitializationRef.current = null
      },
      () => {
        if (playerInitializationRef.current === initialization) playerInitializationRef.current = null
      },
    )
    return initialization
  }

  const togglePlayback = async () => {
    try {
      const player = await getPlayer()
      if (player.paused) {
        claimPlayback(stopPlaybackRef)
        await player.play()
        setIsPlaying(true)
      } else {
        stopPlaybackRef.current()
      }
    } catch (error) {
      releasePlayback(stopPlaybackRef)
      setIsPlaying(false)
      setMessage(error instanceof Error ? error.message : '当前浏览器无法初始化音频。')
    }
  }

  const previewSeek = (progress: number) => {
    pendingSeekProgressRef.current = progress
    setPlaybackProgress(progress)
    const player = playerRef.current
    if (player) {
      const playbackSeconds = progress * player.duration
      updatePlaybackHighlight(playbackSeconds, player.duration, player.sourceTimeAt(playbackSeconds), false)
    }
  }

  const beginSeek = () => {
    if (isSeekingRef.current) return
    isSeekingRef.current = true
    pendingSeekProgressRef.current = playbackProgress
    void getPlayer().then((player) => {
      const progress = pendingSeekProgressRef.current
      const playbackSeconds = progress * player.duration
      updatePlaybackHighlight(playbackSeconds, player.duration, player.sourceTimeAt(playbackSeconds), false)
      if (!isSeekingRef.current) player.seek(progress)
    }).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : '当前浏览器无法初始化音频。')
    })
  }

  const commitSeek = useCallback(() => {
    if (!isSeekingRef.current) return
    const progress = pendingSeekProgressRef.current
    playerRef.current?.seek(progress)
    isSeekingRef.current = false
  }, [])

  useEffect(() => {
    window.addEventListener('pointerup', commitSeek)
    window.addEventListener('pointercancel', commitSeek)
    return () => {
      window.removeEventListener('pointerup', commitSeek)
      window.removeEventListener('pointercancel', commitSeek)
    }
  }, [commitSeek])

  const centeredHeaderItems = headerMetadata.filter((item) => item.side === 'center')
    .sort((left, right) => left.priority - right.priority)
  const leftHeaderItems = headerMetadata.filter((item) => item.side === 'left')
    .sort((left, right) => left.priority - right.priority)
  const rightHeaderItems = headerMetadata.filter((item) => item.side === 'right')
    .sort((left, right) => left.priority - right.priority)

  return (
    <section className={compact ? 'score-card compact' : 'score-card'}>
      {headerMetadata.length > 0 && (
        <header className="score-title-block">
          {centeredHeaderItems.map((item) => item.priority === 0
            ? <h1 key={item.priority}>{item.value}</h1>
            : <p className="score-subtitle" key={item.priority}>{item.value}</p>)}
          {(leftHeaderItems.length > 0 || rightHeaderItems.length > 0) && (
            <div className="score-header-details">
              <div className="score-header-column score-header-column-left">
                {leftHeaderItems.map((item) => <p className="score-header-item" key={item.priority}>{item.value}</p>)}
              </div>
              <div className="score-header-column score-header-column-right">
                {rightHeaderItems.map((item) => <p className="score-header-item" key={item.priority}>{item.value}</p>)}
              </div>
            </div>
          )}
        </header>
      )}
      <div
        ref={paperRef}
        className="score-paper verovio-score"
        data-render-phase={renderPhase ?? undefined}
        aria-busy={isRendering || undefined}
        tabIndex={0}
        onClick={(event) => {
          const element = (event.target as Element).closest('[id^="m3n-e-"]')
          if (!element?.id) return
          const xmlId = element.id
          paperRef.current?.querySelectorAll('.is-cursor-active').forEach((activeElement) => {
            activeElement.classList.remove('is-cursor-active')
          })
          element.classList.add('is-cursor-active')
          setSelectedXmlId(xmlId)
          window.requestAnimationFrame(() => onNoteClick?.(xmlId))
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) onPaperBlur?.()
        }}
      />
      <div className="audio-controls">
        {hasAudioControls && (
          <button
            type="button"
            className="playback-toggle"
            aria-label={isPlaying ? '暂停' : '播放'}
            title={isPlaying ? '暂停' : '播放'}
            disabled={isPlayerLoading}
            onClick={() => void togglePlayback()}
          >
            <span className={isPlaying ? 'playback-icon pause' : 'playback-icon play'} aria-hidden="true" />
          </button>
        )}
        {hasAudioControls && (
          <div className="playback-speed">
            <span>速度</span>
            <input
              type="range"
              min="50"
              max="200"
              step="5"
              value={playbackSpeed}
              aria-label="播放速度"
              onChange={(event) => {
                const value = Number(event.currentTarget.value)
                speedRef.current = value
                setPlaybackSpeed(value)
                playerRef.current?.setSpeed(value)
              }}
            />
            <output>{playbackSpeed}%</output>
          </div>
        )}
        {hasAudioControls && (
          <div className="playback-progress">
            <span>播放进度</span>
            <input
              type="range"
              min="0"
              max="1000"
              value={Math.round(playbackProgress * 1000)}
              aria-label="播放位置"
              onPointerDown={beginSeek}
              onKeyDown={beginSeek}
              onKeyUp={commitSeek}
              onBlur={commitSeek}
              onInput={(event) => previewSeek(Number(event.currentTarget.value) / 1000)}
            />
            <output>{Math.round(playbackProgress * 100)}%</output>
          </div>
        )}
        {showPrintButton && (
          <button type="button" className="action-button" onClick={onPrintClick ?? (() => exportDialogRef.current?.open())}>
            打印
          </button>
        )}
      </div>
      <ScoreExportDialog
        ref={exportDialogRef}
        mei={mei}
        title={title}
        hasBassStaff={hasBassStaff}
        onError={setMessage}
      />
      {message && <p className="render-message">{message}</p>}
    </section>
  )
})
