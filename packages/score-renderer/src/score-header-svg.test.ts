import { describe, expect, it } from 'vitest' 
import { scoreHeaderHeight, withScoreHeader } from './score-header-svg'

describe('score SVG header', () => {
  it('adds metadata above the Verovio engraving without changing its scale', () => {
    const svg = withScoreHeader('<svg viewBox="0 0 800 100"><svg class="definition-scale" viewBox="0 0 19050 2380"></svg></svg>', [
      { value: 'Title', side: 'center', priority: 0 },
      { value: 'Composer', side: 'right', priority: 20 },
    ])

    expect(svg).toContain('<g class="m3n-score-header">')
    expect(svg).toContain('>Title</text>')
    expect(svg).toContain('viewBox="0 0 800 212"')
    expect(svg).toContain('class="definition-scale" viewBox="0 0 19050 2380" x="0" y="112" width="800" height="100"')
  })

  it('leaves an SVG without metadata unchanged', () => {
    const source = '<svg viewBox="0 0 800 100"><svg class="definition-scale" viewBox="0 0 19050 2380"></svg></svg>'

    expect(withScoreHeader(source, [])).toBe(source)
    expect(scoreHeaderHeight([])).toBe(0)
  })

  it('reports the vertical space added by the header', () => {
    expect(scoreHeaderHeight([
      { value: 'Title', side: 'center', priority: 0 },
      { value: 'Composer', side: 'right', priority: 20 },
    ])).toBe(112)
  })
})
