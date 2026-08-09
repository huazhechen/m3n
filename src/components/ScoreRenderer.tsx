import { useCallback, useEffect, useRef, useState } from 'react'
import type { MeiSourceMapRange, ScoreHeaderMetadata } from '@m3n/notation'
import {
  addScoreHeaderToPaper,
  lyricVerseIndexForMeasureRendition,
  resolveLyricCollisions,
  scorePlaybackCoordinator,
  scoreRenderScheduler,
  visibleLyricVerseNumbers,
  type PlaybackLease,
  type SpessaPlayer,
  type VerovioScore,
} from '@m3n/score-renderer'

type ScoreRendererProps = {
  mei: string
  headerMetadata: ScoreHeaderMetadata[]
  sourceMap: MeiSourceMapRange[]
  layoutWidth?: number
  compact?: boolean
  activeXmlId?: string | null
  invalidMeasureIds?: string[]
  onActiveXmlId?: (xmlId: string | null) => void
  onNoteClick?: (xmlId: string) => void
  onPaperBlur?: () => void
}

type RenderPhase = 'loading-library' | 'waiting-layout' | 'layout'

const EMPTY_INVALID_MEASURE_IDS: string[] = []

function addMeasureHighlight(measure: SVGGElement, className: string) {
  if (measure.querySelector(`:scope > .${className}`)) return
  const system = measure.closest<SVGGElement>('g.system')
  const measureBounds = measure.getBBox()
  const systemBounds = system?.getBBox() ?? measureBounds
  const band = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  band.classList.add(className)
  band.setAttribute('x', String(measureBounds.x))
  band.setAttribute('y', String(systemBounds.y))
  band.setAttribute('width', String(measureBounds.width))
  band.setAttribute('height', String(systemBounds.height))
  measure.insertBefore(band, measure.firstChild)
}

function addInvalidMeasureHighlights(paper: HTMLElement, invalidMeasureIds: readonly string[]) {
  const invalidIds = new Set(invalidMeasureIds)
  paper.querySelectorAll<SVGGElement>('g.measure[id]').forEach((measure) => {
    if (!invalidIds.has(measure.id)) return
    addMeasureHighlight(measure, 'measure-error-highlight')
  })
}

export function ScoreRenderer({
  mei,
  headerMetadata,
  sourceMap,
  layoutWidth,
  compact = false,
  activeXmlId,
  invalidMeasureIds = EMPTY_INVALID_MEASURE_IDS,
  onActiveXmlId,
  onNoteClick,
  onPaperBlur,
}: ScoreRendererProps) {
  const paperRef = useRef<HTMLDivElement>(null)
  const scoreRef = useRef<VerovioScore | null>(null)
  const playerRef = useRef<SpessaPlayer | null>(null)
  const playerInitializationRef = useRef<Promise<SpessaPlayer> | null>(null)
  const stopPlaybackRef = useRef<() => void>(() => undefined)
  const playbackLeaseRef = useRef<PlaybackLease>({ stop: () => stopPlaybackRef.current() })
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
  const renderWidth = layoutWidth ?? staffWidth

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
    if (!paper || renderWidth === 0) return
    const playbackLease = playbackLeaseRef.current
    let cancelled = false
    const isInitialRender = !hasRenderedRef.current
    if (isInitialRender) paper.innerHTML = ''
    scorePlaybackCoordinator.release(playbackLease)
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

    void import('@m3n/score-renderer')
      .then(({ VerovioScore }) => VerovioScore.create(mei))
      .then((score) => {
        if (cancelled) {
          score.destroy()
          return
        }
        scoreRef.current = score
        if (isInitialRender) setRenderPhase('waiting-layout')

        return scoreRenderScheduler.enqueue(() => {
          if (cancelled) return Promise.resolve()
          if (isInitialRender) setRenderPhase('layout')
          const pageCount = score.prepareLayout({
            width: Math.max(320, renderWidth),
            scale: compact ? 38 : 42,
          })

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
                  addScoreHeaderToPaper(paper, headerMetadata)
                  resolveLyricCollisions(paper)
                  addInvalidMeasureHighlights(paper, invalidMeasureIds)
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
      scorePlaybackCoordinator.release(playbackLease)
      playerRef.current?.destroy()
      playerRef.current = null
      scoreRef.current?.destroy()
      scoreRef.current = null
    }
  }, [compact, headerMetadata, invalidMeasureIds, mei, onActiveXmlId, renderWidth])

  useEffect(() => {
    const paper = paperRef.current
    paper?.querySelectorAll('.is-cursor-active').forEach((element) => {
      element.classList.remove('is-cursor-active')
    })
    paper?.querySelectorAll('.is-cursor-active-measure').forEach((measure) => {
      measure.classList.remove('is-cursor-active-measure')
    })
    const xmlId = activeXmlId ?? selectedXmlId
    const element = xmlId ? paper?.querySelector(`#${xmlId}`) : null
    if (element) {
      element.classList.add('is-cursor-active')
      const measure = element.closest<SVGGElement>('g.measure')
      if (measure) {
        addMeasureHighlight(measure, 'measure-cursor-highlight')
        measure.classList.add('is-cursor-active-measure')
      }
    }
  }, [activeXmlId, isRendering, mei, selectedXmlId])

  const clearPlaybackHighlight = () => {
    highlightedElementsRef.current.forEach((element) => element.classList.remove('is-playing'))
    highlightedElementsRef.current = []
    highlightedMeasuresRef.current.forEach((measure) => measure.classList.remove('is-playing-measure'))
    highlightedMeasuresRef.current = []
    onActiveXmlId?.(null)
  }

  const highlightMeasure = (measure: SVGGElement) => {
    addMeasureHighlight(measure, 'measure-playback-highlight')
    measure.classList.add('is-playing-measure')
  }

  stopPlaybackRef.current = () => {
    playerRef.current?.pause()
    setIsPlaying(false)
    clearPlaybackHighlight()
    scorePlaybackCoordinator.release(playbackLeaseRef.current)
  }

  const updatePlaybackHighlight = (seconds: number, duration: number, syncProgress = true) => {
    const progress = duration > 0 ? Math.max(0, Math.min(1, seconds / duration)) : 0
    if (syncProgress) setPlaybackProgress(progress)
    const timedElements = scoreRef.current?.elementsAtTime(seconds * 1000) ?? []
    const elements = timedElements.flatMap(({ xmlId, rendition }) => {
      const note = paperRef.current?.querySelector<SVGGElement>(`#${xmlId}`)
      if (!note) return []
      const verses = [...note.children].filter((element): element is SVGGElement => element.classList.contains('verse'))
      const measure = note.closest<SVGGElement>('g.measure')
      const visibleVerseNumbers = visibleLyricVerseNumbers(measure?.querySelectorAll<SVGGElement>('g.verse') ?? [])
      const activeVerse = verses[lyricVerseIndexForMeasureRendition(verses, rendition, visibleVerseNumbers)]
      return [...note.children].filter((element) => !element.classList.contains('verse') || element === activeVerse)
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

  const onPlayerTime = (seconds: number, duration: number) => {
    if (!isSeekingRef.current) updatePlaybackHighlight(seconds, duration)
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
        const { SpessaPlayer } = await import('@m3n/score-renderer')
        const player = await SpessaPlayer.create(midiRef.current, {
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
        scorePlaybackCoordinator.claim(playbackLeaseRef.current)
        await player.play()
        setIsPlaying(true)
      } else {
        stopPlaybackRef.current()
      }
    } catch (error) {
      scorePlaybackCoordinator.release(playbackLeaseRef.current)
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
      updatePlaybackHighlight(playbackSeconds, player.duration, false)
    }
  }

  const beginSeek = () => {
    if (isSeekingRef.current) return
    isSeekingRef.current = true
    pendingSeekProgressRef.current = playbackProgress
    void getPlayer().then((player) => {
      const progress = pendingSeekProgressRef.current
      const playbackSeconds = progress * player.duration
      updatePlaybackHighlight(playbackSeconds, player.duration, false)
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

  return (
    <section className={compact ? 'score-card compact' : 'score-card'}>
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
      </div>
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
          setSelectedXmlId(xmlId)
          window.requestAnimationFrame(() => onNoteClick?.(xmlId))
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) onPaperBlur?.()
        }}
      />
      {message && <p className="render-message">{message}</p>}
    </section>
  )
}
