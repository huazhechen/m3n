import { describe, expect, it } from 'vitest'
import { createPlaybackSource, scoreFileName, withoutBassStaff } from './score-document'

describe('score document utilities', () => {
  it('creates a safe file name from the title', () => {
    expect(scoreFileName('X:1\nT:A/B: C?\nK:C\nC')).toBe('A-B- C-')
    expect(scoreFileName('K:C\nC')).toBe('m3n-score')
  })

  it('removes the bass voice and score directive', () => {
    const abc = 'X:1\nK:C\n%%score { melody | bass }\nV:melody\nC D\nV:bass clef=bass\nC, D,'
    expect(withoutBassStaff(abc)).toBe('X:1\nK:C\nV:melody\nC D')
  })

  it('expands part order for playback and maps positions to the source', () => {
    const abc = 'X:1\nP:A B A\nK:C\nP:A\nC D |\nP:B\nE F |\n'
    const playback = createPlaybackSource(abc)
    expect(playback.abc).toContain('P:A\nC D |\nP:B\nE F |\nP:A\nC D |')

    const repeatedNote = playback.abc.lastIndexOf('C D')
    expect(playback.toOriginalPosition(repeatedNote)).toBe(abc.indexOf('C D'))
  })

  it('keeps input unchanged when a declared part is missing', () => {
    const abc = 'X:1\nP:A B\nK:C\nP:A\nC D |\n'
    const playback = createPlaybackSource(abc)
    expect(playback.abc).toBe(abc)
    expect(playback.toOriginalPosition(7)).toBe(7)
  })
})
