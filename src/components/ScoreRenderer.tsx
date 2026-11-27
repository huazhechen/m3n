import { followPlayingMeasure } from '../lib/score-playback-follow'
import { scoreInkBounds } from '../lib/score-ink-bounds'
import { queryPlaybackElements } from '../lib/score-playback-elements'
import { renderScoreInto, type RenderPhase, type ScoreDisplaySettings } from '../lib/render-score'
import type { PlaybackScore, SpessaPlayer } from '@m3n/score-renderer'
import { ScoreControls } from './ScoreControls'
import { ScoreAccessibleText } from './ScoreAccessibleText'
import { PlaybackLoadingDialog } from './PlaybackLoadingDialog'
import { ResourceLoadingDialog } from './ResourceLoadingDialog'
import { cancelToneLoad, loadSampledTone, subscribeToneLoadProgress, type ToneLoadProgress } from '@m3n/score-renderer/tones'
import { usePlaybackTone } from '../hooks/usePlaybackTone'
import { usePagedReaderLayout } from '../hooks/usePagedReaderLayout'
import { attachScoreZoom } from '../lib/score-zoom'
import { measureClickTarget, measureSeekProgress } from '../lib/score-measure-click'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScoreSourceRange, ScoreDocument } from '@m3n/notation'
import {
  DEFAULT_PLAYBACK_TRANSPOSE,
  DEFAULT_SCORE_WIDTH,
  clampScoreWidth,
  METRONOME_ENABLED_KEY,
  clampPlaybackBpm,
  PLAYBACK_TRANSPOSE_MAX,
  PLAYBACK_TRANSPOSE_MIN,
  readRenderMode,
  readNotationMode,
  writeNotationMode,
  type NotationMode,
  writeRenderMode,
  type RenderMode,
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
  systemCjk?: boolean
  scoreId?: string
  compact?: boolean
  playbackOnly?: boolean
  containedControls?: boolean
  previewWidth?: number
  /** Disable for editable sources so content changes preserve the chosen width. */
  autoSearchWidth?: boolean
  fitPagedToViewport?: boolean
  immersive?: boolean
  onImmersiveChange?: () => void
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


function drawStartupBeat(paper: HTMLElement | null, score: PlaybackScore | null, beat: 1 | 2 | 3, milliseconds: number) {
  const first = score?.nextElementAtTime(milliseconds) ?? score?.elementsAtTime(milliseconds)[0]
  if (!first) return
  const measures = new Set(queryPlaybackElements(paper, first.xmlId, first.rendition)
    .map(element => element.closest<SVGGElement>('g.measure')).filter(measure => measure !== null))
  for (const measure of measures) {
    addMeasureHighlight(measure, 'startup-beat-highlight')
    const background = measure.querySelector<SVGRectElement>(':scope > .startup-beat-highlight')!
    background.setAttribute('data-beat', String(beat))
    measure.prepend(background)
  }
}

function addMeasureHighlight(measure: SVGGElement, className: string) {
  if (measure.querySelector(`:scope > .${className}`)) return
  const system = measure.closest<SVGGElement>('g.system')
  const measureBounds = scoreInkBounds(measure) ?? measure.getBBox()
  const systemBounds = system ? scoreInkBounds(system) ?? system.getBBox() : measureBounds
  // Music-font getBBox() includes em-box whitespace well outside the engraved
  // row. Prefer renderer ink bounds, or numbered measured row bounds.
  const numberedSystemTop = Number(system?.dataset.m3nTop)
  const numberedSystemBottom = Number(system?.dataset.m3nBottom)
  const hasNumberedSystemBounds = Number.isFinite(numberedSystemTop)
    && Number.isFinite(numberedSystemBottom) && numberedSystemBottom > numberedSystemTop
  const numberedMeasureStart = Number(measure.dataset.m3nMeasureStart)
  const numberedMeasureEnd = Number(measure.dataset.m3nMeasureEnd)
  // Use the exact engraved boundaries without padding into adjacent measures.
  // Native numbered bounds remain valid when a measure continues on another system.
  const left = Number.isFinite(numberedMeasureStart)
    ? numberedMeasureStart
    : measureBounds.x
  const right = Number.isFinite(numberedMeasureEnd)
    ? numberedMeasureEnd
    : measureBounds.x + measureBounds.width
  const band = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  band.classList.add(className)
  band.setAttribute('aria-hidden', 'true')
  band.setAttribute('x', String(left))
  band.setAttribute('y', String(hasNumberedSystemBounds ? numberedSystemTop : systemBounds.y))
  band.setAttribute('width', String(Math.max(0, right - left)))
  band.setAttribute('height', String(hasNumberedSystemBounds ? numberedSystemBottom - numberedSystemTop : systemBounds.height))
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
  systemCjk = false,
  scoreDocument,
  scoreId,
  compact = false,
  playbackOnly = false,
  containedControls = false,
  previewWidth,
  autoSearchWidth = true,
  fitPagedToViewport = false,
  immersive = false,
  onImmersiveChange,
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
  const zoomRef = useRef<ReturnType<typeof attachScoreZoom> | null>(null)
  const [zoomed, setZoomed] = useState(false)
  useEffect(() => {
    const paper = paperRef.current
    setZoomed(false)
    if (!paper) return
    const zoom = attachScoreZoom(paper, scale => setZoomed(scale !== 1))
    zoomRef.current = zoom
    return () => {
      zoom.destroy()
      zoomRef.current = null
    }
  }, [scoreId])
  const renderGenerationRef = useRef(0)
  const scoreRef = useRef<PlaybackScore | null>(null)
  const playerRef = useRef<SpessaPlayer | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const playerInitializationRef = useRef<Promise<SpessaPlayer> | null>(null)
  const playerGenerationRef = useRef(0)
  const stopPlaybackRef = useRef<() => void>(() => undefined)
  const playbackLeaseRef = useRef<PlaybackLease>({ stop: () => stopPlaybackRef.current() })
  const midiRef = useRef<ArrayBuffer | null>(null)
  const isSeekingRef = useRef(false)
  const pendingSeekProgressRef = useRef(0)
  const playbackProgressRef = useRef(0)
  const measureSeekTimeRef = useRef<number | null>(null)
  const restorePlaybackHighlightRef = useRef<() => void>(() => undefined)
  const highlightedElementsRef = useRef<Element[]>([])
  const startupPositionRef = useRef(0)
  const startupBeatRef = useRef<1 | 2 | 3 | null>(null)
  const highlightedMeasuresRef = useRef<SVGGElement[]>([])
  const hasRenderedRef = useRef(false)
  const manualWidthRef = useRef(false)
  const autoWidthSelectionRef = useRef<{ scoreDocument: ScoreDocument; settings: string; width: number } | null>(null)
  const [message, setMessage] = useState('')
  const [savedPlaybackTone, changePlaybackTone] = usePlaybackTone()
  const playbackTone = playbackOnly ? 'synth' : savedPlaybackTone
  const toneRef = useRef(playbackTone)
  toneRef.current = playbackTone
  const [toneLoading, setToneLoading] = useState(false)
  const [toneProgress, setToneProgress] = useState<ToneLoadProgress | null>(null)
  const [toneDownloadStarted, setToneDownloadStarted] = useState(false)
  const readyToneRef = useRef<typeof playbackTone>('synth')
  useEffect(() => subscribeToneLoadProgress(progress => {
    if (progress.tone === toneRef.current) {
      setToneProgress(progress)
      if (progress.stage === 'download') setToneDownloadStarted(true)
    }
  }), [])
  const [toneError, setToneError] = useState('')
  const [toneRetry, setToneRetry] = useState(0)
  const playRequestRef = useRef(0)
  const [isPlayRequest, setIsPlayRequest] = useState(false)
  const [playbackProgress, setPlaybackProgress] = useState(0)
  const [notationMode, setNotationMode] = useState<NotationMode>(() => playbackOnly ? 'movable' : readNotationMode())
  const defaultWidth = DEFAULT_SCORE_WIDTH
  const [layoutWidth, setLayoutWidth] = useState(defaultWidth)
  const [bpmOverride, setBpmOverride] = useState<number | null>(null)
  const playbackBpm = bpmOverride ?? clampPlaybackBpm(scoreDocument.tempo * scoreDocument.meterUnit / 4)
  const tempoScale = playbackBpm / (scoreDocument.tempo * scoreDocument.meterUnit / 4)
  const [playbackTranspose, setPlaybackTranspose] = useState(DEFAULT_PLAYBACK_TRANSPOSE)
  const [metronomeEnabled, setMetronomeEnabled] = useState(() => (
    !compact && readRendererSetting(METRONOME_ENABLED_KEY, 1, 0, 1) === 1
  ))
  const [renderMode, setRenderMode] = useState<RenderMode>(compact ? 'continuous' : readRenderMode())
  usePagedReaderLayout(paperRef, fitPagedToViewport && renderMode === 'paged', immersive)
  useEffect(() => {
    if (fitPagedToViewport && renderMode === 'paged') zoomRef.current?.reset()
  }, [immersive, fitPagedToViewport, renderMode])
  const bpmRef = useRef(playbackBpm)
  bpmRef.current = playbackBpm
  const transposeRef = useRef(playbackTranspose)
  const [fitWidth, setFitWidth] = useState(compact && !playbackOnly)
  const fixedDo = notationMode === 'fixed'
  const [measureNumbers, setMeasureNumbers] = useState(() => !playbackOnly && readRendererSetting('m3n:measure-numbers', 0, 0, 1) === 1)
  const autoWidthSettings = JSON.stringify([systemCjk, notationMode, fixedDo, playbackTranspose, tempoScale])
  const [contentWidth, setContentWidth] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPlayerLoading, setIsPlayerLoading] = useState(false)
  const [hasAudioControls, setHasAudioControls] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [renderPhase, setRenderPhase] = useState<RenderPhase | null>(null)
  const [selectedXmlId, setSelectedXmlId] = useState<string | null>(null)
  const automaticWidth = autoSearchWidth && !manualWidthRef.current && renderMode === 'paged' && !compact && !previewWidth
  const renderWidth = previewWidth ?? (fitWidth ? Math.max(SCORE_WIDTH_MIN, contentWidth || layoutWidth) : layoutWidth)
  // Updating the displayed automatic width must not start another layout.
  const requestedWidth = automaticWidth ? undefined : renderWidth
  useEffect(() => {
    transposeRef.current = DEFAULT_PLAYBACK_TRANSPOSE
    setPlaybackTranspose(DEFAULT_PLAYBACK_TRANSPOSE)
    playerRef.current?.setTranspose(DEFAULT_PLAYBACK_TRANSPOSE)
  }, [scoreId])
  useEffect(() => {
    setLayoutWidth(defaultWidth)
    autoWidthSelectionRef.current = null
    manualWidthRef.current = false
  }, [scoreId, defaultWidth])
  useEffect(() => {
    setBpmOverride(null)
    setFitWidth(compact && !playbackOnly)
  }, [scoreId, compact, playbackOnly])
  useEffect(() => {
    onDisplaySettingsChange?.({ width: renderWidth, paged: renderMode === 'paged', notationMode, fixedDo, measureNumbers, transpose: playbackTranspose, tempoScale })
  }, [renderWidth, renderMode, notationMode, fixedDo, measureNumbers, playbackTranspose, tempoScale, onDisplaySettingsChange])
  useEffect(() => { if (isSourceUpdating) stopPlaybackRef.current() }, [isSourceUpdating])

  useEffect(() => {
    const playbackLease = playbackLeaseRef.current
    setSelectedXmlId(null)
    playbackProgressRef.current = 0
    measureSeekTimeRef.current = null
    setPlaybackProgress(0)
    setIsPlayRequest(false)
    setToneLoading(false)
    setIsPlaying(false)
    setIsPlayerLoading(false)
    return () => {
      renderGenerationRef.current += 1
      playerGenerationRef.current += 1
      playRequestRef.current += 1
      scorePlaybackCoordinator.release(playbackLease)
      if (!playerRef.current && audioContextRef.current?.state !== 'closed') void audioContextRef.current?.close()
      playerRef.current?.destroy(); playerRef.current = null
      audioContextRef.current = null
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
    if (!paper || requestedWidth === 0) return
    const controller = new AbortController()
    let cancelled = false
    const isInitialRender = !hasRenderedRef.current
    if (isInitialRender) paper.innerHTML = ''
    setMessage('')
    setIsRendering(true)
    setRenderPhase(isInitialRender ? 'loading-library' : null)
    void (async () => {
      try {
        const selectedWidth = autoWidthSelectionRef.current
        const autoWidth = autoSearchWidth && !manualWidthRef.current && renderMode === 'paged' && !compact && !previewWidth && (selectedWidth?.scoreDocument !== scoreDocument || selectedWidth.settings !== autoWidthSettings)
        const { message, width } = await renderScoreInto(paper, {
          scoreDocument, systemCjk, width: requestedWidth ?? selectedWidth?.width, autoWidth, paged: renderMode === 'paged', notationMode, measureNumbers, fixedDo, transpose: playbackTranspose, tempoScale,
          sheetClass: 'score-page-sheet', signal: controller.signal,
          onPhase: phase => { if (!cancelled) setRenderPhase(phase) },
        })
        if (cancelled) return
        if (autoWidth) {
          if (width !== undefined) setLayoutWidth(current => current === width ? current : width)
          if (width !== undefined) autoWidthSelectionRef.current = { scoreDocument, settings: autoWidthSettings, width }
        }
        paper.querySelectorAll<SVGGElement>('g.measure').forEach(measure => {
          // Use the same engraved boundaries as the measure highlights, including
          // the elastic space before the first note and the full music row.
          measure.querySelector(':scope > [data-score-reading-hitarea]')?.remove()
          addMeasureHighlight(measure, 'measure-click-area')
          const area = measure.querySelector<SVGRectElement>(':scope > .measure-click-area')!
          area.setAttribute('data-score-reading-hitarea', '')
          area.setAttribute('fill', 'transparent')
          area.setAttribute('pointer-events', 'all')
          measure.prepend(area)
        })
        addInvalidMeasureHighlights(paper, invalidMeasureIds)
        const startupBeat = startupBeatRef.current
        restorePlaybackHighlightRef.current()
        startupBeatRef.current = startupBeat
        if (startupBeat !== null) drawStartupBeat(paper, scoreRef.current, startupBeat, startupPositionRef.current * 1000)
        setMessage(message)
        hasRenderedRef.current = true
        setHasAudioControls(true)
      } catch (error: unknown) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : '乐谱渲染失败。')
          if (notationMode === 'staff') setHasAudioControls(true)
        }
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
  }, [systemCjk, autoSearchWidth, autoWidthSettings, compact, invalidMeasureIds, previewWidth, renderMode, requestedWidth, scoreDocument, measureNumbers, notationMode, fixedDo, playbackTranspose, tempoScale])

  useEffect(() => {
    const paper = paperRef.current
    paper?.querySelectorAll('.is-cursor-active').forEach((element) => {
      element.classList.remove('is-cursor-active')
    })
    paper?.querySelectorAll('.is-cursor-active-measure').forEach((measure) => {
      measure.classList.remove('is-cursor-active-measure')
    })
    const xmlId = onNoteClick ? activeXmlId ?? selectedXmlId : null
    const element = xmlId ? queryScoreElement(paper, xmlId) : null
    if (element) {
      element.classList.add('is-cursor-active')
      const measure = element.closest<SVGGElement>('g.measure')
      if (measure) {
        addMeasureHighlight(measure, 'measure-cursor-highlight')
        measure.classList.add('is-cursor-active-measure')
      }
    }
  }, [activeXmlId, isRendering, selectedXmlId, onNoteClick])

  const clearPlaybackHighlight = () => {
    highlightedElementsRef.current.forEach((element) => {
      element.classList.remove('is-playing')
    })
    highlightedElementsRef.current = []
    paperRef.current?.querySelectorAll('.startup-beat-highlight').forEach(element => element.remove())
    startupBeatRef.current = null
    highlightedMeasuresRef.current.forEach((measure) => {
      measure.classList.remove('is-playing-measure')
    })
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
    restorePlaybackHighlightRef.current()
    scorePlaybackCoordinator.release(playbackLeaseRef.current)
  }

  const showStartupBeat = (beat: 1 | 2 | 3 | null, seconds: number) => {
    startupPositionRef.current = seconds
    clearPlaybackHighlight()
    restorePlaybackHighlightRef.current()
    startupBeatRef.current = beat
    if (beat === null) return
    drawStartupBeat(paperRef.current, scoreRef.current, beat, seconds * 1000)
  }

  const updatePlaybackHighlight = (seconds: number, duration: number, syncProgress = true) => {
    const progress = duration > 0 ? Math.max(0, Math.min(1, seconds / duration)) : 0
    if (syncProgress) {
      playbackProgressRef.current = progress
      setPlaybackProgress(progress)
    }
    if (progress <= 0 || progress >= 1) {
      clearPlaybackHighlight()
      return
    }
    // The transport sits 1ms before a clicked boundary to preserve its note-on.
    // Display the selected first event while the clock remains at that boundary.
    const selectedTime = measureSeekTimeRef.current
    const milliseconds = selectedTime !== null && Math.abs(seconds * 1000 - selectedTime) <= 1.01
      ? selectedTime : seconds * 1000
    const timedElements = scoreRef.current?.elementsAtTime(milliseconds) ?? []
    const elements = timedElements.flatMap(({ xmlId, rendition, tupletSlot }) => queryPlaybackElements(paperRef.current, xmlId, rendition, tupletSlot))
    const orderIndex = timedElements.find(element => element.orderIndex !== undefined)?.orderIndex
    if (orderIndex !== undefined) elements.push(...paperRef.current?.querySelectorAll(`[data-m3n-order-index="${orderIndex}"]`) ?? [])
    highlightedElementsRef.current.forEach((element) => {
      if (!elements.includes(element)) {
        element.classList.remove('is-playing')
      }
    })
    elements.forEach((element) => {
      element.classList.add('is-playing')
    })
    highlightedElementsRef.current = elements
    const measures = [...new Set(elements.map((element) => element.closest<SVGGElement>('g.measure')).filter((measure): measure is SVGGElement => Boolean(measure)))]
    highlightedMeasuresRef.current.forEach((measure) => {
      if (!measures.includes(measure)) {
        measure.classList.remove('is-playing-measure')
      }
    })
    measures.forEach(highlightMeasure)
    if (fitPagedToViewport && playerRef.current && !playerRef.current.paused && measures[0]) {
      followPlayingMeasure(measures[0])
    }
    highlightedMeasuresRef.current = measures
    onActiveXmlId?.(timedElements.map((element) => element.xmlId).find((id) => sourceMap.some((range) => range.xmlId === id)) ?? null)
  }

  restorePlaybackHighlightRef.current = () => {
    const player = playerRef.current
    if (player) updatePlaybackHighlight(playbackProgressRef.current * player.duration, player.duration, false)
  }

  const onPlayerTime = (seconds: number, duration: number) => {
    if (!isSeekingRef.current && startupBeatRef.current === null) {
      // The player clamps a seek to the end just before its final MIDI event.
      const atEnd = playbackProgressRef.current === 1 && duration - seconds <= 0.00101
      updatePlaybackHighlight(atEnd ? duration : seconds, duration)
    }
  }

  const activateAudio = () => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') audioContextRef.current = new AudioContext()
    // iOS requires resume() in the click/touch handler, before imports or downloads.
    // play() awaits resume again and reports failures through the normal UI.
    void audioContextRef.current.resume().catch(() => {})
    return audioContextRef.current
  }

  const getPlayer = (initialTone = toneRef.current) => {
    if (playerRef.current) return Promise.resolve(playerRef.current)
    if (playerInitializationRef.current) return playerInitializationRef.current
    const generation = renderGenerationRef.current
    const playerGeneration = playerGenerationRef.current
    const tone = initialTone
    const context = audioContextRef.current ?? activateAudio()
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
          resumeTime: seconds => score.resumeTimeAt(seconds * 1000) / 1000,
        }, transposeRef.current, tone, context)
        if (generation !== renderGenerationRef.current || playerGeneration !== playerGenerationRef.current) { player.destroy(); throw new Error('乐谱或音色已更新，请重新播放。') }
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
    setToneLoading(false)
    setToneProgress(null)
    setToneDownloadStarted(false)
    // A paused player applies the selection on the next explicit play request.
    if (!playerRef.current || playerRef.current.paused) return
    setToneLoading(true)
    void (async () => {
      try {
        const player = playerRef.current
        if (playbackTone !== 'synth') await loadSampledTone(playbackTone)
        if (cancelled) return
        if (player) await player.setTone(playbackTone)
        if (!cancelled) { readyToneRef.current = playbackTone; setToneLoading(false) }
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
    if (isPlaying || (playerRef.current && !playerRef.current.paused)) {
      ++playRequestRef.current
      setIsPlayRequest(false)
      stopPlaybackRef.current()
      return
    }
    const request = ++playRequestRef.current
    const generation = playerGenerationRef.current
    const isCurrent = () => request === playRequestRef.current && generation === playerGenerationRef.current
    setIsPlayRequest(true)
    setToneError('')
    setToneProgress(null)
    setToneDownloadStarted(false)
    setToneLoading(true)
    try {
      activateAudio()
      // Cache hits report only readiness; only an actual download opens the dialog.
      let tone = toneRef.current
      if (tone !== 'synth') await loadSampledTone(tone)
      if (!isCurrent()) return
      const player = await getPlayer()
      while (isCurrent()) {
        tone = toneRef.current
        await player.setTone(tone)
        if (tone === toneRef.current) break
      }
      if (!isCurrent()) return
      readyToneRef.current = tone
      setToneLoading(false)
      scorePlaybackCoordinator.claim(playbackLeaseRef.current)
      setIsPlaying(true)
      await player.play()
      if (isCurrent()) setIsPlaying(!player.paused)
    } catch (error) {
      if (!isCurrent()) return
      scorePlaybackCoordinator.release(playbackLeaseRef.current)
      setIsPlaying(false)
      setToneError(error instanceof Error ? error.message : '无法加载音色，请重试。')
    } finally {
      if (request === playRequestRef.current) {
        setToneLoading(false)
        setIsPlayRequest(false)
      }
    }
  }

  const previewSeek = (progress: number) => {
    pendingSeekProgressRef.current = progress
    playbackProgressRef.current = progress
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
    measureSeekTimeRef.current = null
    pendingSeekProgressRef.current = playbackProgress
    void (async () => { activateAudio(); return getPlayer('synth') })().then((player) => {
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
    const width = clampScoreWidth(value)
    manualWidthRef.current = true
    // Cancel pending automatic refinement when the reader chooses a width.
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
      <ResourceLoadingDialog
        active={isRendering && renderPhase !== null && renderPhase !== 'layout'}
        title={notationMode === 'staff' ? '准备五线谱' : '准备简谱'}
        description={renderPhase === 'loading-fonts' ? '正在准备乐谱字体…' : '正在加载乐谱渲染资源…'}
        progressLabel="乐谱准备进度"
      />
      {isPlayRequest && toneLoading && toneDownloadStarted && <PlaybackLoadingDialog
        tone={playbackTone}
        progress={toneProgress}
        onCancelTone={() => {
          ++playRequestRef.current
          setIsPlayRequest(false)
          setToneLoading(false)
          const tone = playbackTone
          changePlaybackTone(readyToneRef.current)
          if (tone !== 'synth') cancelToneLoad(tone)
        }}
      />}
      {hasAudioControls && <ScoreControls
        immersive={immersive}
        onImmersiveChange={onImmersiveChange}
        playbackOnly={playbackOnly}
        contained={containedControls}
        isPlaying={isPlaying}
        isLoading={isPlayerLoading || isPlayRequest || isSourceUpdating}
        progress={playbackProgress}
        bpm={playbackBpm}
        width={Math.round(renderWidth)}
        paged={renderMode === 'paged'}
        onPagedChange={paged => {
          const mode = paged ? 'paged' : 'continuous'
          setRenderMode(mode)
          if (!compact) writeRenderMode(mode)
        }}
        notationMode={notationMode}
        onNotationModeChange={mode => { setNotationMode(mode); writeNotationMode(mode) }}
        measureNumbers={measureNumbers}
        onMeasureNumbersChange={enabled => { setMeasureNumbers(enabled); writeRendererSetting('m3n:measure-numbers', enabled ? 1 : 0) }}
        onWidthChange={changeLayoutWidth}
        onResetWidth={() => {
          manualWidthRef.current = false
          const selected = autoWidthSelectionRef.current
          const width = autoSearchWidth && selected?.scoreDocument === scoreDocument && selected.settings === autoWidthSettings
            ? selected.width
            : defaultWidth
          setFitWidth(false)
          setLayoutWidth(width)
          onLayoutWidthChange?.(width)
        }}
        originalKey={scoreDocument.key}
        transpose={playbackTranspose}
        metronomeEnabled={metronomeEnabled}
        tone={playbackTone}
        toneLoading={toneLoading}
        toneError={toneError}
        onToneChange={tone => { setToneError(''); changePlaybackTone(tone) }}
        onToneRetry={() => {
          if (playerRef.current && !playerRef.current.paused) setToneRetry(value => value + 1)
          else void togglePlayback()
        }}
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
      <ScoreAccessibleText score={scoreDocument} notationMode={notationMode} transpose={playbackTranspose} tempoScale={tempoScale} />
      <div
        ref={paperRef}
        className="score-paper"
        data-render-phase={renderPhase ?? undefined}
        data-reading-fit={fitWidth}
        data-render-mode={renderMode}
        data-fixed-do={fixedDo}
        data-measure-numbers={measureNumbers}
        data-notation={notationMode === 'staff' ? 'staff' : 'numbered'}
        aria-busy={isRendering || isSourceUpdating || undefined}
        aria-hidden="true"
        onClick={(event) => {
          const target = measureClickTarget(event.currentTarget, event.target as Element)
          if (!target) return
          const { xmlId, playbackId } = target
          setSelectedXmlId(xmlId)
          // Initialize only the built-in synth for positioning; selecting a
          // measure must not start playback or download the chosen sampled tone.
          const seekToMeasure = (player: SpessaPlayer) => {
            const milliseconds = scoreRef.current?.timeForElement(playbackId) ?? -1
            if (milliseconds < 0 || player.duration <= 0) return
            measureSeekTimeRef.current = milliseconds
            player.seek(measureSeekProgress(milliseconds, player.duration))
            restorePlaybackHighlightRef.current()
          }
          if (playerRef.current) seekToMeasure(playerRef.current)
          else {
            activateAudio()
            void getPlayer('synth').then(seekToMeasure).catch((error: unknown) => {
              setMessage(error instanceof Error ? error.message : '当前浏览器无法初始化音频。')
            })
          }
          window.requestAnimationFrame(() => onNoteClick?.(xmlId))
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) onPaperBlur?.()
        }}
      />
      {zoomed && <div className="score-zoom-actions">
        <button type="button" className="control-button score-zoom-reset" title="恢复原始大小" aria-label="恢复原始大小" onClick={() => zoomRef.current?.reset()}>
          复原
        </button>
      </div>}
      {message && <p className="render-message">{message}</p>}
    </section>
  )
}
