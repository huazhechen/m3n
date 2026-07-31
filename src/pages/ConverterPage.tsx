import { useMemo, useState } from 'react'
import { ScoreRenderer } from '../components/ScoreRenderer'
import { SourceEditor } from '../components/SourceEditor'
import { TopNav } from '../components/TopNav'
import { happi123ToM3N } from '../lib/happi123-m3n'
import { m3nToMei } from '../lib/m3n-mei'

const sample = `{title:快乐123示例}\n{key_signature:C}\n{time_signature:4/4}\n{bpm:100}\n\n1 2 3 4 | 5 6 7 1' |||`

export function ConverterPage() {
  const [source, setSource] = useState(sample)
  const [isResultOpen, setIsResultOpen] = useState(false)
  const result = useMemo(() => happi123ToM3N(source), [source])
  const score = useMemo(() => m3nToMei(result.output), [result.output])

  const copyResult = async () => {
    await navigator.clipboard.writeText(result.output)
    setIsResultOpen(false)
  }

  return (
    <main>
      <TopNav />
      <div className="editor-container">
        <header className="editor-header">
          <div className="editor-header-left">
            <h1>Happi123 转 M3N</h1>
          </div>
          <div className="editor-header-right">
            <button type="button" className="action-button" onClick={() => setIsResultOpen(true)}>转换</button>
          </div>
        </header>
        <div className="editor-body">
          <SourceEditor
            value={source}
            ariaLabel="Happi123 source"
            onChange={(event) => setSource(event.currentTarget.value)}
          />
          {result.diagnostics.length > 0 && <ul className="diagnostics editor-source-diagnostics">{result.diagnostics.map((item) => <li key={item}>{item}</li>)}</ul>}
          <ScoreRenderer
            mei={score.mei}
            title={score.title}
            hasBassStaff={score.hasBassStaff}
            headerMetadata={score.headerMetadata}
            sourceMap={score.sourceMap}
            accompaniment={score.accompaniment}
            tempoChanges={score.tempoChanges}
            tempo={score.tempo}
            showPrintButton={false}
          />
          {score.diagnostics.length > 0 && <ul className="diagnostics editor-render-diagnostics">{score.diagnostics.map((item) => <li key={item}>{item}</li>)}</ul>}
        </div>
      </div>
      {isResultOpen && (
        <div className="converter-dialog-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsResultOpen(false)
        }}>
          <section className="converter-dialog" role="dialog" aria-modal="true" aria-labelledby="converter-result-title">
            <div className="converter-dialog-header">
              <h2 id="converter-result-title">M3N 内容</h2>
              <button type="button" className="action-button" aria-label="关闭" onClick={() => setIsResultOpen(false)}>关闭</button>
            </div>
            <textarea className="converter-result" readOnly spellCheck={false} value={result.output} aria-label="M3N 内容" />
            <div className="converter-dialog-actions">
              <button type="button" className="action-button" onClick={() => void copyResult()}>一键复制</button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
