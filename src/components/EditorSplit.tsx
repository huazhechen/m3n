import { useId, useRef, useState, type ReactNode } from 'react'
import { readRendererSetting, writeRendererSetting } from '../lib/renderer-settings'

export function EditorSplit({ source, preview, children }: { source: ReactNode; preview: ReactNode; children?: ReactNode }) {
  const id = useId()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const body = useRef<HTMLDivElement>(null)
  const [share, setShare] = useState(() => readRendererSetting('m3n:editor-preview-share', 50, 25, 75))
  const [pane, setPane] = useState<'source' | 'preview'>('source')
  const changeShare = (value: number) => { const next = Math.max(25, Math.min(75, value)); setShare(next); writeRendererSetting('m3n:editor-preview-share', next) }
  return <>
    <div className="editor-tabs" role="tablist" aria-label="编辑工作区">
      {(['source', 'preview'] as const).map((value, index) => <button key={value} ref={element => { tabRefs.current[index] = element }} id={`${id}-${value}-tab`} aria-controls={`${id}-${value}`} tabIndex={pane === value ? 0 : -1} type="button" role="tab" aria-selected={pane === value} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index; setPane(next ? 'preview' : 'source'); tabRefs.current[next]?.focus() } }} onClick={() => setPane(value)}>{value === 'source' ? '源码' : '预览'}</button>)}
    </div>
    <div ref={body} className="editor-body resizable-editor" data-mobile-pane={pane} style={{ gridTemplateColumns: `minmax(0, ${share}fr) 8px minmax(0, ${100 - share}fr)` }}>
      <div className="editor-source-pane" role="tabpanel" id={`${id}-source`} aria-labelledby={`${id}-source-tab`}>{source}</div>
      <div role="separator" aria-label="调整源码与预览宽度" aria-orientation="vertical" aria-valuenow={Math.round(share)} aria-valuemin={25} aria-valuemax={75} tabIndex={0} className="editor-divider"
        onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); changeShare(event.key === 'Home' ? 25 : event.key === 'End' ? 75 : share + (event.key === 'ArrowRight' ? 5 : -5)) } }}
        onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId) && body.current) { const rect = body.current.getBoundingClientRect(); changeShare((event.clientX - rect.left) / rect.width * 100) } }}
        onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)} />
      <div className="editor-preview-pane" role="tabpanel" id={`${id}-preview`} aria-labelledby={`${id}-preview-tab`}>{preview}</div>
      {children}
    </div>
  </>
}
