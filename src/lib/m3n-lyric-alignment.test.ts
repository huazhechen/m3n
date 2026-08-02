import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from './m3n-direct'
import { hasForcedLyricOutsideTiedTarget, playbackLyricCounts, playbackLyricTargets, sharedLyricRangeCount } from './m3n-lyric-alignment'

describe('M3N lyric playback alignment', () => {
  it('keeps tied targets available only to forced lyrics', () => {
    const document = parseM3NDocument('{2/4}\n1~ 1 |||')

    expect(playbackLyricCounts(document)).toEqual(new Map([[1, 1]]))
    expect(sharedLyricRangeCount(document, new Set([1]))).toBe(1)
    expect(playbackLyricTargets(document).get(1)).toEqual([{ tied: false }, { tied: true }])
    expect(hasForcedLyricOutsideTiedTarget([{ forceTiedTarget: true }], playbackLyricTargets(document).get(1) ?? [])).toBe(true)
    expect(hasForcedLyricOutsideTiedTarget([{ forceTiedTarget: false }, { forceTiedTarget: true }], playbackLyricTargets(document).get(1) ?? [])).toBe(false)
  })
})
