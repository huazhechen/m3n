import { describe, expect, it } from 'vitest'
import { m3nToAbc } from './m3n-abc'
import { presetScores } from './samples'

describe('bundled score corpus', () => {
  it('contains unique slugs and usable metadata', () => {
    expect(presetScores.length).toBeGreaterThan(50)
    expect(new Set(presetScores.map((score) => score.slug)).size).toBe(presetScores.length)
    expect(presetScores.every((score) => score.title && score.category)).toBe(true)
  })

  it('converts every score with valid source mappings', () => {
    const failures: string[] = []

    for (const score of presetScores) {
      try {
        const result = m3nToAbc(score.source)
        if (!result.output.startsWith('X:1\n') || !result.output.includes('\nK:')) {
          failures.push(`${score.slug}: missing ABC headers`)
        }
        for (const range of result.sourceMap ?? []) {
          if (
            range.sourceStart < 0 ||
            range.sourceEnd > score.source.length ||
            range.sourceStart >= range.sourceEnd ||
            range.outputStart < 0 ||
            range.outputEnd > result.output.length ||
            range.outputStart >= range.outputEnd
          ) {
            failures.push(`${score.slug}: invalid source map`)
            break
          }
        }
      } catch (error) {
        failures.push(`${score.slug}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    expect(failures).toEqual([])
  })
})
