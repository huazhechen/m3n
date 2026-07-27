import { lazy, Suspense } from 'react'
import type { M3NDocument } from '../lib/m3n'

type ComparisonViewProps = {
  document: M3NDocument
  source: string
  compact?: boolean
}

const StaffRenderer = lazy(async () => {
  const module = await import('./StaffRenderer')
  return { default: module.StaffRenderer }
})

function renderDurationLabel(depth: number, carets: number, dots: number) {
  const parts = [`层级 ${depth}`]
  if (carets > 0) {
    parts.push(`翻倍 ${carets}`)
  }
  if (dots > 0) {
    parts.push(`附点 ${dots}`)
  }
  return parts.join(' · ')
}

export function ComparisonView({
  document,
  source,
  compact = false,
}: ComparisonViewProps) {
  return (
    <section className={`compare-shell${compact ? ' compact' : ''}`}>
      <div className="compare-pane">
        <div className="pane-label">M3N 源码</div>
        <pre className="source-panel">
          <code>{source.trim() || '// 在这里输入 M3N 代码'}</code>
        </pre>
      </div>
      <div className="compare-pane">
        <div className="pane-label">对照渲染</div>
        <div className="render-panel">
          <header className="score-meta">
            <div>
              <h3>{document.meta.title || '未命名乐谱'}</h3>
              {document.meta.subtitle ? <p>{document.meta.subtitle}</p> : null}
            </div>
            <dl>
              <div>
                <dt>调号</dt>
                <dd>{document.meta.key ?? document.state.key}</dd>
              </div>
              <div>
                <dt>拍号</dt>
                <dd>{document.meta.time ?? `${document.state.beats}/${document.state.beatValue}`}</dd>
              </div>
              <div>
                <dt>速度</dt>
                <dd>{document.state.tempo ?? '未设置'}</dd>
              </div>
            </dl>
          </header>

          <Suspense fallback={<div className="staff-empty">正在加载五线谱渲染器...</div>}>
            <StaffRenderer document={document} compact />
          </Suspense>

          {document.lines.length === 0 ? (
            <div className="empty-render">输入 M3N 代码后，这里会显示对照渲染结果。</div>
          ) : (
            <div className="line-grid">
              {document.lines.map((line, lineIndex) => (
                <article key={line.id} className="line-card">
                  <div className="line-heading">第 {lineIndex + 1} 行</div>
                  <div className="token-list">
                    {line.events.length === 0 ? (
                      <span className="token ghost">空行</span>
                    ) : (
                      line.events.map((event) => {
                        if (event.kind === 'note') {
                          return (
                            <span key={event.id} className="token note">
                              {event.source}
                              <small>{renderDurationLabel(event.depth, event.carets, event.dots)}</small>
                            </span>
                          )
                        }

                        if (event.kind === 'group') {
                          return (
                            <span key={event.id} className="token chord">
                              {event.source}
                              <small>{event.mode === 'c' ? '和弦' : `${event.value} 连音组`}</small>
                            </span>
                          )
                        }

                        if (event.kind === 'barline') {
                          return (
                            <span key={event.id} className="token barline">
                              {event.source}
                            </span>
                          )
                        }

                        if (event.kind === 'attribute') {
                          return (
                            <span key={event.id} className="token attribute">
                              {event.source}
                              <small>{event.attributeType}</small>
                            </span>
                          )
                        }

                        return (
                          <span key={event.id} className="token error">
                            {event.source}
                          </span>
                        )
                      })
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {document.diagnostics.length > 0 ? (
            <section className="diagnostic-panel">
              <div className="pane-label">诊断</div>
              <ul>
                {document.diagnostics.map((diagnostic) => (
                  <li key={diagnostic.id}>{diagnostic.message}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  )
}
