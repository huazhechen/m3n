// @vitest-environment jsdom
import { staffGlyphMetrics, staffMusicSize } from './staff-music-font.js'
import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { scoreLayoutConfig } from '@m3n/numbered-notation/layout'
import { analyzeM3N } from '@m3n/notation'
import { findAll, SvgGeometry, xml, readXml } from './layout-svg.js'
import { projectStaffDocument } from './staff-document.js'
import { createStaffMeasure, drawStaffMeasure, drawStaffBar, STAFF_SCALE } from './staff-engine.js'

const measureText = () => ({ width: 0, left: 0, right: 0, ascent: 0, descent: 0 })
function model(source: string, spacing = .25) {
  const measure = projectStaffDocument(analyzeM3N(source).score).measures[0]!
  return createStaffMeasure(measure, true, false, measureText, spacing)
}

describe('staff rhythm engraving', () => {
  it('keeps numeric beam geometry and painted paths identical across widths and transforms', () => {
    for (const music of ['(1 2 3 4 5 6 7 1e)', '((1. 2 3. 4 5. 6 7. 1e))', '(((7 6 5 4 3 2 1 2))) 1 2 3', '([3 1 5:2]) ([7 5 3:2]) 1 2']) {
      for (const extra of [0, 73.12345]) {
        const source = `{4/4}\nN: ${music} |`
        const make = (numeric: boolean) => {
          const value = model(source)
          const row = drawStaffMeasure(value, value.minimum + extra, -7.12345, false, numeric)
          return findAll(row, node => node.attributes.class === 'beam')
        }
        const actual = make(true), expected = make(false)
        expect(actual.length).toBeGreaterThan(0)
        expect(actual).toHaveLength(expected.length)
        actual.forEach((beam, index) => {
          const reference = expected[index]!
          for (const transform of ['', 'translate(-3.3333 7.00005)']) {
            beam.attributes.transform = reference.attributes.transform = transform
            expect(new SvgGeometry(beam, measureText).pieces(beam)).toEqual(new SvgGeometry(reference, measureText).pieces(reference))
            expect(xml(beam)).toBe(xml(reference))
          }
        })
      }
    }
  })
  it('keeps a start repeat clear of the first note, including after a row signature', () => {
    const score = projectStaffDocument(analyzeM3N(readFileSync(resolve(import.meta.dirname, '../../../../src/scores/butter_fly_01.m3n'), 'utf8')).score)
    for (const first of [false, true]) {
      const result = createStaffMeasure(score.measures[1]!, first, false, measureText, .25)
      const drawing = drawStaffMeasure(result, result.minimum, 0), geometry = new SvgGeometry(drawing, measureText)
      const bar = findAll(drawing, node => node.attributes.class === 'staff-bar')[0]!
      const note = result.entries[0]![0]!.notes[0]!
      expect(note.x - note.prepared.left - geometry.ink(bar).right).toBeGreaterThanOrEqual(staffMusicSize() / 4 * (first ? 1 : .25) - 1e-7)
      const clef = findAll(drawing, node => node.attributes.class === 'staff-clef')[0]
      if (clef) expect(geometry.ink(bar).left).toBeGreaterThan(geometry.ink(clef).right)
    }
  })
  it('keeps mid-system key cancellation and meter ink clear of the preceding bar in both staves', () => {
    for (const change of ['{key=D}', '{key=C}', '{2/4}', '{key=D}{2/4}']) {
      const score = projectStaffDocument(analyzeM3N(`{key=Dm}{4/4}\nN: 1 2 3 4 | ${change}1 2 |\nB: 1d 2d 3d 4d | 1d 2d |`).score)
      const current = createStaffMeasure(score.measures[1]!, false, true, measureText, .25)
      const x = 200
      const drawing = drawStaffMeasure(current, current.minimum, x)
      const geometry = new SvgGeometry(drawing, measureText)
      const previousBar = drawStaffBar('single', x, 0)
      const right = geometry.ink(previousBar).right
      const signatures = findAll(drawing, node => node.attributes.class === 'staff-signature')
      expect(signatures).toHaveLength(2)
      for (const signature of signatures) {
        expect(geometry.ink(signature).left - right).toBeGreaterThanOrEqual(staffMusicSize() / 4 * .45 - 1e-7)
      }
      // Signature space must also be included in the minimum-width layout.
      for (const lane of current.entries) {
        const firstNote = lane[0]!.notes[0]!
        expect(firstNote.x - firstNote.prepared.left).toBeGreaterThanOrEqual(x + current.start - 1e-7)
      }
    }
  })
  it('centres single- and multi-digit meters on the middle staff line, including inline changes', () => {
    for (const meter of ['2/4', '3/4', '4/4', '6/8', '12/8', '7/16']) {
      const score = projectStaffDocument(analyzeM3N(`{5/4}\nN: 1 2 3 4 5 | {${meter}}1 2 |\nB: 1d 2d 3d 4d 5d | 1d 2d |`).score)
      for (const first of [true, false]) {
        const current = createStaffMeasure(score.measures[1]!, first, true, measureText, .25)
        for (const signature of current.prepared.signatures) {
          const digits = signature.symbols.filter(s => s.glyph.startsWith('time'))
          const top = Math.min(...digits.map(s => s.y + staffGlyphMetrics(s.glyph).top))
          const bottom = Math.max(...digits.map(s => s.y + staffGlyphMetrics(s.glyph).bottom))
          expect((top + bottom) / 2).toBeCloseTo(staffMusicSize() * 1.5)
          const rows = [...new Set(digits.map(s => s.y))]
          expect(rows).toHaveLength(2)
          const centers = rows.map(y => {
            const row = digits.filter(s => s.y === y)
            return (Math.min(...row.map(s => s.x + staffGlyphMetrics(s.glyph).left))
              + Math.max(...row.map(s => s.x + staffGlyphMetrics(s.glyph).right))) / 2
          })
          expect(centers[0]).toBeCloseTo(centers[1]!)
        }
      }
    }
  })
  it('constrains music and each lyric row separately instead of adding unrelated envelopes', () => {
    const measure = projectStaffDocument(analyzeM3N('{4/4}\nN: 5 6# 7 1e |\nL: abcdefghij i x y').score).measures[0]!
    const text = (value: string, size: number) => ({ width: value.length * size / 2, left: 0, right: value.length * size / 2, ascent: size * .8, descent: size * .2 })
    const result = createStaffMeasure(measure, false, false, text, .25)
    drawStaffMeasure(result, result.minimum, 0)
    const [first, second] = result.entries[0]!.map(entry => entry.notes[0]!)
    const gap = .25 * scoreLayoutConfig.staff.space / scoreLayoutConfig.staff.engine.scale
    expect(second!.x - second!.prepared.left - (first!.x + first!.prepared.after)).toBeGreaterThanOrEqual(gap - 1e-7)
    const centers = [first!, second!].map(note => (note.headLeft + note.headRight) / 2)
    const size = scoreLayoutConfig.lyrics.fontSize / scoreLayoutConfig.staff.engine.scale
    const widths = ['abcdefghij', 'i'].map(value => text(value, size).width)
    const lyricGap = centers[1]! - widths[1]! / 2 - (centers[0]! + widths[0]! / 2)
    expect(lyricGap).toBeGreaterThanOrEqual(2 * scoreLayoutConfig.lyrics.horizontalPadding / scoreLayoutConfig.staff.engine.scale - 1e-7)
    const columns = result.metrics.columns
    const unrelatedSum = Math.max(columns[0]!.after + gap / 2, columns[0]!.lyricAfter)
      + Math.max(columns[1]!.left + gap / 2, columns[1]!.lyricLeft)
    expect(second!.x - first!.x).toBeLessThan(unrelatedSum - 1)
  })
  it('keeps ordinary bar clearance without reserving an empty signature at every measure', () => {
    const score = projectStaffDocument(analyzeM3N('{4/4}\nN: 1 2 3 4 | 5 6 7 1e |').score)
    const ordinary = createStaffMeasure(score.measures[1]!, false, false, measureText, .25)
    expect(ordinary.prepared.signatures[0]!.symbols).toHaveLength(0)
    expect(ordinary.prepared.signatures[0]!.width).toBe(0)
    const drawing = drawStaffMeasure(ordinary, ordinary.minimum, 0), geometry = new SvgGeometry(drawing, measureText)
    const first = ordinary.entries[0]![0]!.notes[0]!, last = ordinary.entries[0]!.at(-1)!.notes[0]!
    const space = staffMusicSize() / 4
    expect(first.headLeft).toBeGreaterThanOrEqual(.25 * space)
    const bar = drawStaffBar(ordinary.measure.source.right, ordinary.minimum, 0)
    expect(geometry.ink(bar).left - last.headRight).toBeGreaterThanOrEqual(.25 * space - .001)
  })
  it('preserves a full staff space after the row signature before notes, rests, accidentals and graces', () => {
    for (const music of ['1 2 3 4', '1# 2 3 4', '1d 2 3 4', '1{ac(6 7)} 2 3 4', '0 2 3 4']) {
      const doc = projectStaffDocument(analyzeM3N(`{4/4}\nN: 1 2 3 4 | ${music} |`).score)
      const current = createStaffMeasure(doc.measures[1]!, true, false, measureText, .25)
      const drawing = drawStaffMeasure(current, current.minimum, 0)
      const event = findAll(drawing, n => n.attributes.id === current.measure.melody[0]!.id)[0]!
      const geometry = new SvgGeometry(drawing, measureText)
      const signature = findAll(drawing, n => n.attributes.class === 'staff-signature')[0]!
      expect(geometry.ink(event).left - geometry.ink(signature).right).toBeGreaterThanOrEqual(staffMusicSize() / 4 - .001)
    }
  })
  it('keeps staff reading space independent of digit size and proportional to its own music frame', () => {
    const numberedSize = scoreLayoutConfig.numbered.music, staffSize = scoreLayoutConfig.staff.music
    const reading = () => model('{4/4}\nN: 5 6 7 1e |').metrics.columns[0]!.rhythmAfter
    try {
      const original = reading()
      scoreLayoutConfig.numbered.music = numberedSize * 1.5
      expect(reading()).toBeCloseTo(original)
      scoreLayoutConfig.staff.music = staffSize * 1.25
      expect(reading()).toBeCloseTo(original * 1.25)
    } finally {
      scoreLayoutConfig.numbered.music = numberedSize
      scoreLayoutConfig.staff.music = staffSize
    }
  })
  it('reserves flag width only for independently flagged notes', () => {
    const beamed = model('{4/4}\nN: (1 2) 3 4 5 |')
    const independent = model('{4/4}\nN: (1 0) 3 4 5 |')
    const together = beamed.entries[0]![0]!.notes[0]!
    const alone = independent.entries[0]![0]!.notes[0]!
    expect(together.beam).toBeDefined()
    expect(alone.beam).toBeUndefined()
    const head = staffGlyphMetrics(together.prepared.head, together.prepared.size)
    expect(together.prepared.after).toBeCloseTo(head.right - head.left)
    expect(alone.prepared.after).toBeGreaterThan(together.prepared.after)
    const drawing = drawStaffMeasure(beamed, beamed.minimum, 0)
    expect(xml(drawing)).not.toContain('data-m3n-glyph="flag')
  })

  it('beams eighth-note triplets by quarter-note beat in 4/4', () => {
    const result = model('{4/4}\nN: ([3 3 3:2]) ([1 1 1:2]) ([6d 6d 6d:2]) ([3d 3d 3d:2]) |')
    expect(result.beams.map(beam => beam.notes.length)).toEqual([3, 3, 3, 3])
    for (const entry of result.entries[0]!) {
      expect(entry.notes.every(note => note.beam === entry.notes[0]!.beam)).toBe(true)
    }
  })
  it('beams ordinary eighth notes by beat, retaining dotted beats in compound time', () => {
    expect(model('{4/4}\nN: (1 2 3 4 5 6 7 1e) |').beams.map(beam => beam.notes.length)).toEqual([2, 2, 2, 2])
    expect(model('{6/8}\nN: (1 2 3 4 5 6) |').beams.map(beam => beam.notes.length)).toEqual([3, 3])
  })
  it('places rest-led tuplets on the pitched stem side, keeping their bracket', () => {
    for (const source of ['([0 0 3d:2])', '([0 7 7:2])']) {
      const result = model(`{4/4}\nN: 1 2 3 ${source} |`)
      const entry = result.entries[0]!.at(-1)!
      const pitched = entry.notes.find(note => !note.prepared.rest)!
      const markup = drawStaffMeasure(result, result.minimum, 0)
      const label = findAll(markup, node => node.attributes.class === 'm3n-tuplet-label')[0]!
      const y = new SvgGeometry(markup, measureText).ink(label).top
      if (pitched.direction === 1) expect(y).toBeLessThan((result.staves[0]!.y + 40))
      else expect(y).toBeGreaterThan((result.staves[0]!.y + 80))
      expect(findAll(label, node => node.tagName === 'path')).toHaveLength(4)
    }
  })
})

it('uses meter-specific defaults for 4/8 and 6/4 instead of splitting every denominator unit', () => {
  expect(model('{4/8}\nN: (1 2 3 4) |').beams.map(beam => beam.notes.length)).toEqual([2, 2])
  expect(model('{6/4}\nN: (1 2 3 4 5 6 7 1e 2e 3e 4e 5e) |').beams.map(beam => beam.notes.length)).toEqual([6, 6])
})

it('keeps short tuplets separate and beams a longer tuplet as a complete unit', () => {
  const short = model('{4/4}\nN: (([1 2 3:2]) ([4 5 6:2])) 1 2 3 |')
  expect(short.beams.map(beam => beam.notes.length)).toEqual([3, 3])
  const long = model('{4/4}\nN: ([1 2 3 4 5:4]) 1 2 |')
  expect(long.beams.map(beam => beam.notes.length)).toEqual([5])
})

it('shows the occupied-note ratio for unusual tuplets and brackets unbeamed groups', () => {
  const result = model('{4/4}\nN: ([1 2 3 4 5:3]) 1 2 (3) |')
  const drawing = drawStaffMeasure(result, result.minimum, 0)
  const label = findAll(drawing, node => node.attributes.class === 'tupletNum')[0]!
  expect(findAll(label, node => node.tagName === 'text')[0]!.children).toEqual(['5:3'])
  const unbeamed = model('{4/4}\nN: [1 2 3:2] 4 5 |')
  const bracket = drawStaffMeasure(unbeamed, unbeamed.minimum, 0)
  expect(findAll(findAll(bracket, n => n.attributes.class === 'tupletNum')[0]!, n => n.tagName === 'path')).toHaveLength(4)
})

it('breaks beams at an inline key signature without shifting the following beat grid', () => {
  const result = model('{4/4}\nN: (1 {key=G} 2 3 4 5 6 7 1e) |')
  expect(result.beams.map(beam => beam.notes.length)).toEqual([2, 2, 2])
  expect(result.entries[0]![0]!.notes[0]!.beam).toBeUndefined()
  expect(result.entries[0]![1]!.notes[0]!.beam).toBeUndefined()
})

it('reserves arpeggio width along with accidentals and grace notes', () => {
  const plain = model('{4/4}\nN: [1# 3 5:h] 2 3 4 |')
  const rolled = model('{4/4}\nN: [1# 3 5:h]{arp} 2 3 4 |')
  const grace = model('{4/4}\nN: [1# 3 5:h]{arp}{ac(6 7)} 2 3 4 |')
  expect(rolled.minimum).toBeGreaterThan(plain.minimum)
  expect(grace.minimum).toBeGreaterThan(rolled.minimum)
  const drawing = drawStaffMeasure(grace, grace.minimum, 0)
  expect(findAll(drawing, n => n.attributes.class === 'arpeg')).toHaveLength(1)
})

it('aligns pickup beaming with the end of the bar while the complementary final bar starts on the beat', () => {
  const analysis = analyzeM3N('{4/4}\nN: (1 2 3) | (1 2 3 4 5 6 7 1e) | (1 2 3 4 5) |||')
  expect(analysis.diagnostics.filter(d => d.severity === 'error')).toEqual([])
  const document = projectStaffDocument(analysis.score)
  const pickup = createStaffMeasure(document.measures[0]!, true, false, measureText, 0.25)
  expect(pickup.entries[0]![0]!.notes[0]!.beam).toBeUndefined()
  expect(pickup.beams[0]!.notes).toEqual(pickup.entries[0]!.slice(1).flatMap(entry => entry.notes))
  const final = createStaffMeasure(document.measures.at(-1)!, true, false, measureText, 0.25)
  expect(final.beams.map(beam => beam.notes.length)).toEqual([2, 2])
  expect(final.entries[0]!.at(-1)!.notes[0]!.beam).toBeUndefined()
})

it('keeps measure 32 of Do-Re-Mi clear of its ending repeat at compact and stretched widths', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../../../../src/scores/duo_lai_mi_01.m3n'), 'utf8')
  const measure = projectStaffDocument(analyzeM3N(source).score).measures[31]!
  expect(measure.source.right).toBe('rptend')
  for (const first of [false, true]) for (const extra of [0, 80]) {
    const result = createStaffMeasure(measure, first, false, measureText, .8)
    const drawing = drawStaffMeasure(result, result.minimum + extra, 20)
    const geometry = new SvgGeometry(drawing, measureText)
    const stave = result.staves[0]!
    const repeat = drawStaffBar(measure.source.right, stave.x + stave.width, stave.y)
    const note = findAll(drawing, node => node.attributes.id === measure.melody.at(-1)!.id)[0]!
    expect(geometry.ink(repeat).left - geometry.ink(note).right).toBeGreaterThanOrEqual(3)
  }
})

it('joins grace stems to the smaller heads and recomputes beams after width changes', () => {
  const grace = model('{4/4}\nN: 1{ac(6 7)} 2 3 4 |||')
  const drawing = drawStaffMeasure(grace, grace.minimum, 0)
  const graces = findAll(drawing, n => n.attributes.class === 'grace')
  expect(graces).toHaveLength(2)
  for (const group of graces) {
    const stem = findAll(group, n => n.attributes.class === 'stem')[0]!
    const head = findAll(group, n => n.numericInk !== undefined)[0]!
    const geometry = new SvgGeometry(group, measureText)
    expect(geometry.ink(stem).left).toBeLessThan(geometry.ink(head).right)
    expect(geometry.ink(stem).right).toBeGreaterThan(geometry.ink(head).left)
  }
  const result = model('{4/4}\nN: (1 5 6 2) 3 4 |||')
  for (const extra of [0, 200, 0]) {
    drawStaffMeasure(result, result.minimum + extra, 17)
    for (const beam of result.beams) {
      const first = beam.notes[0]!, last = beam.notes.at(-1)!
      const slope = (last.stemEnd - first.stemEnd) / (last.stemX - first.stemX)
      expect(Math.abs(slope)).toBeLessThanOrEqual(0.200001)
      for (const note of beam.notes) expect(note.stemEnd).toBeCloseTo(first.stemEnd + slope * (note.stemX - first.stemX), 10)
    }
  }
})

it.each(['tip', 'brk', 'hold', 'str'])('puts %s opposite final stems, including mixed-pitch beams and chords', mark => {
  for (const music of [`1{${mark}} 1e{${mark}}`, `(1{${mark}} 1ee{${mark}})`, `[135:h]{${mark}}`]) {
    const result = model(`{4/4}\nN: ${music} 2 3 |||`)
    for (const width of [result.minimum, result.minimum + 200, result.minimum]) {
      const drawing = drawStaffMeasure(result, width, 0)
      const geometry = new SvgGeometry(drawing, measureText)
      for (const entry of result.entries[0]!) for (const note of entry.notes) {
        if (!note.prepared.item.event.postfixes.includes(mark)) continue
        const event = findAll(drawing, n => n.attributes.id === note.prepared.item.id)[0]!
        const symbol = findAll(event, n => n.numericInk !== undefined).at(-1)!
        const ink = geometry.ink(symbol)
        const heads = findAll(event, n => n.attributes.class === 'notehead').map(node => geometry.ink(node))
        if (note.direction === 1) expect(ink.top).toBeGreaterThan(Math.max(...heads.map(head => head.bottom)))
        else expect(ink.bottom).toBeLessThan(Math.min(...heads.map(head => head.top)))
        expect(xml(symbol)).toContain(note.direction === 1 ? 'Below' : 'Above')
        if (mark === 'tip') {
          const center = (ink.top + ink.bottom) / 2
          for (const line of findAll(drawing, n => n.attributes.class === 'staff-line' || n.attributes.class === 'ledger-line')) {
            const rule = geometry.ink(line)
            if (rule.left < ink.right && rule.right > ink.left)
              expect(Math.abs(center - (rule.top + rule.bottom) / 2)).toBeGreaterThan((ink.bottom - ink.top) / 2)
          }
        }
      }
    }
  }
})

it.each([28, 35])('keeps shared tuplet text and bracket clearance fixed at staff music size %s', size => {
  const previous = scoreLayoutConfig.staff.music;
  scoreLayoutConfig.staff.music = size;
  try {
    const measure = projectStaffDocument(analyzeM3N('{4/4}\nN: [1 2 3:2] 4 5 |').score).measures[0]!;
    const measured = (_text: string, fontSize: number) => ({ width: fontSize * 0.6, left: 0, right: fontSize * 0.6, ascent: fontSize, descent: 0 });
    const result = createStaffMeasure(measure, true, false, measured, 0.25);
    const drawing = drawStaffMeasure(result, result.minimum, 0);
    const label = findAll(drawing, n => n.attributes.class === 'tupletNum')[0]!;
    const text = findAll(label, n => n.tagName === 'text')[0]!;
    const geometry = new SvgGeometry(label, measured);
    const paths = findAll(label, n => n.tagName === 'path');
    const center = Number(text.attributes.x), width = measured('3', scoreLayoutConfig.staff.tupletFontSize / scoreLayoutConfig.staff.engine.scale).width;
    expect(Number(text.attributes['font-size'])).toBe(scoreLayoutConfig.staff.tupletFontSize / scoreLayoutConfig.staff.engine.scale);
    expect(text.attributes['font-family']).toBe(scoreLayoutConfig.fonts.text);
    expect(geometry.ink(paths[1]!).right).toBeCloseTo(center - width / 2 - scoreLayoutConfig.staff.attachmentGap / STAFF_SCALE + scoreLayoutConfig.staff.tupletStroke / STAFF_SCALE / 2);
    expect(geometry.ink(paths[2]!).left).toBeCloseTo(center + width / 2 + scoreLayoutConfig.staff.attachmentGap / STAFF_SCALE - scoreLayoutConfig.staff.tupletStroke / STAFF_SCALE / 2);
  } finally { scoreLayoutConfig.staff.music = previous; }
});

it('retains normal stems for flat beams and bounds shortened leap stems above the innermost beam', () => {
  for (const music of ['((1 1 1 1))', '((1 1e 1 1e))', '(((1 1e 1 1e 1 1e 1 1e)))']) {
    const result = model(`{4/4}\nN: ${music} 2 3 4 |||`)
    drawStaffMeasure(result, result.minimum + 100, 0)
    const space = staffMusicSize() / 4
    for (const beam of result.beams) {
      const lengths = beam.notes.map(note => {
        const outer = note.direction === 1 ? Math.min(...note.ys) : Math.max(...note.ys)
        const length = note.direction * (outer - note.stemEnd)
        const levels = Math.log2(note.prepared.dur / 4)
        expect(length / space).toBeGreaterThanOrEqual(Math.max(2.5, (levels - 1) * .7 + 1.4) - 1e-6)
        return length / space
      })
      if (music === '((1 1 1 1))') for (const length of lengths) expect(length).toBeCloseTo(3.5)
      else expect(Math.min(...lengths)).toBeLessThan(3.5)
    }
  }
})


it('uses equal rhythmic weights inside and across common beams', () => {
  const result = model('{2/4}\nN: ((5 5 5 5 5 5 5 5)) |||', .8)
  drawStaffMeasure(result, result.minimum, 0)
  const notes = result.entries[0]!.flatMap(entry => entry.notes)
  expect(result.beams.map(beam => beam.notes.length)).toEqual([4, 4])
  const gap = (a: number, b: number) => notes[b]!.headLeft - notes[a]!.headRight
  expect(gap(1, 2) / gap(3, 4)).toBeCloseTo(1, 8)
  expect(gap(1, 2) * scoreLayoutConfig.staff.engine.scale).toBeGreaterThan(1)
})

it('keeps simultaneous voice attacks and beamed columns at the same rhythmic spacing', () => {
  const document = projectStaffDocument(analyzeM3N('{2/4}\nN: ((1 1 1 1 1 1 1 1)) |||\nB: 1d 2d |||').score)
  const result = createStaffMeasure(document.measures[0]!, true, true, measureText, .25)
  const columns = result.prepared.metrics.columns
  const head = staffGlyphMetrics('noteheadBlack'), ink = head.right - head.left
  expect((columns[1]!.naturalAdvance - ink) / (columns[0]!.naturalAdvance - ink)).toBeCloseTo(1, 8)
  expect(columns[4]!.naturalAdvance).toBeCloseTo(columns[0]!.naturalAdvance, 8)
})


it('reserves ledger overhang before tightening rhythmic gaps', () => {
  const result = model('{2/4}\nN: ((1ee 1ee 1ee 1ee 1ee 1ee 1ee 1ee)) |||')
  drawStaffMeasure(result, result.minimum, 0)
  const notes = result.entries[0]!.flatMap(entry => entry.notes)
  const overhang = staffMusicSize() / 4 * .3
  for (let i = 1; i < notes.length; i++)
    expect(notes[i]!.headLeft - overhang).toBeGreaterThan(notes[i - 1]!.headRight + overhang)
})


describe('grace group engraving', () => {
  it.each(['ac', 'ap'])('beams double %s graces upward without independent flags', kind => {
    const result = model(`{4/4}\nN: 1{${kind}(1e 2e)} 2 3 4 |`)
    const drawing = drawStaffMeasure(result, result.minimum, 0)
    const groups = findAll(drawing, node => node.attributes.class === 'grace-group')
    expect(groups).toHaveLength(1)
    const group = groups[0]!
    expect(findAll(group, node => node.attributes.class === 'grace')).toHaveLength(2)
    expect(findAll(group, node => node.attributes.class === 'beam')).toHaveLength(1)
    expect(xml(group)).not.toContain('data-m3n-glyph="flag')
    expect(findAll(group, node => node.attributes.class === 'grace-slash')).toHaveLength(kind === 'ac' ? 1 : 0)
    expect(result.entries[0]![0]!.notes[0]!.prepared.graces.every(child => child.note.direction === 1)).toBe(true)
    const stems = findAll(group, node => node.attributes.class === 'stem')
    const geometry = new SvgGeometry(drawing, measureText)
    const beam = geometry.ink(findAll(group, node => node.attributes.class === 'beam')[0]!)
    for (const stem of stems) {
      const ink = geometry.ink(stem)
      expect(ink.top).toBeLessThanOrEqual(beam.bottom)
      expect(ink.bottom).toBeGreaterThan(beam.bottom)
    }
  })

  it('retains single grace flags and keeps successive grace groups separate', () => {
    const result = model('{4/4}\nN: 1{ac(7)} 2{ap(1e)} 3{ac((1e 2e 3e))}{ap(4e 5e)} 4 |')
    const drawing = drawStaffMeasure(result, result.minimum, 0)
    const groups = findAll(drawing, node => node.attributes.class === 'grace-group')
    expect(groups).toHaveLength(4)
    for (const group of groups.slice(0, 2)) {
      expect(findAll(group, node => node.attributes.class === 'beam')).toHaveLength(0)
      expect(xml(group)).toContain('data-m3n-glyph="flag8Up"')
    }
    expect(findAll(groups[2]!, node => node.attributes.class === 'beam')[0]!.children).toHaveLength(2)
    expect(findAll(groups[3]!, node => node.attributes.class === 'beam')[0]!.children).toHaveLength(1)
    expect(findAll(drawing, node => node.attributes.class === 'grace-slash')).toHaveLength(2)
  })
})

it('uses directional weights with the staff duration curve', async () => {
  const { staffReadingSpacing } = await import('./staff-engine.js')
  const result = model('{4/4}\nN: (3 3) (3 3) 3 3 |')
  const space = staffMusicSize() / 4
  expect(result.prepared.metrics.columns[0]!.naturalAdvance / space).toBeCloseTo(1.18 + 1.2 * .5)
  expect(result.prepared.metrics.columns[4]!.naturalAdvance / space).toBeCloseTo(1.18 + 1.2)
  const compressed = staffReadingSpacing(result.prepared, .25, 0)
  const relaxed = staffReadingSpacing(result.prepared, .25, 100)
  expect(compressed.compressionPenalty).toBe(0)
  expect(relaxed.positions[1]! - relaxed.positions[0]!).toBeGreaterThan(compressed.positions[1]! - compressed.positions[0]!)
  expect(relaxed.compressionPenalty).toBe(0)
})

it('keeps pair spacing local and independent of unrelated score durations', async () => {
  const { createStaffPreparation } = await import('./staff-engine.js')
  const document = projectStaffDocument(analyzeM3N('{4/4}\nN: ([3333:2]) 3 3 3 | ([3333:2]) 3 3 3 | (3 3) 3 3 3 |').score)
  const preparation = createStaffPreparation(document)
  const result = preparation.measure(document.measures[2]!, false, false, measureText)
  expect(result.metrics.columns[0]!.naturalAdvance / (staffMusicSize() / 4)).toBeCloseTo(1.18 + 1.2 * .5)
})

it.each([.6, 1.8])('uses %s staff spaces as the quarter-note base minimum without compressing', async spacing => {
  const { staffReadingSpacing } = await import('./staff-engine.js')
  const result = model('{4/4}\nN: (3 3) (3 3) 3 3 |', spacing)
  const positions = staffReadingSpacing(result.prepared, spacing, 0).positions
  const head = staffGlyphMetrics('noteheadBlack'), space = staffMusicSize() / 4
  expect(positions[1]! - positions[0]! - (head.right - head.left)).toBeCloseTo(spacing * space * .5, 8)
  expect(positions[5]! - positions[4]! - (head.right - head.left)).toBeCloseTo(spacing * space, 8)
  expect(staffReadingSpacing(result.prepared, spacing, -100).positions).toEqual(positions)
})

it.each([.6, 1.8])('uses the same duration-normalized gap around dotted notes at spacing %s', async spacing => {
  const { staffSpacingPositions } = await import('./staff-engine.js')
  const result = model('{4/4}\nN: 7. (7) 7 7 |', spacing)
  for (const extra of [0, 80]) {
    const xs = staffSpacingPositions(result.prepared, spacing, extra)
    const gaps = xs.slice(1).map((x, i) => (x - xs[i]! - result.prepared.metrics.columns[i]!.after - result.prepared.metrics.columns[i + 1]!.left) / result.prepared.weights[i]!)
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]!, 8)
  }
})

it('reserves an independent flag at its actual downward stem position', () => {
  const result = model('{4/4}\nN: 7. (7) 7 7 |')
  drawStaffMeasure(result, result.minimum, 0)
  const note = result.entries[0]![1]!.notes[0]!
  expect(note.direction).toBe(-1)
  expect(note.beam).toBeUndefined()
  const flag = staffGlyphMetrics('flag8Down', note.prepared.size)
  const head = staffGlyphMetrics(note.prepared.head, note.prepared.size)
  expect(note.prepared.after).toBeCloseTo(Math.max(head.right - head.left, note.stemX - note.x + flag.right), 8)
  expect(note.prepared.after).toBeLessThan(head.right - head.left + staffGlyphMetrics('flag8Up', note.prepared.size).right)
  expect(note.x + note.prepared.after).toBeGreaterThanOrEqual(note.stemX + flag.right - 1e-9)
})

it.each([.6, 1.8])('opens the long side of staff syncopation at spacing %s', async spacing => {
  const { staffSpacingPositions } = await import('./staff-engine.js')
  const result = model('{4/4}\nN: (7) 7 (7) |', spacing)
  for (const extra of [0, 80]) {
    const xs = staffSpacingPositions(result.prepared, spacing, extra)
    const gaps = xs.slice(1).map((x, i) => x - xs[i]! - result.prepared.metrics.columns[i]!.after - result.prepared.metrics.columns[i + 1]!.left)
    expect(gaps[1]! / gaps[0]!).toBeCloseTo(Math.sqrt(2), 8)
  }
})

it('scales painted noteheads, stems, beams and staff rules together from seven to eight pixel spaces', () => {
  const original = scoreLayoutConfig.staff.music
  const measure = () => {
    const layout = model('{4/4}\nN: (1 1) (1 1) 1 1 |')
    const node = drawStaffMeasure(layout, layout.minimum, 0)
    const geometry = new SvgGeometry(node, measureText)
    return ['notehead', 'stem', 'beam', 'staff-line'].map(cls => {
      const part = findAll(node, n => n.attributes.class === cls)[0]!
      expect(part).toBeDefined()
      const ink = geometry.ink(part)
      return { width: ink.right - ink.left, height: ink.bottom - ink.top }
    })
  }
  try {
    scoreLayoutConfig.staff.music = 28
    const before = measure()
    scoreLayoutConfig.staff.music = 32
    const after = measure()
    before.forEach((box, i) => {
      expect(after[i]!.width).toBeCloseTo(box.width * 8 / 7, 2)
      expect(after[i]!.height).toBeCloseTo(box.height * 8 / 7, 2)
    })
  } finally { scoreLayoutConfig.staff.music = original }
})


it.each(['1', '1d', '1ee', '1eee'])('keeps outward staccato dots at the attachment gap beyond the last ledger: %s', pitch => {
  const current = model(`{4/4}\nN: ${pitch}{tip} |`)
  const painted = readXml(xml(drawStaffMeasure(current, current.minimum, 0)))
  const geometry = new SvgGeometry(painted, measureText)
  const head = geometry.ink(findAll(painted, node => node.attributes.class === 'notehead')[0]!)
  const dot = geometry.ink(findAll(painted, node => node.attributes['data-m3n-glyph']?.startsWith('articStaccato') ?? false)[0]!)
  expect(findAll(painted, node => node.attributes.class === 'ledger-line').length).toBeGreaterThan(0)
  const below = current.entries[0]![0]!.notes[0]!.direction === 1
  const gap = below ? dot.top - head.bottom : head.top - dot.bottom
  expect(gap * STAFF_SCALE).toBeCloseTo(scoreLayoutConfig.staff.attachmentGap, 6)
})

it('keeps staccato dots clear of the five actual staff lines', () => {
  for (const pitch of ['1e', '2e', '3e', '4e', '5e', '6e', '7e']) {
    const current = model(`{4/4}\nN: ${pitch}{tip} |`)
    const painted = readXml(xml(drawStaffMeasure(current, current.minimum, 0)))
    const geometry = new SvgGeometry(painted, measureText)
    const dot = geometry.ink(findAll(painted, node => node.attributes['data-m3n-glyph']?.startsWith('articStaccato') ?? false)[0]!)
    const center = (dot.top + dot.bottom) / 2, radius = (dot.bottom - dot.top) / 2
    for (const line of findAll(painted, node => node.attributes.class === 'staff-line')) {
      const ink = geometry.ink(line), rule = (ink.top + ink.bottom) / 2
      expect(Math.abs(center - rule)).toBeGreaterThanOrEqual(radius + staffMusicSize() / 4 * .15 - 1e-6)
    }
  }
})


it.each([false, true])('only avoids ledger segments that overlap the staccato dot horizontally: shifted=%s', shifted => {
  const current = model('{4/4}\nN: 1ee{tip} |')
  const note = current.entries[0]![0]!.notes[0]!
  // Put the dot toward the staff, where this high note has real ledgers.
  note.prepared.direction = 1
  if (shifted) note.prepared.symbols.find(symbol => symbol.glyph.startsWith('articStaccato'))!.x += staffMusicSize() * 2
  const painted = readXml(xml(drawStaffMeasure(current, current.minimum, 0)))
  const geometry = new SvgGeometry(painted, measureText)
  const head = geometry.ink(findAll(painted, node => node.attributes.class === 'notehead')[0]!)
  const dot = geometry.ink(findAll(painted, node => node.attributes['data-m3n-glyph']?.startsWith('articStaccato') ?? false)[0]!)
  const gap = (dot.top - head.bottom) * STAFF_SCALE
  if (shifted) expect(gap).toBeCloseTo(scoreLayoutConfig.staff.attachmentGap, 6)
  else {
    expect(gap).toBeGreaterThan(scoreLayoutConfig.staff.attachmentGap)
    const center = (dot.top + dot.bottom) / 2, radius = (dot.bottom - dot.top) / 2
    for (const ledger of findAll(painted, node => node.attributes.class === 'ledger-line')) {
      const ink = geometry.ink(ledger), rule = (ink.top + ink.bottom) / 2
      if (ink.left < dot.right && ink.right > dot.left)
        expect(Math.abs(center - rule)).toBeGreaterThanOrEqual(radius + staffMusicSize() / 4 * .15 - 1e-6)
    }
  }
  const numeric = drawStaffMeasure(current, current.minimum, 0, false, true)
  const ordinary = drawStaffMeasure(current, current.minimum, 0)
  expect(new SvgGeometry(numeric, measureText).pieces(numeric)).toEqual(new SvgGeometry(ordinary, measureText).pieces(ordinary))
})
