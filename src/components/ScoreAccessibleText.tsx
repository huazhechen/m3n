import { useMemo } from 'react'
import type { ScoreDocument } from '@m3n/notation'
import { describeAccessibleScore } from '../lib/score-accessibility'
import type { NotationMode } from '../lib/renderer-settings'

export function ScoreAccessibleText({ score, notationMode, transpose, tempoScale }: { score: ScoreDocument; notationMode: NotationMode; transpose: number; tempoScale: number }) {
  const text = useMemo(() => {
    try {
      return describeAccessibleScore(score, { notationMode, transpose, tempoScale, forDisplay: true })
    } catch {
      // Incomplete editor input must not break the page or announce stale music.
      return { title: `${score.title || '乐谱'}，无障碍读谱`, summary: '当前乐谱尚无法生成读屏文本，请检查乐谱内容。', measures: [] }
    }
  }, [score, notationMode, transpose, tempoScale])
  return <section className="score-accessible-text" aria-label={text.title}>
    <details key={text.title}>
      <summary>无障碍读谱</summary>
      <p>{text.summary}</p>
      {text.measures.map(measure => <details key={measure.id} className="score-accessible-measure">
        <summary>{measure.label}</summary>
        {measure.voices.map(voice => <div key={voice.name}>
          {measure.voices.length > 1 && <p>{voice.name}</p>}
          {voice.events.map((event, index) => <p key={voice.eventIds[index] ?? index}>{event}</p>)}
        </div>)}
      </details>)}
    </details>
  </section>
}
