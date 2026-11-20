import { useMemo } from 'react'
import type { ScoreDocument } from '@m3n/notation'
import { describeAccessibleScore } from '../lib/score-accessibility'
import type { NotationMode } from '../lib/renderer-settings'

export function ScoreAccessibleText({ score, notationMode, transpose, tempoScale }: { score: ScoreDocument; notationMode: NotationMode; transpose: number; tempoScale: number }) {
  const text = useMemo(() => {
    try {
      return describeAccessibleScore(score, { notationMode, transpose, tempoScale })
    } catch {
      // Incomplete editor input must not break the page or announce stale music.
      return { title: `${score.title || '乐谱'}，无障碍读谱`, summary: '当前乐谱尚无法生成读屏文本，请检查乐谱内容。', measures: [] }
    }
  }, [score, notationMode, transpose, tempoScale])
  return <section className="score-accessible-text" aria-label={text.title}>
    <h2>{text.title}</h2>
    <p>{text.summary}</p>
    {text.measures.map((measure, index) => <section key={index}>
      <h3>{measure.label}</h3>
      {measure.voices.map(voice => <div key={voice.name}>
        {measure.voices.length > 1 && <h4>{voice.name}</h4>}
        <ol>{voice.events.map((event, index) => <li key={index}>{event}</li>)}</ol>
      </div>)}
    </section>)}
  </section>
}
