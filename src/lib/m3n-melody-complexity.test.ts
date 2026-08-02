import { describe, expect, it } from 'vitest'
import { assessM3NDocumentMelodyComplexity, assessM3NMelodyComplexity } from './m3n-melody-complexity'
import { parseM3NDocument } from './m3n-direct'

describe('M3N melody complexity', () => {
  it('assesses an already parsed document', () => {
    const source = '{4/4} 1 2 3 4 |||'

    expect(assessM3NDocumentMelodyComplexity(parseM3NDocument(source))).toEqual(assessM3NMelodyComplexity(source))
  })

  it('rates a simple stepwise quarter-note melody near the bottom of the scale', () => {
    const assessment = assessM3NMelodyComplexity('{4/4} 1 2 3 4 | 5 4 3 2 |||')

    expect(assessment.score).toBeGreaterThanOrEqual(1)
    expect(assessment.score).toBeLessThan(2)
    expect(assessment.metrics).toMatchObject({ noteCount: 8, notesPerBeat: 1, pitchRange: 7 })
  })

  it('rewards rhythm, leaps, accidentals, range, and ornaments in a demanding melody', () => {
    const assessment = assessM3NMelodyComplexity([
      '{4/4}',
      '((1 5e 2 6e)) {ac(7e)}3e{tr} 7d {tip} |',
      '([1 4# 7e:2]) ([2 6e 3:2]) 1ee{brk} 7dd{fermata} |||',
    ].join(' '))

    expect(assessment.score).toBeGreaterThan(3)
    expect(assessment.metrics).toMatchObject({ rhythmicValues: 3, accidentalCount: 1 })
    expect(assessment.metrics.pitchRange).toBeGreaterThan(24)
    expect(assessment.metrics.ornamentCount).toBeGreaterThan(1)
    expect(assessment.metrics.maximumLeap).toBeGreaterThan(11)
  })

  it('accounts for tempo, off-beat writing, and local bursts', () => {
    const steady = assessM3NMelodyComplexity('{4/4} {72qpm} 1 2 3 4 |||')
    const demanding = assessM3NMelodyComplexity('{4/4} {180qpm} 1. 2. 3. 4. | ((5 6 7 1e)) |||')

    expect(demanding.score).toBeGreaterThan(steady.score)
    expect(demanding.metrics.notesPerSecond).toBeGreaterThan(steady.metrics.notesPerSecond)
    expect(demanding.metrics.peakNotesPerBeat).toBeGreaterThan(steady.metrics.peakNotesPerBeat)
    expect(demanding.metrics.offbeatRatio).toBeGreaterThan(0)
  })

  it('does not score a pitch change across a rest as a continuous leap', () => {
    const assessment = assessM3NMelodyComplexity('{4/4} 1 0 1ee 0 |||')

    expect(assessment.metrics.maximumLeap).toBe(0)
  })

  it('excludes bass notes from the assessment', () => {
    const simple = assessM3NMelodyComplexity('{4/4} 1 2 3 4 |||')
    const withVirtuosicBass = assessM3NMelodyComplexity('{4/4} 1 2 3 4 ||| {bass} ((1dd 7dd 1ee 7dd)) |||{/}')

    expect(withVirtuosicBass).toEqual(simple)
  })
})
