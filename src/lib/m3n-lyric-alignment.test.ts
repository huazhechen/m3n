import { describe, expect, it } from 'vitest'
import { hasForcedLyricOutsideTiedTarget } from './m3n-lyric-alignment'

describe('M3N lyric playback alignment', () => {
  it('keeps tied targets available only to forced lyrics', () => {
    const targets = [{ tied: false }, { tied: true }]
    expect(hasForcedLyricOutsideTiedTarget([{ forceTiedTarget: true }], targets)).toBe(true)
    expect(hasForcedLyricOutsideTiedTarget([{ forceTiedTarget: false }, { forceTiedTarget: true }], targets)).toBe(false)
  })
})
