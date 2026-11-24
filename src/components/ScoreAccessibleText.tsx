import { useMemo } from 'react'
import type { ScoreDocument } from '@m3n/notation'
import { describeAccessibleScore } from '../lib/score-accessibility'
import type { NotationMode } from '../lib/renderer-settings'

const overviewSize = 8
const measureName = (label: string) => label.split('，')[0]!

export function ScoreAccessibleText({ score, notationMode, transpose, tempoScale }: { score: ScoreDocument; notationMode: NotationMode; transpose: number; tempoScale: number }) {
  const text = useMemo(() => {
    try {
      return describeAccessibleScore(score, { notationMode, transpose, tempoScale, forDisplay: true })
    } catch {
      // Incomplete editor input must not break the page or announce stale music.
      return { title: `${score.title || '乐谱'}，无障碍读谱`, summary: '当前乐谱尚无法生成读屏文本，请检查乐谱内容。', measures: [] }
    }
  }, [score, notationMode, transpose, tempoScale])
  const groups = Array.from({ length: Math.ceil(text.measures.length / overviewSize) }, (_, index) => {
    const measures = text.measures.slice(index * overviewSize, (index + 1) * overviewSize)
    return { measures, range: `${measureName(measures[0]!.label)}至${measureName(measures.at(-1)!.label)}` }
  })
  return <section className="score-accessible-text" aria-label={text.title}>
    <details key={text.title}>
      <summary>无障碍读谱</summary>
      <p>{text.summary}</p>
      <details className="score-accessible-overview">
        <summary>简略全谱</summary>
        <p>数字表示音级，0表示休止，竖线分隔小节，括号表示同时演奏；省略八度、节奏、歌词和表情。{notationMode === 'fixed' ? '使用固定调数字。' : '使用首调数字。'}</p>
        {groups.map(({ measures, range }, index) => <section key={index}>
          <h3>{range}</h3>
          {[...new Set(measures.flatMap(measure => measure.voices.map(voice => voice.name)))].map(name => <p key={name}>
            {measures.some(measure => measure.voices.length > 1) && `${name}：`}
            {measures.map(measure => measure.voices.find(voice => voice.name === name)?.compact || '0').join(' | ')} |
          </p>)}
        </section>)}
      </details>
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
