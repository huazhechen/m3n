// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { compileScore, RecordingPainter } from '@m3n/jpfun'
import { DefaultTextMeasurer } from './native-measure.js'
import { nativeAccidentalAdvance, nativeAccidentalGeometry } from './native-accidentals.js'
import { layoutNativeScore } from './native-layout.js'
import { NativeNumberedNotationScore } from './native-score.js'

const options = { width: 800, paged: false }
const layout = (music: string) => layoutNativeScore(parseM3NDocument(`{4/4}\nN: ${music} |||`), options)

describe('native accidental geometry', () => {

  for (const size of [15.4,22,32]) it.each([['♯','#'],['♭','b'],['♮','n']])('uses the full project %s contour at SIZEpx'.replace('SIZE',String(size)), (symbol,acc) => {
    const measurer = new DefaultTextMeasurer()
    const node = compileScore(`@set(fontsize=${size}) @n(1,acc="${acc}")`,{textMeasurer:measurer}).layout.objects[0]!
    const recording = new RecordingPainter();node.paint(recording)
    const reference = recording.commands.find(c=>c.kind==='path')!
    if(reference.kind!=='path')throw new Error('missing reference accidental')
    const baseline = recording.commands.find(c=>c.kind==='text')!
    if(baseline.kind!=='text')throw new Error('missing number baseline')
    const anchor = node.box.x+node.box.anchor
    const expected = reference.commands.flatMap(c=>c.op==='Z'?[]:c.op==='Q'
      ?[c.cx-anchor,c.cy-baseline.y,c.x-anchor,c.y-baseline.y]:c.op==='C'
      ?[c.cx1-anchor,c.cy1-baseline.y,c.cx2-anchor,c.cy2-baseline.y,c.x-anchor,c.y-baseline.y]
      :[c.x-anchor,c.y-baseline.y])
    const actual = nativeAccidentalGeometry(symbol,size,measurer.measureText('0',{fontSize:size}).w/2).paths[0]!
    expect(actual.d.match(/[MLCQZ]/g)).toEqual(reference.commands.map(c=>c.op))
    const coordinates = actual.d.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
    expect(coordinates).toHaveLength(expected.length)
    coordinates.forEach((value,index)=>expect(Math.abs(value - expected[index]!)).toBeLessThanOrEqual(.000000501))
    expect(actual.stroke).toBeCloseTo(reference.style!.strokeWidth!,12)
  })

  it('uses round caps and joins for key, range, main, chord and grace accidentals', () => {
    const source = '{key=Db}{4/4}\nN: 1#{ac(7b)} [2 4= 6:h] 3## 4bb |||'
    const root = new DOMParser().parseFromString(NativeNumberedNotationScore.create(parseM3NDocument(source)).render(options).join(''),'text/html')
    const paths = [...root.querySelectorAll('path[data-m3n-symbol]')]
    expect(root.querySelector('[data-m3n-role="pitch-range"] path[data-m3n-symbol]')).not.toBeNull()
    expect(root.querySelector('[data-m3n-role="grace"] path[data-m3n-symbol]')).not.toBeNull()
    expect(paths.some(path=>!path.closest('g.system'))).toBe(true)
    for(const path of paths){
      expect(path.getAttribute('stroke-linecap')).toBe('round')
      expect(path.getAttribute('stroke-linejoin')).toBe('round')
    }
  })

  it.each([13, 22])('keeps every symbol left of the number at size %s', size => {
    const halfBody = size / 4
    for (const symbol of ['♯', '♭', '♮', '♯♯', '♭♭']) {
      const geometry = nativeAccidentalGeometry(symbol, size, halfBody)
      expect(geometry.paths).toHaveLength([...symbol].length)
      expect(geometry.advance).toBe(nativeAccidentalAdvance(symbol, size))
      for (const path of geometry.paths) {
        const coordinates = path.d.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
        const xs = coordinates.filter((_, index) => index % 2 === 0)
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(-halfBody - geometry.advance)
        expect(Math.max(...xs)).toBeLessThan(-halfBody)
        expect(path.stroke).toBeCloseTo(size * 0.06)
      }
    }
  })

  it('reserves the widest accidental among all stacked chord tones', () => {
    const single = layout('1## 2 3 4').projection.glyphs[0]!
    const chord = layout('[1 3## 5:h] 2 3 4').projection.glyphs[0]!
    const plain = layout('[1 3 5:h] 2 3 4').projection.glyphs[0]!
    expect(chord.left).toBeCloseTo(single.left)
    expect(chord.left - plain.left).toBeCloseTo(nativeAccidentalAdvance('♯♯', 22))
    expect(chord.right).toBe(plain.right)
  })

  it('uses vectors for main notes, stacked tones and grace notes at their own sizes', () => {
    const source = '{4/4}\nN: 1#{ac(7b)} [2 4= 6:h] 3## 4bb |||'
    const svg = NativeNumberedNotationScore.create(parseM3NDocument(source)).render(options).join('')
    const root = new DOMParser().parseFromString(svg, 'text/html')
    expect([...root.querySelectorAll('g.note text')].some(node => /[♯♭♮]/.test(node.textContent ?? ''))).toBe(false)
    const symbols = [...root.querySelectorAll('g.system [data-m3n-role="accidental"] path')]
    expect(symbols.map(node => node.getAttribute('data-m3n-symbol'))).toEqual(['♯', '♭', '♮', '♯', '♯', '♭', '♭'])
    expect(symbols[0]!.getAttribute('stroke-width')).toBe('1.32')
    expect(symbols[1]!.getAttribute('stroke-width')).toBe('0.924')
    expect(root.querySelector('[data-m3n-role="grace"] text')!.getAttribute('font-size')).toBe('15.4')
  })

  it('omits repeated explicit accidentals and resets display state at a barline', () => {
    const score = layout('1# 1# 1= 1= | 1# 2 3 4')
    expect(score.projection.glyphs.slice(0, 5).map(glyph => glyph.pitches[0]!.accidental)).toEqual(['♯', '', '♮', '', '♯'])
    expect(score.projection.glyphs[1]!.left).toBe(score.projection.glyphs[3]!.left)
  })
})
