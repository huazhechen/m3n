import abcjs from 'abcjs'
import { useEffect, useRef, useState } from 'react'
import 'abcjs/abcjs-audio.css'

type ScoreRendererProps = {
  abc: string
  compact?: boolean
  onActiveRange?: (range: { startChar?: number; endChar?: number } | null) => void
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

export function ScoreRenderer({ abc, compact = false, onActiveRange }: ScoreRendererProps) {
  const paperRef = useRef<HTMLDivElement | null>(null)
  const audioRef = useRef<HTMLDivElement | null>(null)
  const highlightedElementsRef = useRef<Element[]>([])
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
        clickListener(abcElem) {
          if (abcElem.el_type === 'note' && abcElem.startChar !== undefined && abcElem.endChar !== undefined) {
            onActiveRange?.({ startChar: abcElem.startChar, endChar: abcElem.endChar })
          }
        },
        paddingtop: 16,
        paddingbottom: 16,
      })

      const visualObject = visualObjects[0]
      if (!visualObject || !audioRef.current || !abcjs.synth.supportsAudio()) {
        return
      }

      const synthControl = new abcjs.synth.SynthController()
      synthControl.load(
        audioRef.current,
        {
          onEvent(event) {
            highlightedElementsRef.current.forEach((element) =>
              element.classList.remove('is-playing'),
            )
            const elements = event.elements?.flat() ?? []
            elements.forEach((element) => element.classList.add('is-playing'))
            highlightedElementsRef.current = elements
            onActiveRange?.({ startChar: event.startChar, endChar: event.endChar })
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
      synthControl.setTune(visualObject, false).catch(() => {
        setMessage('当前浏览器需要用户交互后才能初始化音频。')
      })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ABC 渲染失败。')
    }
  }, [abc, compact, onActiveRange, staffWidth])

  return (
    <section className={compact ? 'score-card compact' : 'score-card'}>
      <div ref={paperRef} className="score-paper" />
      <div ref={audioRef} className="audio-controls" />
      {message && <p className="render-message">{message}</p>}
    </section>
  )
}
