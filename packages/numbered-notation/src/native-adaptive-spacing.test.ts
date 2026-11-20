import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { NativeNumberedNotationScore, PreparedNumberedNotationScore } from './native-score.js'

describe('page-aware automatic note spacing', () => {
  const options = { width: 320, pageMargin: 0, paged: true }
  const rows = (layout: ReturnType<typeof layoutNativeScore>) => layout.systems.map(system =>
    system.measures.map(measure => measure.columns.map(column => column.glyphs.map(glyph => [glyph.id, glyph.x]))))

  it('uses spare page capacity to give Por una cabeza more readable rows', () => {
    const source = readFileSync(new URL('../../../src/scores/por_una_cabeza_01.m3n', import.meta.url), 'utf8')
    const document = parseM3NDocument(source), before = structuredClone(document)
    const settings = { ...options, width: 540 }
    const compact = layoutNativeScore(document, { ...settings, minimumNoteGapEm: .4 })
    const automatic = layoutNativeScore(document, settings)
    expect(automatic.options.minimumNoteGapEm).toBe(.6)
    expect(automatic.pages).toHaveLength(compact.pages.length)
    expect(automatic.systems.length).toBeGreaterThan(compact.systems.length)
    expect(document).toEqual(before)
  })

  it('chooses the largest safe step without assuming page counts are monotonic', () => {
    const document = parseM3NDocument('{4/4}\nN: ' + '(1 2 3 4 5 6 7 1e) | '.repeat(31))
    const settings = { ...options, width: 540 }
    const automatic = layoutNativeScore(document, settings)
    expect(automatic.options.minimumNoteGapEm).toBe(.55)
    expect(automatic.pages).toHaveLength(1)
    expect(layoutNativeScore(document, { ...settings, minimumNoteGapEm: .6 }).pages.length).toBeGreaterThan(1)
    for (const coreGap of [undefined, 32]) {
      const continuous = layoutNativeScore(document, { ...settings, paged: false, coreGap })
      expect(continuous.options.minimumNoteGapEm).toBe(automatic.options.minimumNoteGapEm)
      expect(rows(continuous)).toEqual(rows(automatic))
    }
    const prepared = new PreparedNumberedNotationScore(document, settings)
    expect(prepared.renderContinuous()).toEqual(NativeNumberedNotationScore.create(document).render({ ...settings, paged: false }))
    expect(prepared.renderPaged()).toEqual(NativeNumberedNotationScore.create(document).render(settings))
  })

  it('falls back to 0.4 when every wider step would add a page', () => {
    const document = parseM3NDocument('{4/4}\nN: ' + '(1 2 3 4 5 6 7 1e) | '.repeat(10))
    const automatic = layoutNativeScore(document, options)
    expect(automatic.options.minimumNoteGapEm).toBe(.4)
    expect(automatic.pages).toHaveLength(1)
    for (const gap of [.45, .5, .55, .6]) {
      expect(layoutNativeScore(document, { ...options, minimumNoteGapEm: gap }).pages.length).toBeGreaterThan(1)
    }
  })

  it('honors a fixed spacing override and validates supplied options before probing', () => {
    const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 |||')
    expect(layoutNativeScore(document, { ...options, minimumNoteGapEm: .5 }).options.minimumNoteGapEm).toBe(.5)
    expect(() => layoutNativeScore(document, { ...options, coreGap: -1 })).toThrow('非负有限数值')
  })
})
