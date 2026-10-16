import { renderScoreInto, type RenderPhase } from '../lib/render-score'
import type { VerovioScore, SpessaPlayer } from '@m3n/score-renderer'
import { ScoreControls } from './ScoreControls'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MeiSourceMapRange, ScoreDocument, ScoreHeaderMetadata } from '@m3n/notation'
import {
  DEFAULT_PLAYBACK_SPEED,
  DEFAULT_PLAYBACK_TRANSPOSE,
  DEFAULT_SCORE_WIDTH,
  METRONOME_ENABLED_KEY,
  PLAYBACK_SPEED_KEY,
  PLAYBACK_SPEED_MAX,
  PLAYBACK_SPEED_MIN,
  PLAYBACK_TRANSPOSE_MAX,
  PLAYBACK_TRANSPOSE_MIN,
  TRANSPOSE_KEY,
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
  lyricVerseIndexForMeasureRendition,
  scorePlaybackCoordinator,
  visibleLyricVerseNumbers,
  type PlaybackLease,
} from '@m3n/score-renderer/view'

type ScoreRendererProps = {
  mei: string | (() => string)
  headerMetadata: ScoreHeaderMetadata[]
  sourceMap: MeiSourceMapRange[]
  scoreDocument?: ScoreDocument
  compact?: boolean
  isSourceUpdating?: boolean
  numberedNotation?: boolean
  activeXmlId?: string | null
  invalidMeasureIds?: string[]
  onActiveXmlId?: (xmlId: string | null) => void
  onLayoutWidthChange?: (width: number) => void
  onNoteClick?: (xmlId: string) => void
  onNumberedNotationChange?: (enabled: boolean) => void
  onPaperBlur?: () => void
}


const EMPTY_INVALID_MEASURE_IDS: string[] = []
function playbackCountInBeats(scoreDocument: ScoreDocument | undefined) {
  const measure = scoreDocument?.parts.get('score')?.melody[0]
  const event = measure?.events[0]
  const expected = (event?.meterCount ?? scoreDocument?.meterCount ?? 4) * 4 /
    (event?.meterUnit ?? scoreDocument?.meterUnit ?? 4)
  const actual = measure?.multiRest
    ? expected
    : measure?.events.reduce((total, item) => total + item.beats, 0) ?? 0
  if (!Number.isFinite(expected) || expected <= 0) return 0
  // A complete opening measure gets one full bar; a pickup gets only the
  // missing beats needed to complete that first bar.
  return actual > 0 && actual < expected ? expected - actual : expected
}

function queryScoreElement(paper: HTMLElement | null, xmlId: string) {
  return paper?.querySelector(`#${xmlId}`) ?? paper?.querySelector(`[data-m3n-id="${xmlId}"]`) ?? null
}

function queryPlaybackElements(paper: HTMLElement | null, xmlId: string, rendition: number): Element[] {
  if (!paper) return []
  const grouped = [...paper.querySelectorAll(`[data-m3n-id="${xmlId}"]`)]
  if (grouped.length === 0) return [paper.querySelector(`#${xmlId}`)].filter(Boolean) as Element[]
  const hasPasses = grouped.some((element) => element.getAttribute('data-m3n-passes') !== null)
  if (hasPasses) {
    // Numbered notation marks every lyric with the playback passes its
    // measure participates in. Exact pass matches win; when no row belongs
    // to this pass, cycle the visible rows like the staff renderer does for
    // repeated occurrences such as `L3: {L1}`.
    const matching = grouped.filter((element) => {
      const passes = element.getAttribute('data-m3n-passes')
      if (passes === null) return true
      return passes.split('-').map(Number).filter(Number.isInteger).includes(rendition)
    })
    if (matching.some((element) => element.getAttribute('data-m3n-passes') !== null)) return matching
    const visibleRows = [...new Set(grouped
      .filter((element) => (element.textContent ?? '').replaceAll('\u200B', '').trim() !== '')
      .map((element) => Number(element.getAttribute('data-m3n-rendition')))
      .filter(Number.isInteger))]
      .sort((left, right) => left - right)
    if (visibleRows.length > 0) {
      const selected = visibleRows[(Math.max(1, rendition) - 1) % visibleRows.length]
      return grouped.filter((element) => {
        const passes = element.getAttribute('data-m3n-passes')
        if (passes === null) return true
        return Number(element.getAttribute('data-m3n-rendition')) === selected
      })
    }
  }
  const lyricRenditions = [...new Set(grouped
    .map((element) => Number(element.getAttribute('data-m3n-rendition')))
    .filter(Number.isInteger))]
    .sort((left, right) => left - right)
  if (lyricRenditions.length === 0) return grouped
  const hasExactLyricRendition = lyricRenditions.includes(rendition)
  return grouped.filter((element) => {
    const lyricRendition = element.getAttribute('data-m3n-rendition')
    // Verovio's `rendN` is the playback occurrence, not an index into every
    // lyric row visible in the document. Match it directly whenever possible;
    // when a repeated occurrence has no dedicated row, keep its available
    // lyrics visible rather than silently dropping the highlight.
    return lyricRendition === null || !hasExactLyricRendition || Number(lyricRendition) === rendition
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
  // Native numbered bounds remain valid when a measure continues on another system.
  const left = numberedNotation && Number.isFinite(numberedMeasureStart)
    ? numberedMeasureStart - 5
    : measureBounds.x
  const right = numberedNotation && Number.isFinite(numberedMeasureEnd)
    ? numberedMeasureEnd + 5
    : measureBounds.x + measureBounds.width
  const band = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  band.classList.add(className)
  band.setAttribute('x', String(left))
  band.setAttribute('y', String(systemBounds.y))
  band.setAttribute('width', String(Math.max(0, right - left)))
  band.setAttribute('height', String(systemBounds.height))
  if (numberedNotation) measure.appendChild(band)
  else measure.insertBefore(band, measure.firstChild)
}

function addInvalidMeasureHighlights(paper: HTMLElement, invalidMeasureIds: readonly string[]) {
  const invalidIds = new Set(invalidMeasureIds)
  paper.querySelectorAll<SVGGElement>('g.measure[id]').forEach((measure) => {
    if (!invalidIds.has(measure.dataset.m3nMeasureId ?? measure.id)) return
    addMeasureHighlight(measure, 'measure-error-highlight')
  })
}

export function ScoreRenderer({
  mei,
  headerMetadata,
  sourceMap,
  scoreDocument,
  compact = false,
  isSourceUpdating = false,
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
  const renderGenerationRef = useRef(0)
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
  const [loop, setLoop] = useState({ a: 0, b: 1, enabled: false })
  const [muted, setMuted] = useState({ melody: false, bass: false })
  const [follow, setFollow] = useState(true)
  const practiceRef = useRef({ loop, muted, follow })
  practiceRef.current = { loop, muted, follow }
  const followedSystem = useRef<Element | null>(null)
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
  const [playbackTranspose, setPlaybackTranspose] = useState(() => (
    compact ? DEFAULT_PLAYBACK_TRANSPOSE : readRendererSetting(
      TRANSPOSE_KEY,
      DEFAULT_PLAYBACK_TRANSPOSE,
      PLAYBACK_TRANSPOSE_MIN,
      PLAYBACK_TRANSPOSE_MAX,
    )
  ))
  const [metronomeEnabled, setMetronomeEnabled] = useState(() => (
    !compact && readRendererSetting(METRONOME_ENABLED_KEY, 0, 0, 1) === 1
  ))
  const [renderMode, setRenderMode] = useState<RenderMode>(compact ? 'continuous' : readRenderMode())
  const [storedNumberedNotation, setStoredNumberedNotation] = useState(() => !compact && readNumberedNotation())
  const numberedNotation = numberedNotationOverride ?? storedNumberedNotation
  const speedRef = useRef(playbackSpeed)
  const transposeRef = useRef(playbackTranspose)
  const [fitWidth, setFitWidth] = useState(() => compact || readRendererSetting('m3n:fit-width', 1, 0, 1) === 1)
  const [staffWidth, setStaffWidth] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPlayerLoading, setIsPlayerLoading] = useState(false)
  const [hasAudioControls, setHasAudioControls] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [renderPhase, setRenderPhase] = useState<RenderPhase | null>(null)
  const [selectedXmlId, setSelectedXmlId] = useState<string | null>(null)
  const renderWidth = fitWidth ? Math.max(SCORE_WIDTH_MIN, staffWidth || layoutWidth) : layoutWidth
  // At most one snapshot per notation, scoped to the current score and layout settings.
  const renderCache = useMemo(() => new Map<boolean, { markup: string; message: string }>(),
    [compact, headerMetadata, invalidMeasureIds, mei, renderMode, renderWidth, scoreDocument])

  useEffect(() => { if (isSourceUpdating) stopPlaybackRef.current() }, [isSourceUpdating])

  useEffect(() => {
    setPlaybackProgress(0)
    setLoop({ a: 0, b: 1, enabled: false })
    followedSystem.current = null
    setIsPlaying(false)
    setIsPlayerLoading(false)
    return () => {
      renderGenerationRef.current += 1
      scorePlaybackCoordinator.release(playbackLeaseRef.current)
      playerRef.current?.destroy(); playerRef.current = null
      scoreRef.current?.destroy(); scoreRef.current = null
      playerInitializationRef.current = null
      midiRef.current = null
      highlightedElementsRef.current = []
      highlightedMeasuresRef.current = []
    }
  }, [mei, scoreDocument])


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
    const controller = new AbortController()
    let cancelled = false
    const isInitialRender = !hasRenderedRef.current
    if (isInitialRender) paper.innerHTML = ''
    setMessage('')
    setIsRendering(true)
    setRenderPhase(isInitialRender ? 'loading-library' : null)
    setSelectedXmlId(null)
    void (async () => {
      try {
        const cached = renderCache.get(numberedNotation)
        paper.dataset.renderCache = cached ? 'hit' : 'miss'
        if (cached) {
          paper.innerHTML = cached.markup
          setMessage(cached.message)
          hasRenderedRef.current = true
          setHasAudioControls(true)
          return
        }
        const { message } = await renderScoreInto(paper, {
          mei, scoreDocument, numberedNotation, headerMetadata, width: renderWidth, paged: renderMode === 'paged',
          scale: compact ? 38 : 42, sheetClass: 'score-page-sheet', signal: controller.signal,
          onPhase: phase => { if (!cancelled && isInitialRender) setRenderPhase(phase) },
        })
        if (cancelled) return
        addInvalidMeasureHighlights(paper, invalidMeasureIds)
        renderCache.set(numberedNotation, { markup: paper.innerHTML, message })
        setMessage(message)
        hasRenderedRef.current = true
        setHasAudioControls(true)
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
      controller.abort()

    }
  }, [compact, headerMetadata, invalidMeasureIds, mei, numberedNotation, renderCache, renderMode, renderWidth, scoreDocument])

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
    const system = measures[0]?.closest('g.system')
    if (system && system !== followedSystem.current && practiceRef.current.follow && playerRef.current && !playerRef.current.paused && !isSeekingRef.current) {
      followedSystem.current = system
      const bounds = system.getBoundingClientRect()
      if (bounds.top < 70 || bounds.bottom > window.innerHeight - 30) system.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    onActiveXmlId?.(timedElements.map((element) => element.xmlId).find((id) => sourceMap.some((range) => range.xmlId === id)) ?? null)
  }

  const onPlayerTime = (seconds: number, duration: number) => {
    if (!isSeekingRef.current) updatePlaybackHighlight(seconds, duration)
  }

  const getPlayer = () => {
    if (playerRef.current) return Promise.resolve(playerRef.current)
    if (playerInitializationRef.current) return playerInitializationRef.current
    const generation = renderGenerationRef.current
    const initialization = (async () => {
      setIsPlayerLoading(true)
      try {
        let score = scoreRef.current
        if (!score) {
          const { VerovioScore } = await import('@m3n/score-renderer/verovio')
          score = await VerovioScore.create(typeof mei === 'function' ? mei() : mei)
          if (generation !== renderGenerationRef.current) { score.destroy(); throw new Error('乐谱已更新，请重新播放。') }
          scoreRef.current = score
        }
        midiRef.current ??= score.midi()
        const { SpessaPlayer } = await import('@m3n/score-renderer/player')
        const player = await SpessaPlayer.create(midiRef.current, {
          onEnded: () => {
            stopPlaybackRef.current()
          },
          onTime: onPlayerTime,
        }, transposeRef.current, playbackCountInBeats(scoreDocument))
        if (generation !== renderGenerationRef.current) { player.destroy(); throw new Error('乐谱已更新，请重新播放。') }
        player.setSpeed(speedRef.current)
        player.setMetronomeEnabled(metronomeEnabled)
        const practice = practiceRef.current
        player.setLoopRange(practice.loop.enabled ? [practice.loop.a, practice.loop.b] : null)
        player.setStaffMuted(1, practice.muted.melody)
        player.setStaffMuted(2, practice.muted.bass)
        playerRef.current = player
        return player
      } finally {
        if (generation === renderGenerationRef.current) setIsPlayerLoading(false)
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

  const playSelection = async () => {
    try {
      if (!selectedXmlId || !scoreDocument) return
      const range = sourceMap.find(item => item.xmlId === selectedXmlId)
      const measure = [...scoreDocument.parts.values()].flatMap(part => [...part.melody, ...part.bass]).find(item => item.events.some(event => event.sourceStart === range?.sourceStart))
      const first = measure?.events[0]
      const firstId = first && sourceMap.find(item => item.sourceStart === first.sourceStart)?.xmlId
      if (!firstId) return
      const player = await getPlayer()
      const time = scoreRef.current?.timeForElement(firstId) ?? 0
      player.seek(time / 1000 / player.duration)
      scorePlaybackCoordinator.claim(playbackLeaseRef.current)
      await player.play(); setIsPlaying(true)
    } catch (error) { setMessage(error instanceof Error ? error.message : '无法播放选中小节。') }
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
    setFitWidth(false)
    writeRendererSetting('m3n:fit-width', 0)
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

  const changePlaybackTranspose = (value: number) => {
    const transpose = Math.max(PLAYBACK_TRANSPOSE_MIN, Math.min(PLAYBACK_TRANSPOSE_MAX, Math.trunc(value)))
    const wasPlaying = Boolean(playerRef.current && !playerRef.current.paused)
    transposeRef.current = transpose
    setPlaybackTranspose(transpose)
    if (!compact) writeRendererSetting(TRANSPOSE_KEY, transpose)
    // MIDI note numbers are baked into the sequence. Rebuild it on the next
    // play so an already-loaded player cannot keep the old pitch.
    stopPlaybackRef.current()
    playerRef.current?.destroy()
    playerRef.current = null
    midiRef.current = null
    if (wasPlaying) {
      void getPlayer().then(async (player) => {
        scorePlaybackCoordinator.claim(playbackLeaseRef.current)
        await player.play()
        setIsPlaying(true)
      }).catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : '当前浏览器无法初始化音频。')
      })
    }
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
      {hasAudioControls && <ScoreControls
        practice={{
          selected: Boolean(selectedXmlId), onPlaySelection: () => void playSelection(),
          a: loop.a, b: loop.b, looping: loop.enabled,
          onMark: point => { const next = { ...loop, [point]: playbackProgress, enabled: false }; setLoop(next); playerRef.current?.setLoopRange(null) },
          onLoop: enabled => {
            if (enabled && loop.b - loop.a < 0.001) { setMessage('循环终点 B 必须在起点 A 之后。'); return }
            setLoop({ ...loop, enabled }); playerRef.current?.setLoopRange(enabled ? [loop.a, loop.b] : null)
          },
          melodyMuted: muted.melody, bassMuted: muted.bass, hasBass: Boolean(scoreDocument && [...scoreDocument.parts.values()].some(part => part.bass.length)),
          onMute: (staff, value) => { setMuted({ ...muted, [staff === 1 ? 'melody' : 'bass']: value }); playerRef.current?.setStaffMuted(staff, value) },
          follow, onFollow: setFollow,
        }}
        compact={compact}
        isPlaying={isPlaying}
        isLoading={isPlayerLoading || isSourceUpdating}
        progress={playbackProgress}
        speed={playbackSpeed}
        transpose={playbackTranspose}
        metronomeEnabled={metronomeEnabled}
        numberedNotation={numberedNotation}
        canChangeNotation={Boolean(scoreDocument)}
        onTogglePlayback={() => void togglePlayback()}
        onRestart={() => {
          isSeekingRef.current = false
          pendingSeekProgressRef.current = 0
          stopPlaybackRef.current()
          playerRef.current?.seek(0)
          setPlaybackProgress(0)
          clearPlaybackHighlight()
        }}
        onSeekStart={beginSeek}
        onSeek={previewSeek}
        onSeekCommit={commitSeek}
        onSpeedChange={changePlaybackSpeed}
        onTransposeChange={changePlaybackTranspose}
        onMetronomeChange={changeMetronomeEnabled}
        onNotationChange={changeNumberedNotation}
        onResetPractice={() => {
          setLoop({ a: 0, b: 1, enabled: false }); playerRef.current?.setLoopRange(null)
          setMuted({ melody: false, bass: false }); playerRef.current?.setStaffMuted(1, false); playerRef.current?.setStaffMuted(2, false); setFollow(true)
          changePlaybackSpeed(DEFAULT_PLAYBACK_SPEED)
          changeMetronomeEnabled(false)
          if (playbackTranspose !== DEFAULT_PLAYBACK_TRANSPOSE) changePlaybackTranspose(DEFAULT_PLAYBACK_TRANSPOSE)
        }}
        onLayoutSettings={() => settingsDialogRef.current?.showModal()}
      />}
      {!compact && (
        <dialog ref={settingsDialogRef} className="renderer-settings-dialog" aria-labelledby="renderer-settings-title">
          <div className="renderer-settings-header">
            <h2 id="renderer-settings-title">排版设置</h2>
            <button type="button" className="action-button" onClick={() => settingsDialogRef.current?.close()}>关闭</button>
          </div>
          <div className="renderer-settings-body">
            <label className="renderer-settings-row"><span>适应阅读宽度</span><input type="checkbox" checked={fitWidth} onChange={event => { setFitWidth(event.currentTarget.checked); writeRendererSetting('m3n:fit-width', event.currentTarget.checked ? 1 : 0) }} /></label>
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
        data-reading-fit={fitWidth}
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
