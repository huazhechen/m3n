import { describe, expect, it } from 'vitest'
import { m3nToMei } from '@m3n/notation'
import { loadPresetScore, presetScores } from './samples'

describe('bundled score corpus', () => {
  it('contains uniquely identified scores with usable metadata', () => {
    expect(presetScores.length).toBeGreaterThan(0)
    expect(new Set(presetScores.map((score) => score.slug)).size).toBe(presetScores.length)
    expect(presetScores.every((score) => score.title)).toBe(true)
    expect(presetScores.every((score) => score.keySignature && score.timeSignature && score.tempo > 0)).toBe(true)
  })

  it('returns no source for an unknown score and keeps bodies out of the index', async () => {
    expect(await loadPresetScore('missing-score')).toBeNull()
    expect(presetScores.every(score => !('source' in score))).toBe(true)
  })

  it('converts every lazy score with valid source mappings', async () => {
    const failures: string[] = []

    for (const score of presetScores) {
      try {
        const source = await loadPresetScore(score.slug)
        if (source === null) throw new Error('Missing score body')
        const result = m3nToMei(source)
        if (!result.mei.startsWith('<?xml') || !result.mei.includes('<scoreDef')) {
          failures.push(`${score.slug}: missing MEI score`)
        }
        for (const range of result.sourceMap) {
          if (
            range.sourceStart < 0 ||
            range.sourceEnd > source.length ||
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
})
