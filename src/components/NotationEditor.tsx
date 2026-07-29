import { useCallback, useMemo, useRef, useState } from 'react'
import { m3nToAbc } from '../lib/m3n-abc'
import { sampleM3N } from '../lib/samples'
import { ScoreRenderer } from './ScoreRenderer'

type NotationEditorProps = {
  initialSource?: string
  embedded?: boolean
}

export function NotationEditor({
  initialSource = sampleM3N,
  embedded = false,
}: NotationEditorProps) {
  const [source, setSource] = useState(initialSource)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [isCursorHighlightActive, setIsCursorHighlightActive] = useState(false)
  const lineNumberRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const result = useMemo(() => m3nToAbc(source), [source])
  const lineNumbers = useMemo(
    () =>
      Array.from({ length: source.split('\n').length }, (_item, index) => String(index + 1)).join(
        '\n',
      ),
    [source],
  )
  const abc = result.output
  const cursorScoreRange = useMemo(() => {
    const mappedRange = result.sourceMap
      ?.filter((item) => item.sourceStart < cursorPosition)
      .at(-1)
    return mappedRange
      ? { startChar: mappedRange.outputStart, endChar: mappedRange.outputEnd }
      : null
  }, [cursorPosition, result.sourceMap])
  const activeScoreRange = isCursorHighlightActive ? cursorScoreRange : null

  const updateCursorPosition = useCallback((position: number) => {
    setCursorPosition(position)
    setIsCursorHighlightActive(true)
  }, [])

  const placeCursorAfterScoreNote = useCallback(
    ({ startChar, endChar }: { startChar: number; endChar: number }) => {
      const textarea = textareaRef.current
      const sourcePosition = result.sourceMap?.find(
        (item) => startChar < item.outputEnd && endChar > item.outputStart,
      )?.sourceEnd
      if (sourcePosition === undefined) {
        return
      }

      textarea?.setSelectionRange(sourcePosition, sourcePosition)
      updateCursorPosition(sourcePosition)
    },
    [result.sourceMap, updateCursorPosition],
  )

  const highlightSourceRange = useCallback(
    (range: { startChar?: number; endChar?: number } | null) => {
      const textarea = textareaRef.current
      if (!textarea) {
        return
      }

      if (!range || range.startChar === undefined || range.endChar === undefined) {
        textarea.setSelectionRange(textarea.selectionStart, textarea.selectionStart)
        return
      }
      const { startChar, endChar } = range

      const mappedRange = result.sourceMap?.find(
        (item) => startChar < item.outputEnd && endChar > item.outputStart,
      )
      if (!mappedRange) {
        return
      }

      textarea.setSelectionRange(mappedRange.sourceStart, mappedRange.sourceEnd)
    },
    [result.sourceMap],
  )

  return (
    <div className={embedded ? 'editor-grid embedded' : 'editor-grid'}>
      <section className="editor-pane">
        <div className="pane-toolbar">
          <div>
            <h2>编辑器</h2>
          </div>
        </div>
        <div className="source-editor">
          <div ref={lineNumberRef} className="line-numbers" aria-hidden="true">
            {lineNumbers}
          </div>
          <textarea
            ref={textareaRef}
            spellCheck={false}
            wrap="off"
            value={source}
            onChange={(event) => {
              setSource(event.target.value)
              updateCursorPosition(event.target.selectionStart)
            }}
            onSelect={(event) => updateCursorPosition(event.currentTarget.selectionStart)}
            onBlur={() => setIsCursorHighlightActive(false)}
            onScroll={(event) => {
              if (lineNumberRef.current) {
                lineNumberRef.current.scrollTop = event.currentTarget.scrollTop
              }
            }}
            aria-label="M3N source"
          />
        </div>
        {result.diagnostics.length > 0 && (
          <ul className="diagnostics">
            {result.diagnostics.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="render-pane">
        <div className="pane-toolbar">
          <div>
            <h2>五线谱</h2>
          </div>
        </div>
        <ScoreRenderer
          abc={abc}
          compact={embedded}
          activeRange={activeScoreRange}
          onActiveRange={highlightSourceRange}
          onNoteClick={placeCursorAfterScoreNote}
          onPaperBlur={() => setIsCursorHighlightActive(false)}
        />
      </section>
    </div>
  )
}
