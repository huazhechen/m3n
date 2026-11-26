// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { lyricHyphenMetrics } from '@m3n/numbered-notation'
import { projectStaffDocument } from './staff-document.js'
import { planStaffLines } from './line-layout.js'
import { engraveStaffSystems } from './staff-system.js'
import { SvgGeometry, findAll, hasClass, textContent, type MeasureText } from './layout-svg.js'
import { STAFF_SCALE, createStaffMeasure, drawStaffMeasure } from './staff-engine.js'
const measure: MeasureText = (text, size) => ({ width: text.length * size * .5, left: 0, right: text.length * size * .5, ascent: size * .8, descent: size * .2 })
const systems = (source: string) => {
  const document = projectStaffDocument(analyzeM3N(source).score)
  return engraveStaffSystems(document, planStaffLines(document, 640, false, measure, .25), 640, measure, .25, false)
}
it('centres word connectors across measures with real ink clearance', () => {
  const [system] = systems('{2/4}\nN: 1 2 | 3 4 |||\nL: Blue twin-kle sky')
  const geometry = new SvgGeometry(system!.node, measure)
  const verses = findAll(system!.node, n => hasClass(n, 'verse'))
  const first = verses.find(n => textContent(n) === 'twin')!, next = verses.find(n => textContent(n) === 'kle')!
  const hyphen = findAll(first, n => hasClass(n, 'lyric-hyphen'))[0]!
  const h = geometry.ink(hyphen), left = geometry.ink(first.children[0] as typeof first), right = geometry.ink(next)
  expect(h.left).toBeGreaterThan(left.right)
  expect(h.right).toBeLessThan(right.left)
  expect((h.left + h.right) / 2).toBeCloseTo((left.right + right.left) / 2)
  expect((h.right - h.left) * STAFF_SCALE).toBeCloseTo(lyricHyphenMetrics(16).width + lyricHyphenMetrics(16).stroke)
})
it('retains outgoing word connectors across systems and independent verses', () => {
  const result = systems('{2/4}\nN: ||: 1 2 | {br}3 4 :|||\nL1: Blue twin-kle sky\nL2: One bright morn-ing')
  expect(result).toHaveLength(2)
  expect(result.map(s => findAll(s.node, n => hasClass(n, 'lyric-hyphen')).length)).toEqual([1, 1])
})
it('does not connect different words or Chinese text', () => {
  const [system] = systems('{2/4}\nN: 1 2 | 3 4 |||\nL: 春夏秋冬')
  expect(findAll(system!.node, n => hasClass(n, 'lyric-hyphen'))).toHaveLength(0)
})

it('reserves a whole dash and clearances when lyrics determine the minimum width', () => {
  const document = projectStaffDocument(analyzeM3N('{3/4}\nN: (1 2 3 4 5 6) |||\nL: ex-tra-or-di-na-ry').score)
  const model = createStaffMeasure(document.measures[0]!, false, false, measure, .25)
  drawStaffMeasure(model, model.minimum, 0)
  const notes = model.entries[0]!.map(entry => entry.notes[0]!)
  for (let i = 0; i < notes.length - 1; i++) {
    const center = (j: number) => (notes[j]!.headLeft + notes[j]!.headRight) / 2
    const gap = center(i + 1) - center(i) - (measure(model.entries[0]![i]!.item.lyrics[0]!.text, 16 / STAFF_SCALE).width
      + measure(model.entries[0]![i + 1]!.item.lyrics[0]!.text, 16 / STAFF_SCALE).width) / 2
    expect(gap * STAFF_SCALE).toBeGreaterThanOrEqual(8)
  }
})
