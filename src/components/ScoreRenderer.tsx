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

function getHardLineBreaks(abc: string) {
  const lines = abc.split(/\r?\n/)
  const barPattern = /:\|\]|\|:|:\||\|\]|\|/g
  const breaks: number[] = []
  let measures = 0

  const isMusicLine = (line: string) => line.length > 0 && !/^[A-Za-z]:/.test(line) && !line.startsWith('%')

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!isMusicLine(line)) {
      continue
    }

    measures += line.match(barPattern)?.length ?? 0
    let nextMusicLine = false
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const next = lines[nextIndex].trim()
      if (!next || next.startsWith('%')) {
        continue
      }
      nextMusicLine = isMusicLine(next)
      break
    }

    if (nextMusicLine && measures > 0) {
      breaks.push(measures - 1)
    }
  }

  return breaks
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
  const highlightedElementsRef = useRef<Element[]>([])
  const cursorElementsRef = useRef<Array<{ startChar: number; endChar: number; svgEl: SVGElement }>>([])
  const [message, setMessage] = useState('')
  const [staffWidth, setStaffWidth] = useState(0)

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

    try {
      const hardLineBreaks = getHardLineBreaks(abc)
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
        lineBreaks: hardLineBreaks.length > 0 ? ([hardLineBreaks] as unknown as number[]) : undefined,
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
      synthControl.load(
        audioRef.current,
        {
          onEvent(event) {
            highlightedElementsRef.current.forEach((element) =>
              element.classList.remove('is-playing'),
            )
            if (event.startChar === undefined || event.endChar === undefined) {
              highlightedElementsRef.current = []
              onActiveRange?.(null)
              return
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
          },
        },
        {
        displayLoop: true,
        displayRestart: true,
        displayPlay: true,
        displayProgress: true,
        displayWarp: true,
        },
      )
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
      <div ref={audioRef} className="audio-controls" />
      {message && <p className="render-message">{message}</p>}
    </section>
  )
}
