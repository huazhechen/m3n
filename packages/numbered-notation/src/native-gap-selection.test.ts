import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore, repaginateNativeLayout } from './native-layout.js'
import { nativeLayoutScore } from './native-quality.js'
import { nativeCoreGap, nativeStyle } from './native-style.js'
import { renderNativePages } from './native-svg.js'

it.each(['katyusha_01.m3n', 'flower_dance_01.m3n', 'valsentino_01.m3n'])('matches exhaustive fully engraved spacing trials: %s', file => {
  const document = parseM3NDocument(readFileSync(new URL('../../../src/scores/' + file, import.meta.url), 'utf8'))
  for (const width of [528, 624, 768]) for (const fixedDo of [false, true]) {
    const options = { width, fixedDo, paged: true, pageMargin: 0, measureNumbers: true }
    const trials = nativeStyle.noteGapCandidates.flatMap(minimumNoteGap => {
      try { return [layoutNativeScore(document, { ...options, coreGap: nativeCoreGap(document), minimumNoteGap })] }
      catch (error) {
        if (minimumNoteGap !== nativeStyle.minimumNoteGap && error instanceof Error && error.message.includes('单个谱行')) return []
        throw error
      }
    })
    trials.sort((a, b) => a.pages.length - b.pages.length || a.systems.length - b.systems.length || nativeLayoutScore(b) - nativeLayoutScore(a) || a.options.minimumNoteGap! - b.options.minimumNoteGap!)
    const expected = trials[0]!
    repaginateNativeLayout(expected, true)
    const timings: Record<string, number> = {}
    const actual = layoutNativeScore(document, options, timings)
    expect(actual.options.minimumNoteGap).toBe(expected.options.minimumNoteGap)
    expect(renderNativePages(actual)).toEqual(renderNativePages(expected))
    expect(timings.layoutTrials).toBe(nativeStyle.noteGapCandidates.length)
  }
}, 60000)
