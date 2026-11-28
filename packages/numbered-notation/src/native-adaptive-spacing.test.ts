import { renderNativePages } from './native-svg.js'
import { scoreVerticalSpacing } from './layout/policy.js'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore, repaginateNativeLayout } from './native-layout.js'
import { NativeNumberedNotationScore, PreparedNumberedNotationScore } from './native-score.js'

describe('tight 8px and loose 16px note spacing', () => {
  const options = { width: 320, pageMargin: 0, paged: true }
  const rows = (layout: ReturnType<typeof layoutNativeScore>) => layout.systems.map(system =>
    system.measures.map(measure => measure.columns.map(column => column.glyphs.map(glyph => [glyph.id, glyph.x]))))

  it('engraves both spacing tiers before selecting a complete layout', () => {
    const document = parseM3NDocument(readFileSync(new URL('../../../src/scores/por_una_cabeza_01.m3n', import.meta.url), 'utf8'))
    const before = structuredClone(document), timings: Record<string, number> = {}
    const automatic = layoutNativeScore(document, { ...options, width: 540 }, timings)
    expect([8, 12, 16]).toContain(automatic.options.minimumNoteGap)
    expect(timings.layoutTrials).toBeGreaterThanOrEqual(2)
    expect(document).toEqual(before)
  })

  it('preserves continuous, paged and prepared layout agreement independently of vertical gaps', () => {
    const document = parseM3NDocument('{4/4}\nN: ' + '(1 2 3 4 5 6 7 1e) | '.repeat(31))
    const settings = { ...options, width: 540 }
    const automatic = layoutNativeScore(document, settings)
    expect([8, 12, 16]).toContain(automatic.options.minimumNoteGap)
    for (const coreGap of [undefined, 32]) {
      const continuous = layoutNativeScore(document, { ...settings, paged: false, coreGap })
      expect(rows(continuous)).toEqual(rows(automatic))
    }
    const prepared = new PreparedNumberedNotationScore(document, settings)
    expect(prepared.renderContinuous()).toEqual(NativeNumberedNotationScore.create(document).render({ ...settings, paged: false }))
    expect(prepared.renderPaged()).toEqual(NativeNumberedNotationScore.create(document).render(settings))
  })

  it('honors a fixed spacing override and validates supplied options before probing', () => {
    const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 |||')
    expect(layoutNativeScore(document, { ...options, minimumNoteGap: 12 }).options.minimumNoteGap).toBe(12)
    expect(() => layoutNativeScore(document, { ...options, coreGap: -1 })).toThrow('非负有限数值')
  })
})

it.each([{fixedDo:false,width:480,file:'valsentino_01.m3n'}, {fixedDo:true,width:640,file:'katyusha_01.m3n'}, {fixedDo:false,width:720,file:'flower_dance_01.m3n'}])('isolates projection state between independent layouts ($file, $width, fixedDo=$fixedDo)', ({width,fixedDo,file}) => {
  const source = readFileSync(new URL('../../../src/scores/'+file,import.meta.url),'utf8')
  const document = parseM3NDocument(source), before = structuredClone(document)
  const settings = {width,pageMargin:0,paged:true,fixedDo}, timings: Record<string,number> = {}
  const automatic = layoutNativeScore(document,settings,timings)
  const reference = layoutNativeScore(document, {
    ...settings, coreGap:scoreVerticalSpacing().minimum, minimumNoteGap:automatic.options.minimumNoteGap, lineDensityTarget:automatic.options.lineDensityTarget,
  })
  repaginateNativeLayout(reference,true)
  expect(renderNativePages(automatic)).toEqual(renderNativePages(reference))
  expect(document).toEqual(before)
  expect(timings.projectionBuilds).toBe(1)
  expect(timings.projectionReuses).toBeGreaterThanOrEqual(1)
  expect(timings.relationPlanBuilds).toBe(1)
  expect(timings.relationPlanReuses).toBeGreaterThanOrEqual(1)
})
