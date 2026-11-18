import { renderScoreInto, type RenderPhase, type ScoreDisplaySettings } from '../lib/render-score'
import type { PlaybackScore, SpessaPlayer } from '@m3n/score-renderer'
import { ScoreControls } from './ScoreControls'
import { loadSampledTone } from '@m3n/score-renderer/tones'
import { usePlaybackTone } from '../hooks/usePlaybackTone'
import { usePagedReaderLayout } from '../hooks/usePagedReaderLayout'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScoreSourceRange, ScoreDocument } from '@m3n/notation'
import {
  DEFAULT_PLAYBACK_TRANSPOSE,
  DEFAULT_SCORE_WIDTH,
  METRONOME_ENABLED_KEY,
  clampPlaybackBpm,
  PLAYBACK_TRANSPOSE_MAX,
  PLAYBACK_TRANSPOSE_MIN,
  readRenderMode,
  writeRenderMode,
  type RenderMode,
  SCORE_WIDTH_MAX,
  SCORE_WIDTH_MIN,
  readRendererSetting,
  writeRendererSetting,
} from '../lib/renderer-settings'
import {
  scorePlaybackCoordinator,
  type PlaybackLease,
} from '@m3n/score-renderer/view'

type ScoreRendererProps = {
  sourceMap: ScoreSourceRange[]
  scoreDocument: ScoreDocument
  scoreId?: string
  compact?: boolean
  playbackOnly?: boolean
  previewWidth?: number
  fitPagedToViewport?: boolean
  isSourceUpdating?: boolean
  activeXmlId?: string | null
  invalidMeasureIds?: string[]
  onActiveXmlId?: (xmlId: string | null) => void
  onDisplaySettingsChange?: (settings: ScoreDisplaySettings) => void
  onLayoutWidthChange?: (width: number) => void
  onNoteClick?: (xmlId: string) => void
  onPaperBlur?: () => void
}


const EMPTY_INVALID_MEASURE_IDS: string[] = []

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
    // to this pass, cycle the visible rows for
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

function drawStartupBeat(paper: HTMLElement | null, score: PlaybackScore | null, beat: 1 | 2 | 3, milliseconds: number) {
  const first = score?.nextElementAtTime(milliseconds) ?? score?.elementsAtTime(milliseconds)[0]
  if (!first) return
  const note = queryPlaybackElements(paper, first.xmlId, first.rendition)
    .find(element => element.matches('g.note')) as SVGGElement | undefined
  if (!note) return
  const numeral = [...note.querySelectorAll<SVGTextElement>('text')].find(text => /^[0-7]$/.test(text.textContent ?? ''))
  const bounds = (numeral ?? note).getBBox()
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  circle.classList.add('startup-beat-highlight')
  circle.setAttribute('data-beat', String(beat))
  circle.setAttribute('cx', String(bounds.x + bounds.width / 2))
  circle.setAttribute('cy', String(bounds.y + bounds.height / 2))
  circle.setAttribute('r', String(Math.max(bounds.width, bounds.height) * 0.5))
  note.insertBefore(circle, note.firstChild)
}

function addMeasureHighlight(measure: SVGGElement, className: string) {
  if (measure.querySelector(`:scope > .${className}`)) return
  const system = measure.closest<SVGGElement>('g.system')
  const measureBounds = measure.getBBox()
  const systemBounds = system?.getBBox() ?? measureBounds
  const numberedMeasureStart = Number(measure.dataset.m3nMeasureStart)
  const numberedMeasureEnd = Number(measure.dataset.m3nMeasureEnd)
  // Native numbered bounds remain valid when a measure continues on another system.
  const left = Number.isFinite(numberedMeasureStart)
    ? numberedMeasureStart - 5
    : measureBounds.x
  const right = Number.isFinite(numberedMeasureEnd)
    ? numberedMeasureEnd + 5
    : measureBounds.x + measureBounds.width
  const band = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  band.classList.add(className)
  band.setAttribute('x', String(left))
  band.setAttribute('y', String(systemBounds.y))
  band.setAttribute('width', String(Math.max(0, right - left)))
  band.setAttribute('height', String(systemBounds.height))
  measure.appendChild(band)
}

function addInvalidMeasureHighlights(paper: HTMLElement, invalidMeasureIds: readonly string[]) {
  const invalidIds = new Set(invalidMeasureIds)
  paper.querySelectorAll<SVGGElement>('g.measure[id]').forEach((measure) => {
    if (!invalidIds.has(measure.dataset.m3nMeasureId ?? measure.id)) return
    addMeasureHighlight(measure, 'measure-error-highlight')
  })
}

export function ScoreRenderer({
  sourceMap,
  scoreDocument,
  scoreId,
  compact = false,
  playbackOnly = false,
  previewWidth,
  fitPagedToViewport = false,
  isSourceUpdating = false,
  activeXmlId,
  invalidMeasureIds = EMPTY_INVALID_MEASURE_IDS,
  onActiveXmlId,
  onLayoutWidthChange,
  onDisplaySettingsChange,
  onNoteClick,
  onPaperBlur,
}: ScoreRendererProps) {
  const paperRef = useRef<HTMLDivElement>(null)
  const renderGenerationRef = useRef(0)
  const scoreRef = useRef<PlaybackScore | null>(null)
  const playerRef = useRef<SpessaPlayer | null>(null)
  const playerInitializationRef = useRef<Promise<SpessaPlayer> | null>(null)
  const playerGenerationRef = useRef(0)
  const stopPlaybackRef = useRef<() => void>(() => undefined)
  const playbackLeaseRef = useRef<PlaybackLease>({ stop: () => stopPlaybackRef.current() })
  const midiRef = useRef<ArrayBuffer | null>(null)
  const isSeekingRef = useRef(false)
  const pendingSeekProgressRef = useRef(0)
  const highlightedElementsRef = useRef<Element[]>([])
  const startupPositionRef = useRef(0)
  const startupBeatRef = useRef<1 | 2 | 3 | null>(null)
  const highlightedMeasuresRef = useRef<SVGGElement[]>([])
  const hasRenderedRef = useRef(false)
  const [message, setMessage] = useState('')
  const [savedPlaybackTone, changePlaybackTone] = usePlaybackTone()
  const playbackTone = playbackOnly ? 'synth' : savedPlaybackTone
  const toneRef = useRef(playbackTone)
  toneRef.current = playbackTone
  const [toneLoading, setToneLoading] = useState(playbackTone !== 'synth')
  const [toneError, setToneError] = useState('')
  const [toneRetry, setToneRetry] = useState(0)
  const [playbackProgress, setPlaybackProgress] = useState(0)
  const defaultWidth = scoreDocument.preferredWidth ?? DEFAULT_SCORE_WIDTH
  const [layoutWidth, setLayoutWidth] = useState(defaultWidth)
  const [bpmOverride, setBpmOverride] = useState<number | null>(null)
  const playbackBpm = bpmOverride ?? clampPlaybackBpm(scoreDocument.tempo * scoreDocument.meterUnit / 4)
  const tempoScale = playbackBpm / (scoreDocument.tempo * scoreDocument.meterUnit / 4)
  const [playbackTranspose, setPlaybackTranspose] = useState(DEFAULT_PLAYBACK_TRANSPOSE)
  const [metronomeEnabled, setMetronomeEnabled] = useState(() => (
    !compact && readRendererSetting(METRONOME_ENABLED_KEY, 0, 0, 1) === 1
  ))
  const [renderMode, setRenderMode] = useState<RenderMode>(compact ? 'continuous' : readRenderMode())
  usePagedReaderLayout(paperRef, fitPagedToViewport && renderMode === 'paged')
  const bpmRef = useRef(playbackBpm)
  bpmRef.current = playbackBpm
  const transposeRef = useRef(playbackTranspose)
  const [fitWidth, setFitWidth] = useState(compact && !playbackOnly)
  const [fixedDo, setFixedDo] = useState(() => !playbackOnly && readRendererSetting('m3n:fixed-do', 0, 0, 1) === 1)
  const [measureNumbers, setMeasureNumbers] = useState(() => !playbackOnly && readRendererSetting('m3n:measure-numbers', 0, 0, 1) === 1)
  const [contentWidth, setContentWidth] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPlayerLoading, setIsPlayerLoading] = useState(false)
  const [hasAudioControls, setHasAudioControls] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [renderPhase, setRenderPhase] = useState<RenderPhase | null>(null)
  const [selectedXmlId, setSelectedXmlId] = useState<string | null>(null)
  const renderWidth = previewWidth ?? (fitWidth ? Math.max(SCORE_WIDTH_MIN, contentWidth || layoutWidth) : layoutWidth)
  useEffect(() => {
    transposeRef.current = DEFAULT_PLAYBACK_TRANSPOSE
    setPlaybackTranspose(DEFAULT_PLAYBACK_TRANSPOSE)
    playerRef.current?.setTranspose(DEFAULT_PLAYBACK_TRANSPOSE)
  }, [scoreId])
  useEffect(() => {
    setLayoutWidth(defaultWidth)
    setBpmOverride(null)
    setFitWidth(compact && !playbackOnly)
  }, [scoreId, defaultWidth, compact, playbackOnly])
  useEffect(() => {
    onDisplaySettingsChange?.({ width: renderWidth, paged: renderMode === 'paged', fixedDo, measureNumbers, transpose: playbackTranspose, tempoScale })
  }, [renderWidth, renderMode, fixedDo, measureNumbers, playbackTranspose, tempoScale, onDisplaySettingsChange])
  useEffect(() => { if (isSourceUpdating) stopPlaybackRef.current() }, [isSourceUpdating])

  useEffect(() => {
    setPlaybackProgress(0)
    setIsPlaying(false)
    setIsPlayerLoading(false)
    return () => {
      renderGenerationRef.current += 1
      playerGenerationRef.current += 1
      scorePlaybackCoordinator.release(playbackLeaseRef.current)
      playerRef.current?.destroy(); playerRef.current = null
      scoreRef.current?.destroy(); scoreRef.current = null
      playerInitializationRef.current = null
      midiRef.current = null
      highlightedElementsRef.current = []
      highlightedMeasuresRef.current = []
    }
  }, [scoreDocument])


  useEffect(() => {
    const paper = paperRef.current
    if (!paper) return
    const updateWidth = () => {
      const width = Math.floor(paper.clientWidth)
      setContentWidth((current) => current === width ? current : width)
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
        const { message } = await renderScoreInto(paper, {
          scoreDocument, width: renderWidth, paged: renderMode === 'paged', measureNumbers, fixedDo, transpose: playbackTranspose, tempoScale,
          sheetClass: 'score-page-sheet', signal: controller.signal,
          onPhase: phase => { if (!cancelled && isInitialRender) setRenderPhase(phase) },
        })
        if (cancelled) return
        addInvalidMeasureHighlights(paper, invalidMeasureIds)
        if (startupBeatRef.current !== null) drawStartupBeat(paper, scoreRef.current, startupBeatRef.current, startupPositionRef.current * 1000)
        setMessage(message)
        hasRenderedRef.current = true
        setHasAudioControls(true)
      } catch (error: unknown) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : '简谱渲染失败。')
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
  }, [compact, invalidMeasureIds, renderMode, renderWidth, scoreDocument, measureNumbers, fixedDo, playbackTranspose, tempoScale])

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
  }, [activeXmlId, isRendering, selectedXmlId])

  const clearPlaybackHighlight = () => {
    highlightedElementsRef.current.forEach((element) => element.classList.remove('is-playing'))
    highlightedElementsRef.current = []
    paperRef.current?.querySelectorAll('.startup-beat-highlight').forEach(element => element.remove())
    startupBeatRef.current = null
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

  const showStartupBeat = (beat: 1 | 2 | 3 | null, seconds: number) => {
    startupPositionRef.current = seconds
    clearPlaybackHighlight()
    startupBeatRef.current = beat
    if (beat === null) return
    drawStartupBeat(paperRef.current, scoreRef.current, beat, seconds * 1000)
  }

  const updatePlaybackHighlight = (seconds: number, duration: number, syncProgress = true) => {
    const progress = duration > 0 ? Math.max(0, Math.min(1, seconds / duration)) : 0
    if (syncProgress) setPlaybackProgress(progress)
    const timedElements = scoreRef.current?.elementsAtTime(seconds * 1000) ?? []
    const elements = timedElements.flatMap(({ xmlId, rendition }) => queryPlaybackElements(paperRef.current, xmlId, rendition))
    const orderIndex = timedElements.find(element => element.orderIndex !== undefined)?.orderIndex
    if (orderIndex !== undefined) elements.push(...paperRef.current?.querySelectorAll(`[data-m3n-order-index="${orderIndex}"]`) ?? [])
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
    if (!isSeekingRef.current && startupBeatRef.current === null) updatePlaybackHighlight(seconds, duration)
  }

  const getPlayer = () => {
    if (playerRef.current) return Promise.resolve(playerRef.current)
    if (playerInitializationRef.current) return playerInitializationRef.current
    const generation = renderGenerationRef.current
    const playerGeneration = playerGenerationRef.current
    const tone = toneRef.current
    const initialization = (async () => {
      setIsPlayerLoading(true)
      try {
        const scorePreparation = scoreRef.current ? Promise.resolve(scoreRef.current) : (async () => {
          const { PlaybackScore } = await import('@m3n/score-renderer/playback')
          const score = await PlaybackScore.create(scoreDocument)
          if (generation !== renderGenerationRef.current || playerGeneration !== playerGenerationRef.current) { score.destroy(); throw new Error('乐谱或音色已更新，请重新播放。') }
          scoreRef.current = score
          return score
        })()
        const [score, { SpessaPlayer }] = await Promise.all([
          scorePreparation,
          import('@m3n/score-renderer/player'),
        ])
        midiRef.current ??= score.midi()
        if (playerGeneration !== playerGenerationRef.current) throw new Error('音色已切换，请重新播放。')
        const player = await SpessaPlayer.create(midiRef.current, {
          onEnded: () => {
            stopPlaybackRef.current()
          },
          onTime: onPlayerTime,
          onStartupBeat: showStartupBeat,
        }, transposeRef.current, tone)
        if (generation !== renderGenerationRef.current || playerGeneration !== playerGenerationRef.current) { player.destroy(); throw new Error('乐谱或音色已更新，请重新播放。') }
        try {
          let appliedTone = tone
          while (appliedTone !== toneRef.current) {
            appliedTone = toneRef.current
            await player.setTone(appliedTone)
          }
        } catch (error) { player.destroy(); throw error }
        if (generation !== renderGenerationRef.current || playerGeneration !== playerGenerationRef.current) { player.destroy(); throw new Error('乐谱已更新，请重新播放。') }
        player.setTranspose(transposeRef.current)
        player.setTempo(bpmRef.current)
        player.setMetronomeEnabled(metronomeEnabled)
        playerRef.current = player
        return player
      } finally {
        if (generation === renderGenerationRef.current && playerGeneration === playerGenerationRef.current) setIsPlayerLoading(false)
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

  useEffect(() => {
    let cancelled = false
    setToneError('')
    setToneLoading(playbackTone !== 'synth')
    void (async () => {
      try {
        const player = playerRef.current
        if (player) await player.setTone(playbackTone)
        else if (playbackTone !== 'synth') await loadSampledTone(playbackTone)
        if (!cancelled) setToneLoading(false)
      } catch (error) {
        if (!cancelled) {
          setToneLoading(false)
          setToneError(error instanceof Error ? error.message : '无法加载音色，请重试。')
        }
      }
    })()
    return () => { cancelled = true }
  }, [playbackTone, toneRetry])

  const togglePlayback = async () => {
    try {
      const player = await getPlayer()
      if (player.paused) {
        scorePlaybackCoordinator.claim(playbackLeaseRef.current)
        setIsPlaying(true)
        await player.play()
        setIsPlaying(!player.paused)
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
    setLayoutWidth(width)
    onLayoutWidthChange?.(width)
  }

  const changePlaybackBpm = (value: number) => {
    if (!Number.isFinite(value)) return
    const bpm = clampPlaybackBpm(value)
    bpmRef.current = bpm
    setBpmOverride(bpm)
    playerRef.current?.setTempo(bpm)
  }

  const changePlaybackTranspose = (value: number) => {
    const transpose = Math.max(PLAYBACK_TRANSPOSE_MIN, Math.min(PLAYBACK_TRANSPOSE_MAX, Math.trunc(value)))
    transposeRef.current = transpose
    setPlaybackTranspose(transpose)
    playerRef.current?.setTranspose(transpose)
  }

  const changeMetronomeEnabled = (enabled: boolean) => {
    setMetronomeEnabled(enabled)
    if (!compact) writeRendererSetting(METRONOME_ENABLED_KEY, enabled ? 1 : 0)
    playerRef.current?.setMetronomeEnabled(enabled)
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
    <section className={compact ? 'score-card score-renderer compact' : 'score-card score-renderer'}>
      {hasAudioControls && <ScoreControls
        playbackOnly={playbackOnly}
        isPlaying={isPlaying}
        isLoading={isPlayerLoading || isSourceUpdating}
        progress={playbackProgress}
        bpm={playbackBpm}
        width={Math.round(renderWidth)}
        paged={renderMode === 'paged'}
        onPagedChange={paged => { const mode = paged ? 'paged' : 'continuous'; setRenderMode(mode); if (!compact) writeRenderMode(mode) }}
        fixedDo={fixedDo}
        onFixedDoChange={enabled => { setFixedDo(enabled); writeRendererSetting('m3n:fixed-do', enabled ? 1 : 0) }}
        measureNumbers={measureNumbers}
        onMeasureNumbersChange={enabled => { setMeasureNumbers(enabled); writeRendererSetting('m3n:measure-numbers', enabled ? 1 : 0) }}
        onWidthChange={changeLayoutWidth}
        onResetWidth={() => changeLayoutWidth(defaultWidth)}
        originalKey={scoreDocument.key}
        transpose={playbackTranspose}
        metronomeEnabled={metronomeEnabled}
        tone={playbackTone}
        toneLoading={toneLoading}
        toneError={toneError}
        onToneChange={tone => { setToneLoading(tone !== 'synth'); setToneError(''); changePlaybackTone(tone) }}
        onToneRetry={() => setToneRetry(value => value + 1)}
        onTogglePlayback={() => void togglePlayback()}
        onSeekStart={beginSeek}
        onSeek={previewSeek}
        onSeekCommit={commitSeek}
        onBpmChange={changePlaybackBpm}
        onTransposeChange={changePlaybackTranspose}
        onMetronomeChange={changeMetronomeEnabled}
        onResetBpm={() => {
          setBpmOverride(null)
          const bpm = clampPlaybackBpm(scoreDocument.tempo * scoreDocument.meterUnit / 4)
          bpmRef.current = bpm
          playerRef.current?.setTempo(bpm)
        }}
      />}
      <div
        ref={paperRef}
        className="score-paper"
        data-render-phase={renderPhase ?? undefined}
        data-reading-fit={fitWidth}
        data-render-mode={renderMode}
        data-fixed-do={fixedDo}
        data-measure-numbers={measureNumbers}
        data-notation="numbered"
        aria-busy={isRendering || isSourceUpdating || undefined}
        tabIndex={0}
        onClick={(event) => {
          const element = (event.target as Element).closest('[id^="m3n-e-"], [data-m3n-id^="m3n-e-"]')
          const xmlId = element?.getAttribute('id') ?? element?.getAttribute('data-m3n-id')
          if (!xmlId) return
          setSelectedXmlId(xmlId)
          const player = playerRef.current
          if (isPlaying && player && !player.paused && player.duration > 0) {
            const milliseconds = scoreRef.current?.timeForElement(xmlId) ?? -1
            if (milliseconds >= 0) player.seek(milliseconds / (player.duration * 1000))
          }
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
