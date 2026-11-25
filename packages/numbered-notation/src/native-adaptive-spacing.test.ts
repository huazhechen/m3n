import { renderNativePages } from './native-svg.js'
import { nativeLayoutScore } from './native-quality.js'
import { nativeStyle } from './native-style.js'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore, repaginateNativeLayout } from './native-layout.js'
import { NativeNumberedNotationScore, PreparedNumberedNotationScore } from './native-score.js'

describe('page-aware automatic note spacing', () => {
  const options = { width: 320, pageMargin: 0, paged: true }
  const rows = (layout: ReturnType<typeof layoutNativeScore>) => layout.systems.map(system =>
    system.measures.map(measure => measure.columns.map(column => column.glyphs.map(glyph => [glyph.id, glyph.x]))))

  it('prefers better whole-score quality over the widest spacing at equal page count', () => {
    const source = readFileSync(new URL('../../../src/scores/por_una_cabeza_01.m3n', import.meta.url), 'utf8')
    const document = parseM3NDocument(source), before = structuredClone(document)
    const settings = { ...options, width: 540 }
    const compact = layoutNativeScore(document, { ...settings, minimumNoteGap: 9 })
    const automatic = layoutNativeScore(document, settings)
    expect(automatic.options.minimumNoteGap).toBe(9)
    expect(automatic.pages).toHaveLength(compact.pages.length)
    const wider = layoutNativeScore(document, { ...settings, minimumNoteGap: 15 })
    expect(wider.pages).toHaveLength(compact.pages.length)
    expect(nativeLayoutScore(automatic)).toBeGreaterThan(nativeLayoutScore(wider))
    expect(document).toEqual(before)
  })

  it('scores all three steps and preserves continuous and paged layout agreement', () => {
    const document = parseM3NDocument('{4/4}\nN: ' + '(1 2 3 4 5 6 7 1e) | '.repeat(31))
    const settings = { ...options, width: 540 }
    const automatic = layoutNativeScore(document, settings)
    expect(automatic.options.minimumNoteGap).toBe(9)
    expect(automatic.pages).toHaveLength(1)
    expect(layoutNativeScore(document, { ...settings, minimumNoteGap: 15 }).pages.length).toBeGreaterThan(1)
    for (const coreGap of [undefined, 32]) {
      const continuous = layoutNativeScore(document, { ...settings, paged: false, coreGap })
      expect(continuous.options.minimumNoteGap).toBe(automatic.options.minimumNoteGap)
      expect(rows(continuous)).toEqual(rows(automatic))
    }
    const prepared = new PreparedNumberedNotationScore(document, settings)
    expect(prepared.renderContinuous()).toEqual(NativeNumberedNotationScore.create(document).render({ ...settings, paged: false }))
    expect(prepared.renderPaged()).toEqual(NativeNumberedNotationScore.create(document).render(settings))
  })

  it('falls back to 9px when every wider step would add a page', () => {
    const document = parseM3NDocument('{4/4}\nN: ' + '(1 2 3 4 5 6 7 1e) | '.repeat(10))
    const settings = { ...options, width: 340 }
    const automatic = layoutNativeScore(document, settings)
    expect(automatic.options.minimumNoteGap).toBe(9)
    expect(automatic.pages).toHaveLength(1)
    for (const gap of [12, 15]) {
      expect(layoutNativeScore(document, { ...settings, minimumNoteGap: gap }).pages.length).toBeGreaterThan(1)
    }
  })

  it('honors a fixed spacing override and validates supplied options before probing', () => {
    const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 |||')
    expect(layoutNativeScore(document, { ...options, minimumNoteGap: 12 }).options.minimumNoteGap).toBe(12)
    expect(() => layoutNativeScore(document, { ...options, coreGap: -1 })).toThrow('非负有限数值')
  })
})

it.each([false,true].flatMap(fixedDo=>[480,640,720].flatMap(width=>['valsentino_01.m3n','katyusha_01.m3n','flower_dance_01.m3n'].map(file=>({fixedDo,width,file})))))('isolates projection state between automatic spacing trials ($file, $width, fixedDo=$fixedDo)', ({width,fixedDo,file}) => {
  const source = readFileSync(new URL('../../../src/scores/'+file,import.meta.url),'utf8')
  const document = parseM3NDocument(source), before = structuredClone(document)
  const settings = {width,pageMargin:0,paged:true,fixedDo}, timings: Record<string,number> = {}
  const automatic = layoutNativeScore(document,settings,timings)
  const candidates = [9,12,15].map(minimumNoteGap => layoutNativeScore(document, {
    ...settings, coreGap:nativeStyle.minimumCoreGap, minimumNoteGap,
  }))
  candidates.sort((a,b) => a.pages.length-b.pages.length || nativeLayoutScore(b)-nativeLayoutScore(a)
    || a.options.minimumNoteGap!-b.options.minimumNoteGap!)
  const reference = candidates[0]!
  repaginateNativeLayout(reference,true)
  expect(renderNativePages(automatic)).toEqual(renderNativePages(reference))
  expect(document).toEqual(before)
  expect(timings.projectionBuilds).toBe(1)
  expect(timings.projectionReuses).toBe(timings.layoutTrials!-1)
  expect(timings.relationPlanBuilds).toBe(1)
  expect(timings.relationPlanReuses).toBe(timings.layoutTrials!-1)
})
