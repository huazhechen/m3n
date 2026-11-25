// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { renderNativePages } from './native-svg.js'
import { nativeGraceGeometry } from './native-grace.js'
import { nativeSvgInk } from './native-ink.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import { nativeNoteBody } from './native-note-body.js'
import { nativeAccidentalAdvance } from './native-accidentals.js'
import { nativeStyle } from './native-style.js'

const normal = new DefaultTextMeasurer()
const unusual: TextMeasurer = { measureText(text, style) {
  const advance = text.length * style.fontSize * (style.fontSize === (nativeStyle.music * .6) ? 1.3 : 0.58)
  const overhang = style.fontSize * 0.15
  return {w: advance + overhang, h:style.fontSize * 1.1, baseline:style.fontSize * 0.85, advance, inkLeft:-overhang, inkRight:advance, centerOffset:-overhang / 2}
} }
const layout = (music: string, textMeasurer: TextMeasurer = normal, width = 800, minimumNoteGap?: number) => layoutNativeScore(parseM3NDocument(`{4/4}\nN: ${music} |||`),{width,paged:false,textMeasurer,minimumNoteGap})

describe('measured native grace blocks', () => {
  it('uses the ordinary font-relative beam stroke and reserves both round caps', () => {
    const grace = nativeGraceGeometry([{degree:'4',accidental:'',octave:0}],6,normal)
    const root = new DOMParser().parseFromString(`<svg>${grace.svg}</svg>`,'image/svg+xml')
    const beam = root.querySelector('line')!
    const body = nativeNoteBody(normal,grace.size)
    expect(Number(beam.getAttribute('stroke-width'))).toBeCloseTo(body.beamStroke,4)
    expect(beam.getAttribute('stroke-linecap')).toBe('round')
    expect(grace.width).toBeCloseTo(body.width+body.beamStroke,3)
  })

  it('paints connected grace beams and the hook with their measured round ends', () => {
    const grace = nativeGraceGeometry(['2','3'].map(degree=>({degree,accidental:'',octave:0})),6,normal)
    const root = new DOMParser().parseFromString(`<svg>${grace.svg}</svg>`,'image/svg+xml')
    for (const beam of root.querySelectorAll('line')) expect(beam.getAttribute('stroke-linecap')).toBe('round')
    const hook=root.querySelector('path')!
    expect(hook.getAttribute('stroke-linecap')).toBe('round')
    expect(hook.getAttribute('stroke-linejoin')).toBe('round')
  })

  it.each([[.25, .125, .125, 3], [.125, .25, .125, 4]])(
    'paints each connected grace beam once for durations %s, %s, %s', (a, b, c, count) => {
      const grace = nativeGraceGeometry([a, b, c].map((writtenBeats, index) => ({ degree: String(index + 2), accidental: '', octave: 0, writtenBeats })), 6, normal)
      const root = new DOMParser().parseFromString(`<svg>${grace.svg}</svg>`, 'image/svg+xml')
      const beams = [...root.querySelectorAll('line')]
      expect(beams).toHaveLength(count)
      const ink = beams.map(beam => {
        const transform = beam.parentElement?.getAttribute('transform')
        return nativeSvgInk(transform ? `<g transform="${transform}">${beam.outerHTML}</g>` : beam.outerHTML, normal)
      })
      for (const [index, beam] of ink.entries()) for (const other of ink.slice(index + 1)) {
        if (Math.abs(beam.top - other.top) > .001) continue
        expect(Math.min(beam.right, other.right) - Math.max(beam.left, other.left)).toBeLessThanOrEqual(.001)
      }
    })


  it.each(['♭', '♮'])('keeps the logical accidental margin as well as actual grace paint: %s', accidental => {
    const pitches = ['4', '5'].map(degree => ({degree, accidental, octave:-1}))
    const grace = nativeGraceGeometry(pitches,6,normal)
    const body = nativeNoteBody(normal,grace.size)
    const logicalLeft = -body.width / 2 - nativeAccidentalAdvance(accidental,grace.size)
    const [first, second] = grace.notes
    expect(second!.x + second!.ink.left - (first!.x + first!.ink.right)).toBeCloseTo(0,3)
    expect(-grace.left).toBeLessThanOrEqual(first!.x + logicalLeft + .0001)
    expect(grace.left - 6 - grace.sideGap).toBeCloseTo(grace.width,3)
    for (const note of grace.notes) expect(note.x + note.ink.left).toBeGreaterThanOrEqual(-grace.left - .0001)
  })

  it.each([normal, unusual])('keeps zero ink gap across mixed durations, accidentals and octaves', measurer => {
    const grace = nativeGraceGeometry([
      { degree: '2', accidental: '', octave: 2, writtenBeats: .5 },
      { degree: '3', accidental: '♯', octave: -2, writtenBeats: .125 },
      { degree: '4', accidental: '♭', octave: 0, writtenBeats: .25 },
    ], 6, measurer)
    for (const [index, note] of grace.notes.entries()) {
      const previous = grace.notes[index - 1]
      if (previous) expect(note.x + note.ink.left - previous.x - previous.ink.right).toBeCloseTo(0, 6)
    }
  })

  it('retains subdivisions and joins the common levels of a mixed-depth group', () => {
    const score = layout('1{ac(2)}{ap((3 4))} 2 3 4')
    const glyph = score.projection.glyphs[0]!
    expect(glyph.graces.map(g => g.writtenBeats)).toEqual([0.25,0.125,0.125])
    const root = new DOMParser().parseFromString(renderNativePages(score).join(''),'text/html')
    const grace = root.querySelector('[data-m3n-role="grace"]')!
    const notes = [...grace.querySelectorAll('[data-m3n-role="grace-note"]')]
    expect(notes.map(n => n.getAttribute('data-m3n-beams'))).toEqual(['2','3','3'])
    expect(notes.map(n => n.querySelectorAll('line').length)).toEqual([0,0,0])
    expect(grace.querySelectorAll(':scope > line')).toHaveLength(3)
    expect([...grace.querySelectorAll('text')].map(n => n.getAttribute('font-size'))).toEqual(['14.4','14.4','14.4'])
    expect(grace.querySelector('path:not([data-m3n-symbol])')!.getAttribute('d')).toContain(' C')
  })

  it('measures wider fonts and accidentals instead of reserving a fixed width per grace', () => {
    const plain = layout('1{ac(2 3)} 2 3 4').projection.glyphs[0]!
    const changed = layout('1{ac(2 3)} 2 3 4',unusual).projection.glyphs[0]!
    const accidental = layout('1{ac(2## 3bb)} 2 3 4').projection.glyphs[0]!
    expect(changed.graceLayout!.width).toBeGreaterThan(plain.graceLayout!.width)
    expect(accidental.graceLayout!.width).toBeGreaterThan(plain.graceLayout!.width)
    expect(changed.musicLeft!).toBeGreaterThan(plain.musicLeft!)
    expect(accidental.musicLeft!).toBeGreaterThan(plain.musicLeft!)
  })

  it.each([normal, unusual])('reserves every painted piece, including beams, hook and extreme octave marks', textMeasurer => {
    const score = layout('1 2{ac(3##ee 4bbdd)} 3 4',textMeasurer,320)
    const glyph = score.projection.glyphs[1]!, grace = glyph.graceLayout!
    const root = new DOMParser().parseFromString(renderNativePages(score).join(''),'text/html')
    const group = root.querySelector(`#${glyph.id} [data-m3n-role="grace"]`)!
    const ink = nativeSvgInk(group.outerHTML,textMeasurer)
    expect(ink.left).toBeGreaterThanOrEqual(-glyph.musicLeft! - 0.0001)
    expect(ink.right).toBeLessThanOrEqual(glyph.musicRight! + 0.0001)
    expect(ink.top).toBeGreaterThanOrEqual(-glyph.musicTop! - 0.0001)
    expect(ink.bottom).toBeLessThanOrEqual(glyph.musicBottom! + 0.0001)
    expect(grace.notes[0]!.x + grace.notes[0]!.ink.right).toBeCloseTo(grace.notes[1]!.x + grace.notes[1]!.ink.left, 6)
  })

  it('keeps grace beams below the actual digit ink even for a font with no descent', () => {
    const noDescent: TextMeasurer = {measureText(text,style) {return {w:text.length*style.fontSize*.6,h:style.fontSize*.7,baseline:style.fontSize*.7}}}
    const grace = layout('1{ac(2)} 2 3 4',noDescent).projection.glyphs[0]!.graceLayout!
    const root = new DOMParser().parseFromString(`<svg>${grace.svg}</svg>`,'image/svg+xml')
    const note = root.querySelector('[data-m3n-role="grace-note"]')!
    const digit = nativeSvgInk(note.querySelector('text')!.outerHTML,noDescent)
    const beam = nativeSvgInk(note.querySelector('line')!.outerHTML,noDescent)
    expect(beam.top - digit.bottom).toBeCloseTo((nativeStyle.music * .6) * 0.12, 3)
  })

  it('aligns connected beams below the deepest actual digit in a mixed group', () => {
    const varied: TextMeasurer = {measureText(text,style) {
      return {w:style.fontSize*.6,h:style.fontSize*(text === '3' ? 1.1 : .7),baseline:style.fontSize*.7}
    }}
    const grace = nativeGraceGeometry(['2','3'].map(degree => ({degree,accidental:'',octave:0})),6,varied)
    const root = new DOMParser().parseFromString(`<svg>${grace.svg}</svg>`,'image/svg+xml')
    const notes = [...root.querySelectorAll('[data-m3n-role="grace-note"]')]
    const beams = [...root.querySelectorAll('[data-m3n-role="grace"] > line')].map(beam => nativeSvgInk(beam.outerHTML,varied))
    expect(beams).toHaveLength(2)
    for (const note of notes) {
      const digit = nativeSvgInk(note.outerHTML,varied)
      expect(beams[0]!.top - digit.bottom).toBeGreaterThanOrEqual(grace.size * .12 - .0001)
    }
  })

  it.each([2, 3])('keeps octave dots clear of actual digits and %s beams with a deep-descent font', beams => {
    for (const octave of [-2, 2]) {
      const grace = nativeGraceGeometry([{degree:'3',accidental:'',octave,writtenBeats:2 ** -beams}],6,unusual)
      const root = new DOMParser().parseFromString(`<svg>${grace.svg}</svg>`,'image/svg+xml')
      const note = root.querySelector('[data-m3n-role="grace-note"]')!
      const digit = nativeSvgInk(note.querySelector('text')!.outerHTML,unusual)
      const dots = [...note.querySelectorAll('[data-m3n-role="music-dot"]')].map(dot => nativeSvgInk(dot.outerHTML,unusual))
      const lastBeam = nativeSvgInk([...note.querySelectorAll('line')].at(-1)!.outerHTML,unusual)
      expect(dots).toHaveLength(2)
      expect(octave > 0 ? digit.top - dots[0]!.bottom : dots[0]!.top - Math.max(digit.bottom,lastBeam.bottom)).toBeCloseTo(grace.size * 0.08,3)
      expect(octave > 0 ? dots[0]!.top - dots[1]!.bottom : dots[1]!.top - dots[0]!.bottom).toBeCloseTo(grace.size * 0.08,3)
    }
  })

  it('places graces at the main shoulder without lifting them for main-note octave dots or articulations', () => {
    const plain = layout('1{ac(2 3)} 2 3 4').projection.glyphs[0]!
    const high = layout('1ee{tip}{ac(2 3)} 2 3 4').projection.glyphs[0]!
    expect(high.graceLayout!.notes.map(n => n.y)).toEqual(plain.graceLayout!.notes.map(n => n.y))
    expect(high.graceLayout!.hook).toEqual(plain.graceLayout!.hook)
    expect(high.markLayout!.find(m => m.name === 'tip')!.y).toBeLessThan(0)
  })

  it('keeps the grace block rigid when outside note spacing changes', () => {
    const small = layout('1{ac((2 3))} 2 3 4',normal,800,0.4)
    const large = layout('1{ac((2 3))} 2 3 4',normal,800,1.2)
    expect(small.projection.glyphs[0]!.graceLayout!.svg).toBe(large.projection.glyphs[0]!.graceLayout!.svg)
  })
  it.each([0, NaN, Infinity])('rejects invalid written grace duration %s before building beams', writtenBeats => {
    expect(() => nativeGraceGeometry([{degree:'1',accidental:'',octave:0,writtenBeats}],6)).toThrow(/正有限数/)
  })

})
