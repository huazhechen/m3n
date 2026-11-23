import { describe, expect, it } from 'vitest'
import { compileScorePerformance } from './performance.js'
import { parseM3NDocument } from './m3n-direct.js'
import { validateM3NDiagnostics } from './m3n-validate.js'
import { formatM3N } from './m3n-format.js'
import { unfoldScorePerformance } from './notation/performance-order.js'

const simple = '{key=C}{4/4}{120qpm}\nN: 1 2 3 4 | {interlude} | 5 6 7 1e |||'

describe('unmeasured instrumental interludes', () => {
  it('keeps a visible semantic marker while adding no playback notes, elements or silence', () => {
    expect(validateM3NDiagnostics(simple)).toEqual([])
    const document = parseM3NDocument(simple)
    expect(document.parts.get('score')!.melody[1]).toMatchObject({ interlude: true, events: [], multiRestState: { key: 'C', tempo: 120 } })
    const performance = compileScorePerformance(document)
    expect(performance.beats).toBe(8)
    expect(performance.notes.map(note => note.start)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(performance.elements).toHaveLength(8)
    expect(unfoldScorePerformance(document).parts.get('score')!.melody[1]!.interlude).toBe(true)
    expect(formatM3N(formatM3N(simple))).toBe(formatM3N(simple))
    expect(parseM3NDocument(formatM3N(simple)).parts.get('score')!.melody[1]!.interlude).toBe(true)
  })

  it('supports marker-only and terminal passages, including an empty aligned bass slot', () => {
    for (const source of [
      '{4/4}\nN: {interlude} |||',
      '{4/4}\nN: 1 2 3 4 | {interlude} |||',
      '{4/4}\nN: 1 2 3 4 | {interlude} | 5 6 7 1e |||\nB: 1d^ 5d^ | | 1d^ 5d^ |',
    ]) {
      expect(validateM3NDiagnostics(source)).toEqual([])
      const document = parseM3NDocument(source)
      const performance = compileScorePerformance(document)
      expect(performance.beats).toBe(source.includes('B:') ? 8 : source.includes('1 2') ? 4 : 0)
    }
  })

  it('retains navigation and settings across skipped passages', () => {
    const source = '{4/4}\nN: ||: 1 2 3 4 |\n---V1\nN: {key=G}{60qpm}{interlude} :||\n---V2\nN: 5 6 7 1e |||'
    expect(validateM3NDiagnostics(source)).toEqual([])
    const performance = compileScorePerformance(parseM3NDocument(source))
    expect(performance.beats).toBe(12)
    expect(performance.notes).toHaveLength(12)
    expect(performance.tempos).toContainEqual({ beat: 4, qpm: 60 })
  })

  it('accepts partial vocal phrases next to a free-time passage without disabling other meter checks', () => {
    expect(validateM3NDiagnostics('{4/4}\nN: (1 2) | {interlude} | 3^ | {interlude} | 4 |||')).toEqual([])
    const errors = validateM3NDiagnostics('{4/4}\nN: 1 2 3 4 | {interlude} | 1 2 3 4 | 1 2 | 1 2 3 4 |||')
    expect(errors.some(error => error.code === 'M3N_METER_INCOMPLETE_MIDDLE')).toBe(true)
    expect(validateM3NDiagnostics('{4/4}\nN: 1 2 3 4 5 | {interlude} | 1 2 3 4 |||')
      .some(error => error.code === 'M3N_METER_OVERFULL')).toBe(true)
  })

  it.each([
    '{4/4}\nN: 1 {interlude} | 1 2 3 4 |||',
    '{4/4}\nN: {interlude} 1 | 1 2 3 4 |||',
    '{4/4}\nN: ({interlude}) | 1 2 3 4 |||',
    '{4/4}\nN: {interlude=2} | 1 2 3 4 |||',
    '{4/4}\nN: {interlude}^ | 1 2 3 4 |||',
    '{interlude}{4/4}\nN: 1 2 3 4 |||',
    '{4/4}\nN: {lg}1 2 3 4 | {interlude} | 1 2 3 4{/} |||',
    '{4/4}\nN: 1 2 3 4~ | {interlude} | 4 3 2 1 |||',
  ])('rejects misplaced, modified, measured or spanned interludes: %s', source => {
    expect(validateM3NDiagnostics(source).some(error => error.severity === 'error')).toBe(true)
  })
})
