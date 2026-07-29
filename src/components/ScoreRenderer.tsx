import abcjs from 'abcjs'
import { useEffect, useRef, useState } from 'react'
import 'abcjs/abcjs-audio.css'

type ScoreRendererProps = {
  abc: string
  compact?: boolean
  activeRange?: { startChar: number; endChar: number } | null
  onActiveRange?: (range: { startChar?: number; endChar?: number } | null) => void
  onNoteClick?: (range: { startChar: number; endChar: number }) => void
  onPaperBlur?: () => void
}

type PlaybackSource = {
  abc: string
  toOriginalPosition: (position: number) => number
}

function createPlaybackSource(abc: string): PlaybackSource {
  const lines = abc.match(/.*(?:\r?\n|$)/g)?.filter(Boolean) ?? []
  const header: string[] = []
  const segments = new Map<string, Array<{ value: string; originalStart: number }>>()
  let hasKey = false
  let partOrder: string[] | null = null
  let activePart: string | null = null
  let offset = 0

  for (const line of lines) {
    const content = line.replace(/\r?\n$/, '')
    if (!hasKey) {
      if (!partOrder && /^P:/.test(content)) {
        partOrder = content.slice(2).trim().split(/\s+/).filter(Boolean)
      } else {
        header.push(line)
      }
      hasKey = /^K:/.test(content)
      offset += line.length
      continue
    }

    if (!partOrder && /^P:/.test(content) && /\s/.test(content.slice(2).trim())) {
      partOrder = content.slice(2).trim().split(/\s+/).filter(Boolean)
      offset += line.length
      continue
    }

    if (/^P:/.test(content)) {
      activePart = content.slice(2).trim()
      if (!segments.has(activePart)) {
        segments.set(activePart, [])
      }
      offset += line.length
      continue
    }

    if (activePart) {
      segments.get(activePart)?.push({ value: line, originalStart: offset })
    } else {
      header.push(line)
    }
    offset += line.length
  }

  if (!partOrder || partOrder.length === 0 || partOrder.some((part) => !segments.has(part))) {
    return { abc, toOriginalPosition: (position) => position }
  }

  const mappings: Array<{ playbackStart: number; playbackEnd: number; originalStart: number }> = []
  let expanded = header.join('')
  for (const part of partOrder) {
    if (expanded.length > 0 && !expanded.endsWith('\n')) {
      expanded += '\n'
    }
    expanded += `P:${part}\n`
    for (const chunk of segments.get(part) ?? []) {
      const playbackStart = expanded.length
      expanded += chunk.value
      mappings.push({
        playbackStart,
        playbackEnd: expanded.length,
        originalStart: chunk.originalStart,
      })
    }
  }

  return {
    abc: expanded,
    toOriginalPosition(position) {
      const mapping = mappings.find(
        (item) => position >= item.playbackStart && position <= item.playbackEnd,
      )
      return mapping ? mapping.originalStart + position - mapping.playbackStart : position
    },
  }
}

export function ScoreRenderer({
  abc,
  compact = false,
  activeRange,
  onActiveRange,
  onNoteClick,
  onPaperBlur,
}: ScoreRendererProps) {
  const paperRef = useRef<HTMLDivElement | null>(null)
  const audioRef = useRef<HTMLDivElement | null>(null)
  const synthControlRef = useRef<InstanceType<typeof abcjs.synth.SynthController> | null>(null)
  const playbackSpeedRef = useRef(100)
  const appliedPlaybackSpeedRef = useRef(100)
  const pendingSeekRef = useRef<number | null>(null)
  const highlightedElementsRef = useRef<Element[]>([])
  const cursorElementsRef = useRef<Array<{ startChar: number; endChar: number; svgEl: SVGElement }>>([])
  const [message, setMessage] = useState('')
  const [staffWidth, setStaffWidth] = useState(0)
  const [playbackProgress, setPlaybackProgress] = useState(0)
  const [playbackSpeed, setPlaybackSpeedValue] = useState(100)
  const [hasAudioControls, setHasAudioControls] = useState(false)

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
              const playbackController = controller as unknown as { seek?: (percent: number) => void }
              playbackController.seek?.(pendingSeek)
              pendingSeekRef.current = null
            }
            if (controller && appliedPlaybackSpeedRef.current !== playbackSpeedRef.current) {
              appliedPlaybackSpeedRef.current = playbackSpeedRef.current
              controller.setWarp(playbackSpeedRef.current).catch(() => undefined)
            }
          },
          onEvent(event) {
            highlightedElementsRef.current.forEach((element) =>
              element.classList.remove('is-playing'),
            )
            if (event.startChar === undefined || event.endChar === undefined) {
              highlightedElementsRef.current = []
              onActiveRange?.(null)
              return
            }
            if (event.milliseconds === 0) {
              setPlaybackProgress(0)
            }
            const startChar = playbackSource.toOriginalPosition(event.startChar)
            const endChar = playbackSource.toOriginalPosition(event.endChar)
            const elements = cursorElementsRef.current
              .filter((item) => startChar < item.endChar && endChar > item.startChar)
              .map((item) => item.svgEl)
            elements.forEach((element) => element.classList.add('is-playing'))
            highlightedElementsRef.current = elements
            onActiveRange?.({ startChar, endChar })
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
      synthControl.setTune(playbackVisualObject, false).catch(() => {
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
    const synthControl = synthControlRef.current as (InstanceType<typeof abcjs.synth.SynthController> & {
      isLoaded?: boolean
    }) | null
    if (!synthControl) {
      return
    }

    if (synthControl.isLoaded) {
      synthControl.setProgress(value)
      const playbackController = synthControl as unknown as { seek?: (percent: number) => void }
      playbackController.seek?.(value)
      return
    }

    pendingSeekRef.current = value
    const playbackController = synthControl as unknown as {
      go?: () => Promise<unknown>
      isLoading?: boolean
    }
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
    const synthControl = synthControlRef.current as (InstanceType<typeof abcjs.synth.SynthController> & {
      isLoaded?: boolean
    }) | null
    if (synthControl?.isLoaded) {
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
      </div>
      {message && <p className="render-message">{message}</p>}
    </section>
  )
}
