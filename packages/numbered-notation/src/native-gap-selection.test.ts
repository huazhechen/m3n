import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore, repaginateNativeLayout } from './native-layout.js'
import { nativeCoreGap } from './native-style.js'
import { renderNativePages } from './native-svg.js'

it.each(['katyusha_01.m3n', 'flower_dance_01.m3n', 'valsentino_01.m3n'])('matches an explicitly engraved 8px minimum: %s', file => {
  const document = parseM3NDocument(readFileSync(new URL('../../../src/scores/' + file, import.meta.url), 'utf8'))
  for (const width of [528, 624, 768]) for (const fixedDo of [false, true]) {
    const options = { width, fixedDo, paged: true, pageMargin: 0, measureNumbers: true }
    const expected = layoutNativeScore(document, { ...options, coreGap: nativeCoreGap(document), minimumNoteGap: 8 })
    repaginateNativeLayout(expected, true)
    const timings: Record<string, number> = {}
    const actual = layoutNativeScore(document, options, timings)
    expect(actual.options.minimumNoteGap).toBe(expected.options.minimumNoteGap)
    expect(renderNativePages(actual)).toEqual(renderNativePages(expected))
    expect(timings.layoutTrials).toBe(1)
  }
}, 60000)
