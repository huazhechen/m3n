import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view'
import { StreamLanguage, syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import { autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands'
import { setDiagnostics } from '@codemirror/lint'
import { formatScoreDiagnostic, type ScoreDiagnostic } from '@m3n/notation'

export type SourceEditorHandle = { select: (start: number, end?: number, focus?: boolean) => void; selection: () => number }
type SourceEditorProps = {
  value: string
  ariaLabel: string
  onChange: (value: string, position: number) => void
  onSelect?: (position: number) => void
  onBlur?: () => void
  editorRef?: RefObject<SourceEditorHandle | null>
  readOnly?: boolean
  diagnostics?: ScoreDiagnostic[]
  onCompositionStart?: () => void
  onCompositionEnd?: () => void
}
const m3nLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null
    if (stream.match('//')) { stream.skipToEnd(); return 'comment' }
    if (stream.sol() && stream.match(/(?:N|B|C|L\d*|LW\d*):/)) return 'keyword'
    if (stream.match(/\{[^}]*\}/)) return 'attributeName'
    if (stream.match(/\|+|:\|+|\|+:/)) return 'operator'
    if (stream.match(/[0-7](?:[#bde^_.,~-])*/)) return 'number'
    if (stream.match(/[()[\]{}]/)) return 'bracket'
    stream.next(); return null
  },
})
const directives = ['key=C', '4/4', '6/8', '120qpm', 'title=', 'subtitle=', 'composer=', 'lyricist=', 'singer=', 'cresc', 'decres', 'lg', 'inst', '8va', '8vb', 'accel=120', 'rit=80', '/']
const readonlyConfig = new Compartment()

export function SourceEditor(props: SourceEditorProps) {
  const container = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const latest = useRef(props)
  useLayoutEffect(() => { latest.current = props })
  useLayoutEffect(() => {
    if (!container.current) return
    const view = new EditorView({ parent: container.current, state: EditorState.create({ doc: props.value, extensions: [
      lineNumbers(), history(), drawSelection(), highlightActiveLine(), bracketMatching(),
      m3nLanguage, syntaxHighlighting(defaultHighlightStyle),
      keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
      autocompletion({ override: [context => {
        const word = context.matchBefore(/\{[^}\s]*/)
        if (!word) return null
        return { from: word.from + 1, options: directives.map(label => ({ label, apply: `${label}}`, type: 'keyword' })) }
      }] }),
      EditorView.contentAttributes.of({ 'aria-label': props.ariaLabel, 'aria-multiline': 'true', role: 'textbox', spellcheck: 'false', autocapitalize: 'off' }),
      readonlyConfig.of(EditorState.readOnly.of(Boolean(props.readOnly))),
      EditorView.updateListener.of(update => {
        if (update.docChanged) latest.current.onChange(update.state.doc.toString(), update.state.selection.main.head)
        if (update.selectionSet) latest.current.onSelect?.(update.state.selection.main.head)
      }),
      EditorView.domEventHandlers({
        blur: () => { latest.current.onBlur?.() },
        compositionstart: () => { latest.current.onCompositionStart?.() },
        compositionend: () => { latest.current.onCompositionEnd?.() },
      }),
    ] }) })
    viewRef.current = view
    const handle: SourceEditorHandle = {
      select(start, end = start, focus = false) {
        const length = view.state.doc.length
        view.dispatch({ selection: { anchor: Math.min(start, length), head: Math.min(end, length) }, effects: EditorView.scrollIntoView(Math.min(start, length), { y: 'center' }) })
        if (focus) view.focus()
      },
      selection: () => view.state.selection.main.head,
    }
    if (props.editorRef) props.editorRef.current = handle
    return () => { view.destroy(); viewRef.current = null; if (props.editorRef) props.editorRef.current = null }
    // The view lives for this component's lifetime; updates go through transactions below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useLayoutEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === props.value) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: props.value } })
  }, [props.value])
  useLayoutEffect(() => { viewRef.current?.dispatch({ effects: readonlyConfig.reconfigure(EditorState.readOnly.of(Boolean(props.readOnly))) }) }, [props.readOnly])
  useLayoutEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch(setDiagnostics(view.state, (props.diagnostics ?? []).filter(item => item.range).map(item => ({
      from: Math.min(item.range!.start, view.state.doc.length), to: Math.min(Math.max(item.range!.start, item.range!.end), view.state.doc.length),
      severity: item.severity, message: formatScoreDiagnostic(item),
    }))))
  }, [props.diagnostics])
  return <div className="source-editor" ref={container} />
}
