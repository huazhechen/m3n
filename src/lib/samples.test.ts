import { describe, expect, it } from 'vitest'
import { m3nToMei } from './m3n-mei'
import { presetScores } from './samples'

describe('bundled score corpus', () => {
  it('contains unique slugs and usable metadata', () => {
    expect(presetScores.length).toBeGreaterThan(50)
    expect(new Set(presetScores.map((score) => score.slug)).size).toBe(presetScores.length)
    expect(presetScores.every((score) => score.title)).toBe(true)
    expect(presetScores.every((score) => score.keySignature && score.timeSignature && score.tempo > 0)).toBe(true)
    expect(presetScores.every((score) => score.melodyComplexity >= 1 && score.melodyComplexity <= 5)).toBe(true)
    expect(presetScores.map((score) => score.order)).toEqual([...presetScores.map((score) => score.order)].sort((left, right) => left - right))
    expect(presetScores.map((score) => score.melodyComplexity)).toEqual(
      [...presetScores.map((score) => score.melodyComplexity)].sort((left, right) => left - right),
    )
  })

  it('converts every score with valid source mappings', () => {
    const failures: string[] = []

    for (const score of presetScores) {
      try {
        const result = m3nToMei(score.source)
        if (!result.mei.startsWith('<?xml') || !result.mei.includes('<scoreDef')) {
          failures.push(`${score.slug}: missing MEI score`)
        }
        for (const range of result.sourceMap) {
          if (
            range.sourceStart < 0 ||
            range.sourceEnd > score.source.length ||
            range.sourceStart >= range.sourceEnd ||
            !range.xmlId
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

  it('detects numbered lyric blocks in score metadata', () => {
    expect(presetScores.find((score) => score.slug === '00020')?.hasLyrics).toBe(true)
  })
})
