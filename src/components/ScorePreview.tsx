import { lazy, Suspense } from 'react'
import type { M3NDocument } from '../lib/m3n'

type ScorePreviewProps = {
  document: M3NDocument
  compact?: boolean
}

const StaffRenderer = lazy(async () => {
  const module = await import('./StaffRenderer')
  return { default: module.StaffRenderer }
})

export function ScorePreview({ document, compact = false }: ScorePreviewProps) {
  const title = document.meta.title || '未命名乐谱'
  const time = document.meta.time ?? `${document.state.beats}/${document.state.beatValue}`
  const tempo = document.state.tempo ?? '未设置'

  return (
    <section className={`score-preview${compact ? ' compact' : ''}`}>
      <header className="score-meta">
        <div>
          <div className="pane-label">乐谱预览</div>
          <h3>{title}</h3>
          {document.meta.subtitle ? <p>{document.meta.subtitle}</p> : null}
        </div>
        <dl>
          <div>
            <dt>调号</dt>
            <dd>{document.meta.key ?? document.state.key}</dd>
          </div>
          <div>
            <dt>拍号</dt>
            <dd>{time}</dd>
          </div>
          <div>
            <dt>速度</dt>
            <dd>{tempo}</dd>
          </div>
        </dl>
      </header>

      <Suspense fallback={<div className="staff-empty">正在加载五线谱渲染器...</div>}>
        <StaffRenderer document={document} compact />
      </Suspense>

      {document.diagnostics.length > 0 ? (
        <section className="diagnostic-panel">
          <div className="pane-label">解析诊断</div>
          <ul>
            {document.diagnostics.map((diagnostic) => (
              <li key={diagnostic.id}>{diagnostic.message}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  )
}
