import abcjs from 'abcjs'
import { useEffect, useRef, useState } from 'react'
import 'abcjs/abcjs-audio.css'

type ScoreRendererProps = {
  abc: string
  compact?: boolean
  onActiveRange?: (range: { startChar?: number; endChar?: number } | null) => void
}

export function ScoreRenderer({ abc, compact = false, onActiveRange }: ScoreRendererProps) {
  const paperRef = useRef<HTMLDivElement | null>(null)
  const audioRef = useRef<HTMLDivElement | null>(null)
  const highlightedElementsRef = useRef<Element[]>([])
  const [message, setMessage] = useState('')

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
      const visualObjects = abcjs.renderAbc(paper, abc, {
        responsive: 'resize',
        add_classes: true,
        staffwidth: compact ? 620 : 820,
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
  }, [abc, compact, onActiveRange])

  return (
    <section className={compact ? 'score-card compact' : 'score-card'}>
      <div ref={paperRef} className="score-paper" />
      <div ref={audioRef} className="audio-controls" />
      {message && <p className="render-message">{message}</p>}
    </section>
  )
}
