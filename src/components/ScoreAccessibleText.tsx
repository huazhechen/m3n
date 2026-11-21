import { useEffect, useId, useMemo, useState, type RefObject } from 'react'
import type { ScoreDocument } from '@m3n/notation'
import { describeAccessibleScore } from '../lib/score-accessibility'
import { currentReadingMeasure, focusScoreMeasure, rememberScorePosition, resumeScoreReading } from '../lib/score-reading-dom'
import type { NotationMode } from '../lib/renderer-settings'

const overviewSize = 8
const measureName = (label: string) => label.split('，')[0]!

export function ScoreAccessibleText({ score, notationMode, transpose, tempoScale, paperRef }: { score: ScoreDocument; notationMode: NotationMode; transpose: number; tempoScale: number; paperRef?: RefObject<HTMLDivElement | null> }) {
  const [position, setPosition] = useState({ score, index: 0 })
  const measureSelectId = useId()
  const text = useMemo(() => {
    try {
      return describeAccessibleScore(score, { notationMode, transpose, tempoScale, forDisplay: true })
    } catch {
      // Incomplete editor input must not break the page or announce stale music.
      return { title: `${score.title || '乐谱'}，无障碍读谱`, summary: '当前乐谱尚无法生成读屏文本，请检查乐谱内容。', measures: [] }
    }
  }, [score, notationMode, transpose, tempoScale])
  useEffect(() => {
    const paper = paperRef?.current
    if (!paper) return
    const sync = () => {
      const id = currentReadingMeasure(paper)
      const index = text.measures.findIndex(measure => measure.id === id)
      if (index >= 0) setPosition(previous => previous.score === score && previous.index === index ? previous : { score, index })
    }
    const remember = (event: Event) => {
      rememberScorePosition(paper, event.target as Element)
    }
    paper.addEventListener('score-reading-change', sync)
    paper.addEventListener('focusin', remember)
    paper.addEventListener('pointerdown', remember)
    return () => {
      paper.removeEventListener('score-reading-change', sync)
      paper.removeEventListener('focusin', remember)
      paper.removeEventListener('pointerdown', remember)
    }
  }, [paperRef, score, text])
  const groups = Array.from({ length: Math.ceil(text.measures.length / overviewSize) }, (_, index) => {
    const measures = text.measures.slice(index * overviewSize, (index + 1) * overviewSize)
    return { measures, range: `${measureName(measures[0]!.label)}至${measureName(measures.at(-1)!.label)}` }
  })
  const index = position.score === score ? Math.min(position.index, Math.max(0, text.measures.length - 1)) : 0
  const jump = () => {
    const id = text.measures[index]?.id
    if (id) {
      focusScoreMeasure(paperRef?.current ?? null, id)
    }
  }
  return <section className="score-accessible-text" aria-label={text.title}>
    <details>
      <summary>无障碍读谱（简略全谱与小节跳转）</summary>
      <h2>{text.title}</h2>
      <p>{text.summary}</p>
      <p>详细读谱位于谱面中的对应小节，可触摸浏览或按组阅读。小节与音符说明仅供读屏，不显示在谱面上。</p>
      <details className="score-accessible-overview">
        <summary>简略全谱</summary>
        <p>仅保留数字音级和升降号，0表示休止，竖线分隔小节，括号内的音同时奏出。省略八度、节奏、歌词和表情；反复与演奏顺序见小节说明。{notationMode === 'fixed' ? '使用固定调数字。' : '使用首调数字。'}</p>
        {groups.map((item, index) => <section key={index}>
          <h3>{item.range}</h3>
          {[...new Set(item.measures.flatMap(measure => measure.voices.map(voice => voice.name)))].map(name => <p key={name}>
            {item.measures.some(measure => measure.voices.length > 1) && `${name}：`}
            {item.measures.map(measure => measure.voices.find(voice => voice.name === name)?.compact || '0').join(' | ')} |
          </p>)}
        </section>)}
      </details>
      {text.measures.length > 0 && <nav className="score-accessible-pages" aria-label="读谱小节跳转">
        <label htmlFor={measureSelectId}>选择小节</label>
        <select id={measureSelectId} value={index} onChange={event => setPosition({ score, index: Number(event.target.value) })}>
          {text.measures.map((measure, index) => <option key={measure.id} value={index}>{measure.label}</option>)}
        </select>
        <button type="button" onClick={jump}>跳转到所选小节</button>
        <button type="button" onClick={() => resumeScoreReading(paperRef?.current ?? null, text.measures[index]!.id)}>继续阅读小节</button>
      </nav>}
    </details>
  </section>
}
