import { describe, expect, it } from 'vitest' 
import { m3nToMei } from '@m3n/notation'
import { scoreHeaderHeight, withScoreHeader } from './score-header-svg'

describe('score SVG header', () => {
  it('adds metadata above the Verovio engraving without changing its scale', () => {
    const svg = withScoreHeader('<svg viewBox="0 0 800 100"><svg class="definition-scale" viewBox="0 0 19050 2380"></svg></svg>', [
      { value: 'Title', side: 'center', priority: 0 },
      { value: 'Composer', side: 'right', priority: 20 },
    ])

    expect(svg).toContain('<g class="m3n-score-header">')
    expect(svg).toContain('font-size="32"')
    expect(svg).toContain('font-size="14"')
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

  it('includes each labelled credit on its own row in staff SVG exports', () => {
    const { headerMetadata } = m3nToMei('{title=曲名}{subtitle=副标题}{lyricist=词作者}{composer=曲作者}{arranger=编曲者}{singer=演唱者}\n1--- |||')
    for (const width of [320, 800]) {
      const svg = withScoreHeader(`<svg viewBox="0 0 ${width} 100"><svg class="definition-scale"></svg></svg>`, headerMetadata)
      const lines = [...svg.matchAll(/<text[^>]*y="([\d.]+)"[^>]*>([^<]*)<\/text>/g)]
      expect(lines.map(line => line[2])).toEqual(['曲名', '副标题', '作词：词作者', '作曲：曲作者', '编曲：编曲者', '演唱：演唱者'])
      const baselines = lines.map(line => Number(line[1]))
      expect(baselines.every((y, index) => index === 0 || y > baselines[index - 1]!)).toBe(true)
      expect(svg).toContain(`y="${scoreHeaderHeight(headerMetadata)}" width="${width}" height="100"`)
      expect(svg).toContain('text-anchor="end"')
    }
  })
})
