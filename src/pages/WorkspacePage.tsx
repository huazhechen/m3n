import { useDeferredValue, useState } from 'react'
import { Link } from 'react-router-dom'
import { ModeSwitcher, type WorkspaceMode } from '../components/ModeSwitcher'
import { ScorePreview } from '../components/ScorePreview'
import { SourceEditor } from '../components/SourceEditor'
import { parseM3N } from '../lib/m3n'

export function WorkspacePage() {
  const [source, setSource] = useState('')
  const [mode, setMode] = useState<WorkspaceMode>('compare')
  const deferredSource = useDeferredValue(source)
  const document = parseM3N(deferredSource)

  return (
    <main className="page-shell workspace-page">
      <header className="topbar">
        <Link to="/" className="brand">
          M3N
        </Link>
        <div className="topbar-actions">
          <Link to="/docs" className="ghost-button">
            查看文档
          </Link>
        </div>
      </header>

      <section className="workspace-header">
        <div>
          <p className="eyebrow">工作台</p>
          <h1>M3N 渲染器</h1>
          <p>在这里编辑 M3N 代码，并在编辑、五线谱和对照视图之间切换。</p>
        </div>
        <ModeSwitcher mode={mode} onChange={setMode} />
      </section>

      {mode === 'editor' ? (
        <section className="workspace-grid single">
          <SourceEditor value={source} onChange={setSource} />
        </section>
      ) : null}

      {mode === 'compare' ? (
        <section className="workspace-grid">
          <SourceEditor value={source} onChange={setSource} />
          <ScorePreview document={document} />
        </section>
      ) : null}

      {mode === 'staff' ? (
        <section className="workspace-grid single">
          <ScorePreview document={document} />
        </section>
      ) : null}
    </main>
  )
}
