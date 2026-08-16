import { useCallback, useEffect, useRef, useState } from 'react'
import type { MeiSourceMapRange, ScoreDocument, ScoreHeaderMetadata } from '@m3n/notation'
import {
  DEFAULT_PLAYBACK_SPEED,
  DEFAULT_SCORE_WIDTH,
  METRONOME_ENABLED_KEY,
  PLAYBACK_SPEED_KEY,
  PLAYBACK_SPEED_MAX,
  PLAYBACK_SPEED_MIN,
  PLAYBACK_SPEED_STEP,
  readRenderMode,
  readNumberedNotation,
  writeRenderMode,
  writeNumberedNotation,
  type RenderMode,
  SCORE_WIDTH_KEY,
  SCORE_WIDTH_MAX,
  SCORE_WIDTH_MIN,
  SCORE_WIDTH_STEP,
  readRendererSetting,
  writeRendererSetting,
} from '../lib/renderer-settings'
import {
  addScoreHeaderToPaper,
  lyricVerseIndexForMeasureRendition,
  resolveLyricCollisions,
  scorePlaybackCoordinator,
  scoreRenderScheduler,
  a4SourcePageHeight,
  avoidLabelCollisions,
  scoreHeaderHeight,
  wrapScorePagesIntoSheets,
  visibleLyricVerseNumbers,
  type PlaybackLease,
  type SpessaPlayer,
  type VerovioScore,
} from '@m3n/score-renderer'

type ScoreRendererProps = {
  mei: string
  headerMetadata: ScoreHeaderMetadata[]
  sourceMap: MeiSourceMapRange[]
  scoreDocument?: ScoreDocument
  compact?: boolean
  numberedNotation?: boolean
  activeXmlId?: string | null
  invalidMeasureIds?: string[]
  onActiveXmlId?: (xmlId: string | null) => void
  onLayoutWidthChange?: (width: number) => void
  onNoteClick?: (xmlId: string) => void
  onNumberedNotationChange?: (enabled: boolean) => void
  onPaperBlur?: () => void
}

type RenderPhase = 'loading-library' | 'waiting-layout' | 'layout'

const EMPTY_INVALID_MEASURE_IDS: string[] = []
function queryScoreElement(paper: HTMLElement | null, xmlId: string) {
  return paper?.querySelector(`#${xmlId}`) ?? paper?.querySelector(`[data-m3n-id="${xmlId}"]`) ?? null
}

function queryPlaybackElements(paper: HTMLElement | null, xmlId: string, rendition: number): Element[] {
  if (!paper) return []
  const grouped = [...paper.querySelectorAll(`[data-m3n-id="${xmlId}"]`)]
  if (grouped.length === 0) return [paper.querySelector(`#${xmlId}`)].filter(Boolean) as Element[]
  const lyricRenditions = [...new Set(grouped
    .map((element) => Number(element.getAttribute('data-m3n-rendition')))
    .filter(Number.isInteger))]
    .sort((left, right) => left - right)
  if (lyricRenditions.length === 0) return grouped
  const activeRendition = lyricRenditions[(Math.max(1, rendition) - 1) % lyricRenditions.length]
  return grouped.filter((element) => {
    const lyricRendition = element.getAttribute('data-m3n-rendition')
    return lyricRendition === null || Number(lyricRendition) === activeRendition
  })
}

function addMeasureHighlight(measure: SVGGElement, className: string) {
  if (measure.querySelector(`:scope > .${className}`)) return
  const system = measure.closest<SVGGElement>('g.system')
  const measureBounds = measure.getBBox()
  const systemBounds = system?.getBBox() ?? measureBounds
  const numberedNotation = measure.closest<HTMLElement>('.score-paper')?.dataset.notation === 'numbered'
  const numberedMeasureStart = Number(measure.dataset.m3nMeasureStart)
  const numberedMeasureEnd = Number(measure.dataset.m3nMeasureEnd)
  // Numbered notation records the logical barline-to-barline measure bounds.
  // The visible group starts at its first glyph, which omits leading whitespace.
  const left = numberedNotation && Number.isFinite(numberedMeasureStart)
    ? numberedMeasureStart
    : measureBounds.x
  const right = numberedNotation && Number.isFinite(numberedMeasureEnd)
    ? numberedMeasureEnd
    : measureBounds.x + measureBounds.width
  const band = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  band.classList.add(className)
  band.setAttribute('x', String(left))
  band.setAttribute('y', String(systemBounds.y))
  band.setAttribute('width', String(Math.max(0, right - left)))
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

function musicFontCss(svg: string) {
  return /@font-face\s*\{[\s\S]*?\}/.exec(svg)?.[0]
}

export function ScoreRenderer({
  mei,
  headerMetadata,
  sourceMap,
  scoreDocument,
  compact = false,
  numberedNotation: numberedNotationOverride,
  activeXmlId,
  invalidMeasureIds = EMPTY_INVALID_MEASURE_IDS,
  onActiveXmlId,
  onLayoutWidthChange,
  onNoteClick,
  onNumberedNotationChange,
  onPaperBlur,
}: ScoreRendererProps) {
  const paperRef = useRef<HTMLDivElement>(null)
  const scoreRef = useRef<VerovioScore | null>(null)
  const playerRef = useRef<SpessaPlayer | null>(null)
  const settingsDialogRef = useRef<HTMLDialogElement>(null)
  const playerInitializationRef = useRef<Promise<SpessaPlayer> | null>(null)
  const stopPlaybackRef = useRef<() => void>(() => undefined)
  const playbackLeaseRef = useRef<PlaybackLease>({ stop: () => stopPlaybackRef.current() })
  const midiRef = useRef<ArrayBuffer | null>(null)
  const isSeekingRef = useRef(false)
  const pendingSeekProgressRef = useRef(0)
  const highlightedElementsRef = useRef<Element[]>([])
  const highlightedMeasuresRef = useRef<SVGGElement[]>([])
  const hasRenderedRef = useRef(false)
  const [message, setMessage] = useState('')
  const [playbackProgress, setPlaybackProgress] = useState(0)
  const [layoutWidth, setLayoutWidth] = useState(() => (
    compact ? 640 : readRendererSetting(SCORE_WIDTH_KEY, DEFAULT_SCORE_WIDTH, SCORE_WIDTH_MIN, SCORE_WIDTH_MAX)
  ))
  const [playbackSpeed, setPlaybackSpeed] = useState(() => (
    compact ? DEFAULT_PLAYBACK_SPEED : readRendererSetting(
      PLAYBACK_SPEED_KEY,
      DEFAULT_PLAYBACK_SPEED,
      PLAYBACK_SPEED_MIN,
      PLAYBACK_SPEED_MAX,
    )
  ))
  const [metronomeEnabled, setMetronomeEnabled] = useState(() => (
    !compact && readRendererSetting(METRONOME_ENABLED_KEY, 0, 0, 1) === 1
  ))
  const [renderMode, setRenderMode] = useState<RenderMode>(compact ? 'continuous' : readRenderMode())
  const [storedNumberedNotation, setStoredNumberedNotation] = useState(() => !compact && readNumberedNotation())
  const numberedNotation = numberedNotationOverride ?? storedNumberedNotation
  const speedRef = useRef(playbackSpeed)
  const [staffWidth, setStaffWidth] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPlayerLoading, setIsPlayerLoading] = useState(false)
  const [hasAudioControls, setHasAudioControls] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [renderPhase, setRenderPhase] = useState<RenderPhase | null>(null)
  const [selectedXmlId, setSelectedXmlId] = useState<string | null>(null)
  const renderWidth = compact ? Math.max(SCORE_WIDTH_MIN, staffWidth || layoutWidth) : layoutWidth

  useEffect(() => {
    if (!compact) return
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
  }, [compact])

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

    void (async () => {
      try {
        const [{ VerovioScore }, { NumberedNotationScore }] = await Promise.all([
          import('@m3n/score-renderer'),
          import('@m3n/numbered-notation'),
        ])
        const score = await VerovioScore.create(mei)
        if (cancelled) {
          score.destroy()
          return
        }
        scoreRef.current = score
        if (isInitialRender) setRenderPhase('waiting-layout')

        if (numberedNotation && scoreDocument) {
          score.prepareLayout({ width: renderWidth, scale: compact ? 38 : 42 })
          paper.innerHTML = NumberedNotationScore.create(scoreDocument).render({
            paged: renderMode === 'paged',
            width: renderWidth,
            musicFontCss: musicFontCss(score.renderPage(1)),
          }).join('')
          if (renderMode === 'paged') wrapScorePagesIntoSheets(paper, 'score-page-sheet')
          hasRenderedRef.current = true
          setHasAudioControls(true)
          return
        }

        await scoreRenderScheduler.enqueue(() => {
          if (cancelled) return Promise.resolve()
          if (isInitialRender) setRenderPhase('layout')
          const width = renderWidth
          const pageCount = score.prepareLayout({
            width,
            pageHeight: renderMode === 'paged'
              ? Math.max(1, a4SourcePageHeight(width) - scoreHeaderHeight(headerMetadata))
              : undefined,
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
                  if (renderMode === 'paged') wrapScorePagesIntoSheets(paper, 'score-page-sheet')
                  avoidLabelCollisions(paper)
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
      } catch (error: unknown) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'MEI 乐谱渲染失败。')
      } finally {
        if (!cancelled) {
          setIsRendering(false)
          setRenderPhase(null)
        }
      }
    })()

      return () => {
      cancelled = true
      scorePlaybackCoordinator.release(playbackLease)
      playerRef.current?.destroy()
      playerRef.current = null
      scoreRef.current?.destroy()
      scoreRef.current = null
    }
  }, [compact, headerMetadata, invalidMeasureIds, mei, numberedNotation, onActiveXmlId, renderMode, renderWidth, scoreDocument])

  useEffect(() => {
    const paper = paperRef.current
    paper?.querySelectorAll('.is-cursor-active').forEach((element) => {
      element.classList.remove('is-cursor-active')
    })
    paper?.querySelectorAll('.is-cursor-active-measure').forEach((measure) => {
      measure.classList.remove('is-cursor-active-measure')
    })
    const xmlId = activeXmlId ?? selectedXmlId
    const element = xmlId ? queryScoreElement(paper, xmlId) : null
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
    const elements = timedElements.flatMap(({ xmlId, rendition }) => queryPlaybackElements(paperRef.current, xmlId, rendition).flatMap((note) => {
      const verses = [...note.children].filter((element): element is SVGGElement => element.classList.contains('verse'))
      if (note.children.length === 0) return [note]
      const measure = note.closest<SVGGElement>('g.measure')
      const visibleVerseNumbers = visibleLyricVerseNumbers(measure?.querySelectorAll<SVGGElement>('g.verse') ?? [])
      const activeVerse = verses[lyricVerseIndexForMeasureRendition(verses, rendition, visibleVerseNumbers)]
      return [...note.children].filter((element) => !element.classList.contains('verse') || element === activeVerse)
    }))
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
        player.setMetronomeEnabled(metronomeEnabled)
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

  const changeLayoutWidth = (value: number) => {
    const width = Math.max(SCORE_WIDTH_MIN, Math.min(SCORE_WIDTH_MAX, value))
    setLayoutWidth(width)
    if (!compact) writeRendererSetting(SCORE_WIDTH_KEY, width)
    onLayoutWidthChange?.(width)
  }

  const changePlaybackSpeed = (value: number) => {
    const speed = Math.max(PLAYBACK_SPEED_MIN, Math.min(PLAYBACK_SPEED_MAX, value))
    speedRef.current = speed
    setPlaybackSpeed(speed)
    if (!compact) writeRendererSetting(PLAYBACK_SPEED_KEY, speed)
    playerRef.current?.setSpeed(speed)
  }

  const changeMetronomeEnabled = (enabled: boolean) => {
    setMetronomeEnabled(enabled)
    if (!compact) writeRendererSetting(METRONOME_ENABLED_KEY, enabled ? 1 : 0)
    playerRef.current?.setMetronomeEnabled(enabled)
  }

  const changeRenderMode = (mode: RenderMode) => {
    setRenderMode(mode)
    if (!compact) writeRenderMode(mode)
  }

  const changeNumberedNotation = (enabled: boolean) => {
    if (numberedNotationOverride !== undefined) {
      onNumberedNotationChange?.(enabled)
      return
    }
    setStoredNumberedNotation(enabled)
    if (!compact) writeNumberedNotation(enabled)
  }

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
          <label className="playback-metronome">
            <span>节拍器</span>
            <span className="switch-control">
              <input
                type="checkbox"
                role="switch"
                aria-label="节拍器"
                checked={metronomeEnabled}
                onChange={(event) => changeMetronomeEnabled(event.currentTarget.checked)}
              />
              <span className="switch-track" aria-hidden="true">
                <span className="switch-thumb" />
              </span>
            </span>
          </label>
        )}
        {hasAudioControls && (
          <div className="playback-speed">
            <span>速度</span>
            <input
              type="range"
              min={PLAYBACK_SPEED_MIN}
              max={PLAYBACK_SPEED_MAX}
              step={PLAYBACK_SPEED_STEP}
              value={playbackSpeed}
              aria-label="播放速度"
              onChange={(event) => changePlaybackSpeed(Number(event.currentTarget.value))}
            />
            <output>{playbackSpeed}%</output>
          </div>
        )}
        {hasAudioControls && (
          <div className="playback-progress">
            <span>进度</span>
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
        {!compact && hasAudioControls && (
          <label className="notation-toggle">
            <span>简谱</span>
            <span className="switch-control">
              <input
                type="checkbox"
                role="switch"
                aria-label="简谱渲染"
                checked={numberedNotation}
                disabled={!scoreDocument}
                onChange={(event) => changeNumberedNotation(event.currentTarget.checked)}
              />
              <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
            </span>
          </label>
        )}
        {!compact && hasAudioControls && (
          <button
            type="button"
            className="settings-toggle"
            aria-label="渲染设置"
            title="渲染设置"
            onClick={() => settingsDialogRef.current?.showModal()}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
        )}
      </div>
      {!compact && (
        <dialog ref={settingsDialogRef} className="renderer-settings-dialog" aria-labelledby="renderer-settings-title">
          <div className="renderer-settings-header">
            <h2 id="renderer-settings-title">渲染设置</h2>
            <button type="button" className="action-button" onClick={() => settingsDialogRef.current?.close()}>关闭</button>
          </div>
          <div className="renderer-settings-body">
            <div className="renderer-settings-row">
              <span>乐谱宽度</span>
              <input
                type="range"
                min={SCORE_WIDTH_MIN}
                max={SCORE_WIDTH_MAX}
                step={SCORE_WIDTH_STEP}
                value={layoutWidth}
                aria-label="乐谱宽度"
                onChange={(event) => changeLayoutWidth(Number(event.currentTarget.value))}
              />
              <output>{layoutWidth}px</output>
            </div>
            <label className="renderer-settings-switch">
              <span>分页</span>
              <span className="switch-control">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="分页"
                  checked={renderMode === 'paged'}
                  onChange={(event) => changeRenderMode(event.currentTarget.checked ? 'paged' : 'continuous')}
                />
                <span className="switch-track" aria-hidden="true">
                  <span className="switch-thumb" />
                </span>
              </span>
            </label>
          </div>
        </dialog>
      )}
      <div
        ref={paperRef}
        className="score-paper verovio-score"
        data-render-phase={renderPhase ?? undefined}
        data-render-mode={renderMode}
        data-notation={numberedNotation ? 'numbered' : 'staff'}
        aria-busy={isRendering || undefined}
        tabIndex={0}
        onClick={(event) => {
          const element = (event.target as Element).closest('[id^="m3n-e-"], [data-m3n-id^="m3n-e-"]')
          const xmlId = element?.getAttribute('id') ?? element?.getAttribute('data-m3n-id')
          if (!xmlId) return
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
