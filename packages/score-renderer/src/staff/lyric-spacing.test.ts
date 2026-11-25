// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { lyricSpacing } from '@m3n/numbered-notation'
import { projectStaffDocument } from './staff-document.js'
import { createVexMeasure, drawVexMeasure, createStaffContext, STAFF_SCALE } from './vexflow-engine.js'
import { createStaffMeasureMinimum } from './line-layout.js'
import { createStaffVexPreparation } from './vexflow-engine.js'
import { SvgGeometry, findAll, hasClass, type MeasureText } from './layout-svg.js'
import { planStaffLines } from './line-layout.js'
import { engraveStaffSystems } from './staff-system.js'

const measureText: MeasureText = (text, size) => ({ width: text.length * size, left: 0, right: text.length * size, ascent: size * 0.8, descent: size * 0.2 })
const source = '{2/4}\nN: ||: (1 2 3 4) :|||\nL1: Spring summer autumn winter\nL2: Morning evening sunshine moonlight'

it.each([0.25, 0.28125, 0.3125, 0.34375, 0.375])('reserves 1px per lyric edge without adding music clearance at spacing %s', spacing => {
  const document = projectStaffDocument(analyzeM3N(source).score)
  const measure = document.measures[0]!
  const model = createVexMeasure(measure, false, false, measureText, spacing)
  const minimum = createStaffMeasureMinimum(false, measureText, createStaffVexPreparation())
  expect(minimum(measure, false, spacing)).toBe(model.minimum)
  drawVexMeasure(model, model.minimum, 0, createStaffContext())
  const notes = model.entries[0]!.map(entry => entry.notes[0]!)
  const words = ['Morning', 'evening', 'sunshine', 'moonlight']
  for (let i = 1; i < notes.length; i++) {
    const center = (index: number) => (notes[index]!.getNoteHeadBeginX() + notes[index]!.getNoteHeadEndX()) / 2
    const left = center(i) - measureText(words[i]!, lyricSpacing.fontSize / STAFF_SCALE).width / 2
    const right = center(i - 1) + measureText(words[i - 1]!, lyricSpacing.fontSize / STAFF_SCALE).width / 2
    expect((left - right) * STAFF_SCALE).toBeCloseTo(2)
  }
})

it('uses the numbered lyric font size and 6px/4px vertical gaps', () => {
  const document = projectStaffDocument(analyzeM3N(source).score)
  const lines = planStaffLines(document, 720, false, measureText, 0.25)
  const system = engraveStaffSystems(document, lines, 720, measureText, 0.25, false)[0]!
  const geometry = new SvgGeometry(system.node, measureText)
  const verses = findAll(system.node, node => hasClass(node, 'verse'))
  const first = verses.filter(node => node.attributes.id?.endsWith('-v1'))
  const second = verses.filter(node => node.attributes.id?.endsWith('-v2'))
  const firstTop = Math.min(...first.map(node => geometry.ink(node).top))
  const firstBottom = Math.max(...first.map(node => geometry.ink(node).bottom))
  const secondTop = Math.min(...second.map(node => geometry.ink(node).top))
  const music = findAll(system.node, node => hasClass(node, 'staff')).flatMap(staff => geometry.withoutClasses(staff, ['verse']))
  expect((firstTop - Math.max(...music.map(piece => piece.bottom))) * STAFF_SCALE).toBeCloseTo(lyricSpacing.musicGap)
  expect((secondTop - firstBottom) * STAFF_SCALE).toBeCloseTo(lyricSpacing.rowGap)
})

it('includes lyric underline stroke caps in the 2px minimum clearance', () => {
  const document = projectStaffDocument(analyzeM3N('{2/4}\nN: (1 2 3 4) |||\nL: (Spring) (summer) (autumn) (winter)').score)
  const model = createVexMeasure(document.measures[0]!, false, false, measureText, 0.25)
  expect(model.entries[0]!.every(entry => entry.item.lyrics[0]?.underlined)).toBe(true)
  drawVexMeasure(model, model.minimum, 0, createStaffContext())
  const centers = model.entries[0]!.map(entry => (entry.notes[0]!.getNoteHeadBeginX() + entry.notes[0]!.getNoteHeadEndX()) / 2)
  const widths = ['Spring', 'summer', 'autumn', 'winter'].map(word => measureText(word, lyricSpacing.fontSize / STAFF_SCALE).width)
  for (let i = 1; i < centers.length; i++)
    expect((centers[i]! - centers[i - 1]! - (widths[i]! + widths[i - 1]!) / 2) * STAFF_SCALE - 1).toBeCloseTo(2)
})
