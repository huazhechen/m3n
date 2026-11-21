import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ScoreDocument } from '@m3n/notation'
import { describeAccessibleScore } from '../lib/score-accessibility'
import type { NotationMode } from '../lib/renderer-settings'

const pageSize = 8
const measureName = (label: string) => label.split('，')[0]!

export function ScoreAccessibleText({ score, notationMode, transpose, tempoScale }: { score: ScoreDocument; notationMode: NotationMode; transpose: number; tempoScale: number }) {
  const [position, setPosition] = useState({ score, page: 0 })
  const heading = useRef<HTMLHeadingElement>(null)
  const focusNewPage = useRef(false)
  const pageSelectId = useId()
  const text = useMemo(() => {
    try {
      return describeAccessibleScore(score, { notationMode, transpose, tempoScale })
    } catch {
      // Incomplete editor input must not break the page or announce stale music.
      return { title: `${score.title || '乐谱'}，无障碍读谱`, summary: '当前乐谱尚无法生成读屏文本，请检查乐谱内容。', measures: [] }
    }
  }, [score, notationMode, transpose, tempoScale])
  const pages = Array.from({ length: Math.ceil(text.measures.length / pageSize) }, (_, index) => {
    const measures = text.measures.slice(index * pageSize, (index + 1) * pageSize)
    return { measures, range: `${measureName(measures[0]!.label)}至${measureName(measures.at(-1)!.label)}` }
  })
  const page = position.score === score ? Math.min(position.page, Math.max(0, pages.length - 1)) : 0
  useEffect(() => {
    if (!focusNewPage.current) return
    focusNewPage.current = false
    heading.current?.focus()
  }, [page])
  const changePage = (next: number) => {
    focusNewPage.current = true
    setPosition({ score, page: next })
  }
  return <section className="score-accessible-text" aria-label={text.title}>
    <details>
      <summary>无障碍读谱（简略全谱与分段详解）</summary>
      <h2>{text.title}</h2>
      <p>{text.summary}</p>
      <details className="score-accessible-overview">
        <summary>简略全谱</summary>
        <p>仅保留数字音级和升降号，0表示休止，竖线分隔小节，括号内的音同时奏出。省略八度、节奏、歌词和表情；反复与演奏顺序见详解。{notationMode === 'fixed' ? '使用固定调数字。' : '使用首调数字。'}</p>
        {pages.map((item, index) => <section key={index}>
          <h3>{item.range}</h3>
          {[...new Set(item.measures.flatMap(measure => measure.voices.map(voice => voice.name)))].map(name => <p key={name}>
            {item.measures.some(measure => measure.voices.length > 1) && `${name}：`}
            {item.measures.map(measure => measure.voices.find(voice => voice.name === name)?.compact || '0').join(' | ')} |
          </p>)}
        </section>)}
      </details>
      {pages.length > 0 && <>
        <h3 ref={heading} tabIndex={-1}>逐音详解，第{page + 1}页，共{pages.length}页，{pages[page]!.range}</h3>
        <nav className="score-accessible-pages" aria-label="读谱文本翻页">
          <button type="button" disabled={page === 0} onClick={() => changePage(page - 1)}>上一页</button>
          <label htmlFor={pageSelectId}>跳转小节范围</label>
          <select id={pageSelectId} value={page} onChange={event => changePage(Number(event.target.value))}>
            {pages.map((item, index) => <option key={index} value={index}>第{index + 1}页，{item.range}</option>)}
          </select>
          <button type="button" disabled={page === pages.length - 1} onClick={() => changePage(page + 1)}>下一页</button>
          <button type="button" onClick={() => heading.current?.focus()}>继续阅读本页</button>
        </nav>
        {pages[page]!.measures.map((measure, index) => <section key={page * pageSize + index}>
          <h4>{measure.label}</h4>
          {measure.voices.map(voice => <div key={voice.name}>
            {measure.voices.length > 1 && <h5>{voice.name}</h5>}
            <ol>{voice.events.map((event, index) => <li key={index}>{event}</li>)}</ol>
          </div>)}
        </section>)}
      </>}
    </details>
  </section>
}
