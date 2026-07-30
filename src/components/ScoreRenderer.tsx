import abcjs from 'abcjs'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPlaybackSource } from '../features/score-renderer/score-document'
import { ScoreExportDialog } from './ScoreExportDialog'
import type { ScoreExportDialogRef } from './ScoreExportDialog'
import 'abcjs/abcjs-audio.css'

type ScoreRendererProps = {
  abc: string
  compact?: boolean
  activeRange?: { startChar: number; endChar: number } | null
  onActiveRange?: (range: { startChar?: number; endChar?: number } | null) => void
  onNoteClick?: (range: { startChar: number; endChar: number }) => void
  onPaperBlur?: () => void
  showPrintButton?: boolean
  onPrintClick?: () => void
}

export interface ScoreRendererRef {
  openExport: () => void
}

type PlaybackController = InstanceType<typeof abcjs.synth.SynthController> & {
  go?: () => Promise<unknown>
  isLoaded?: boolean
  isLoading?: boolean
  seek?: (percent: number) => void
}

function withPlaybackExtensions(
  controller: InstanceType<typeof abcjs.synth.SynthController>,
): PlaybackController {
  return controller as PlaybackController
}

export const ScoreRenderer = forwardRef<ScoreRendererRef, ScoreRendererProps>(function ScoreRenderer({
  abc,
  compact = false,
  activeRange,
  onActiveRange,
  onNoteClick,
  onPaperBlur,
  showPrintButton = true,
  onPrintClick,
}: ScoreRendererProps, ref) {
  const paperRef = useRef<HTMLDivElement | null>(null)
  const audioRef = useRef<HTMLDivElement | null>(null)
  const exportDialogRef = useRef<ScoreExportDialogRef | null>(null)
  const synthControlRef = useRef<InstanceType<typeof abcjs.synth.SynthController> | null>(null)
  const playbackSpeedRef = useRef(100)

  useImperativeHandle(ref, () => ({
    openExport: () => exportDialogRef.current?.open(),
  }), [])
  const appliedPlaybackSpeedRef = useRef(100)
  const pendingSeekRef = useRef<number | null>(null)
  const highlightedElementsRef = useRef<Element[]>([])
  const cursorElementsRef = useRef<Array<{ startChar: number; endChar: number; svgEl: SVGElement }>>([])
  const [message, setMessage] = useState('')
  const [staffWidth, setStaffWidth] = useState(0)
  const [playbackProgress, setPlaybackProgress] = useState(0)
  const [playbackSpeed, setPlaybackSpeedValue] = useState(100)
  const [hasAudioControls, setHasAudioControls] = useState(false)
  const hasBassStaff = /^V:bass\b/m.test(abc)

  useEffect(() => {
    const paper = paperRef.current
    if (!paper) {
      return
    }

    const updateWidth = () => {
      const width = Math.floor(paper.clientWidth)
      setStaffWidth((current) => (current === width ? current : width))
    }

    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(paper)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const paper = paperRef.current
    if (!paper) {
      return
    }

    paper.innerHTML = ''
    if (audioRef.current) {
      audioRef.current.innerHTML = ''
    }
    highlightedElementsRef.current.forEach((element) => element.classList.remove('is-playing'))
    highlightedElementsRef.current = []
    cursorElementsRef.current = []
    onActiveRange?.(null)
    setMessage('')
    setPlaybackProgress(0)
    setHasAudioControls(false)
    synthControlRef.current = null
    pendingSeekRef.current = null

    try {
      const visualObjects = abcjs.renderAbc(paper, abc, {
        responsive: 'resize',
        add_classes: true,
        staffwidth: Math.max(320, staffWidth || (compact ? 620 : 820)),
        wrap: {
          preferredMeasuresPerLine: 0,
          minSpacing: 1.5,
          minSpacingLimit: 1.25,
          maxSpacing: 2.5,
          lastLineLimit: 1.5,
        },
        // abcjs otherwise applies its default red selection before invoking clickListener.
        selectionColor: 'currentColor',
        clickListener(abcElem) {
          if (abcElem.el_type === 'note' && abcElem.startChar !== undefined && abcElem.endChar !== undefined) {
            paper.focus({ preventScroll: true })
            onNoteClick?.({ startChar: abcElem.startChar, endChar: abcElem.endChar })
          }
        },
        paddingtop: 16,
        paddingbottom: 16,
      })

      const visualObject = visualObjects[0]
      cursorElementsRef.current = visualObject?.getSelectableArray().flatMap((selectable) => {
        const { startChar, endChar } = selectable.absEl.abcelem
        return startChar === undefined || endChar === undefined
          ? []
          : [{ startChar, endChar, svgEl: selectable.svgEl }]
      }) ?? []
      if (!visualObject || !audioRef.current || !abcjs.synth.supportsAudio()) {
        return
      }

      const playbackSource = createPlaybackSource(abc)
      const playbackVisualObject = playbackSource.abc === abc
        ? visualObject
        : abcjs.renderAbc(document.createElement('div'), playbackSource.abc, {
            add_classes: true,
            staffwidth: Math.max(320, staffWidth || (compact ? 620 : 820)),
            paddingtop: 16,
            paddingbottom: 16,
          })[0]

      const synthControl = new abcjs.synth.SynthController()
      synthControlRef.current = synthControl
      synthControl.load(
        audioRef.current,
        {
          onBeat(beatNumber, totalBeats) {
            const progress = totalBeats > 0 ? Math.max(0, Math.min(1, beatNumber / totalBeats)) : 0
            setPlaybackProgress((current) => (Math.abs(current - progress) < 0.002 ? current : progress))
          },
          onReady() {
            const controller = synthControlRef.current
            const pendingSeek = pendingSeekRef.current
            if (controller && pendingSeek !== null) {
              controller.setProgress(pendingSeek)
              const playbackController = withPlaybackExtensions(controller)
              playbackController.seek?.(pendingSeek)
              pendingSeekRef.current = null
            }
            if (controller && appliedPlaybackSpeedRef.current !== playbackSpeedRef.current) {
              appliedPlaybackSpeedRef.current = playbackSpeedRef.current
              controller.setWarp(playbackSpeedRef.current).catch(() => undefined)
            }
          },
          onEvent(event) {
            const startChars = event.startCharArray ?? (event.startChar === undefined ? [] : [event.startChar])
            const endChars = event.endCharArray ?? (event.endChar === undefined ? [] : [event.endChar])
            if (startChars.length === 0 || endChars.length === 0) {
              highlightedElementsRef.current.forEach((element) =>
                element.classList.remove('is-playing'),
              )
              highlightedElementsRef.current = []
              onActiveRange?.(null)
              return
            }
            if (event.milliseconds === 0) {
              setPlaybackProgress(0)
            }
            const ranges = startChars.map((startChar, index) => ({
              startChar: playbackSource.toOriginalPosition(startChar),
              endChar: playbackSource.toOriginalPosition(endChars[index] ?? endChars[0]),
            }))
            const elements = playbackVisualObject === visualObject
              ? event.elements?.flat().filter((element) => element instanceof Element) as Element[] ?? []
              : cursorElementsRef.current
                .filter((item) => ranges.some(
                  (range) => range.startChar < item.endChar && range.endChar > item.startChar,
                ))
                .map((item) => item.svgEl)
            highlightedElementsRef.current.forEach((element) => element.classList.remove('is-playing'))
            elements.forEach((element) => element.classList.add('is-playing'))
            highlightedElementsRef.current = elements
            onActiveRange?.(ranges[0])
          },
          onFinished() {
            highlightedElementsRef.current.forEach((element) =>
              element.classList.remove('is-playing'),
            )
            highlightedElementsRef.current = []
            onActiveRange?.(null)
            setPlaybackProgress(1)
          },
        },
        {
        displayLoop: false,
        displayRestart: false,
        displayPlay: true,
        displayProgress: false,
        displayWarp: false,
        },
      )
      setHasAudioControls(true)
      synthControl.setTune(playbackVisualObject, false, {
        soundFontUrl: '/soundfonts/FluidR3_GM/',
        soundFontVolumeMultiplier: 3,
      }).catch(() => {
        setMessage('当前浏览器需要用户交互后才能初始化音频。')
      })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ABC 渲染失败。')
    }
  }, [abc, compact, onActiveRange, onNoteClick, staffWidth])

  useEffect(() => {
    cursorElementsRef.current.forEach((item) => item.svgEl.classList.remove('is-cursor-active'))
    if (!activeRange) {
      return
    }

    cursorElementsRef.current.forEach((item) => {
      if (activeRange.startChar < item.endChar && activeRange.endChar > item.startChar) {
        item.svgEl.classList.add('is-cursor-active')
      }
    })
  }, [activeRange])

  const seekPlayback = (value: number) => {
    setPlaybackProgress(value)
    const synthControl = synthControlRef.current
    if (!synthControl) {
      return
    }

    const playbackController = withPlaybackExtensions(synthControl)
    if (playbackController.isLoaded) {
      synthControl.setProgress(value)
      playbackController.seek?.(value)
      return
    }

    pendingSeekRef.current = value
    if (!playbackController.isLoading) {
      playbackController.go?.().catch(() => {
        setMessage('当前浏览器无法初始化音频。')
      })
    }
  }

  const seekPlaybackFromPointer = (input: HTMLInputElement, clientX: number) => {
    const bounds = input.getBoundingClientRect()
    if (bounds.width === 0) {
      return
    }
    seekPlayback(Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)))
  }

  const setPlaybackSpeed = (value: number) => {
    setPlaybackSpeedValue(value)
    playbackSpeedRef.current = value
    const synthControl = synthControlRef.current
    if (synthControl && withPlaybackExtensions(synthControl).isLoaded) {
      appliedPlaybackSpeedRef.current = value
      synthControl.setWarp(value).catch(() => undefined)
    }
  }

  return (
    <section className={compact ? 'score-card compact' : 'score-card'}>
      <div
        ref={paperRef}
        className="score-paper"
        tabIndex={0}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            onPaperBlur?.()
          }
        }}
      />
      <div className="audio-controls">
        <div ref={audioRef} />
        {hasAudioControls && (
          <div className="playback-speed">
            <span>速度</span>
            <input
              type="range"
              min="50"
              max="200"
              step="5"
              value={playbackSpeed}
              aria-label="Playback speed"
              onChange={(event) => setPlaybackSpeed(Number(event.currentTarget.value))}
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
            aria-label="Playback position"
            onInput={(event) => seekPlayback(Number(event.currentTarget.value) / 1000)}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              seekPlaybackFromPointer(event.currentTarget, event.clientX)
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                seekPlaybackFromPointer(event.currentTarget, event.clientX)
              }
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
            }}
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
        abc={abc}
        hasBassStaff={hasBassStaff}
        onError={setMessage}
      />
      {message && <p className="render-message">{message}</p>}
    </section>
  )
})
