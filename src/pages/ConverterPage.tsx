import { useMemo, useState } from 'react'
import { ScoreRenderer } from '../components/ScoreRenderer'
import { SourceEditor } from '../components/SourceEditor'
import { TopNav } from '../components/TopNav'
import { happi123ToM3N } from '../lib/happi123-m3n'
import { abcToM3N, m3nToAbc } from '../lib/m3n-abc'

type InputFormat = 'abc' | 'happi123'

const samples: Record<InputFormat, string> = {
  abc: `X:1\nT:ABC example\nM:4/4\nL:1/4\nQ:1/4=100\nK:C\nC D E F | G A B c ||`,
  happi123: `{title:快乐123示例}\n{key_signature:C}\n{time_signature:4/4}\n{bpm:100}\n\n1 2 3 4 | 5 6 7 1' |||`,
}

export function ConverterPage() {
  const [format, setFormat] = useState<InputFormat>('abc')
  const [source, setSource] = useState(samples.abc)
  const [isResultOpen, setIsResultOpen] = useState(false)
  const result = useMemo(
    () => format === 'abc' ? abcToM3N(source) : happi123ToM3N(source),
    [format, source],
  )
  const score = useMemo(() => m3nToAbc(result.output), [result.output])
  const switchFormat = (nextFormat: InputFormat) => {
    setFormat(nextFormat)
    setSource(samples[nextFormat])
  }

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
            <div className="format-switch" role="group" aria-label="输入类型">
              <button type="button" className={format === 'abc' ? 'is-active' : ''} onClick={() => switchFormat('abc')}>ABC</button>
              <button type="button" className={format === 'happi123' ? 'is-active' : ''} onClick={() => switchFormat('happi123')}>Happi123</button>
            </div>
          </div>
          <div className="editor-header-right">
            <button type="button" className="action-button" onClick={() => setIsResultOpen(true)}>转换</button>
          </div>
        </header>
        <div className="editor-body">
          <section className="editor-pane">
            <SourceEditor
              value={source}
              ariaLabel={`${format} source`}
              onChange={(event) => setSource(event.currentTarget.value)}
            />
            {result.diagnostics.length > 0 && <ul className="diagnostics">{result.diagnostics.map((item) => <li key={item}>{item}</li>)}</ul>}
          </section>

          <section className="render-pane">
            <ScoreRenderer abc={score.output} showPrintButton={false} />
            {score.diagnostics.length > 0 && <ul className="diagnostics">{score.diagnostics.map((item) => <li key={item}>{item}</li>)}</ul>}
          </section>
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
