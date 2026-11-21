import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { ScoreAccessibleText } from './ScoreAccessibleText'

describe('accessible reading structure', () => {
  it('offers expandable reading and escaped text without live announcements or per-note tab stops', () => {
    const html = renderToStaticMarkup(createElement(ScoreAccessibleText, {
      score: parseM3NDocument('{title=曲谱 <示例>}{2/4}\nN: 1 2 |||\nL: 春天'),
      notationMode: 'movable', transpose: 0, tempoScale: 1,
    }))
    expect(html).toContain('class="score-accessible-text"')
    expect(html).toContain('<summary>无障碍读谱</summary>')
    expect(html).toContain('<summary>第1小节，全曲结束</summary>')
    expect(html).toMatch(/<p>第1拍.*歌词“春”.*<\/p><p>第2拍.*歌词“天”/)
    expect(html).not.toContain('<ol>')
    expect(html).toContain('曲谱 &lt;示例&gt;')
    expect(html).not.toMatch(/aria-hidden|aria-live|tabindex|display:none|role="img"|<select|<button|<svg|<details open/)
  })
  it('keeps incomplete editor input from breaking the reader', () => {
    const score = parseM3NDocument('{title=尚未写完}\nN: (')
    const html = renderToStaticMarkup(createElement(ScoreAccessibleText, { score, notationMode: 'movable', transpose: 0, tempoScale: 1 }))
    expect(html).toContain('尚未写完，无障碍读谱')
    expect(html).not.toContain('<li>')
  })
})
