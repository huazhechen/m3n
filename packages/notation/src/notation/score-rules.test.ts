import { describe, expect, it } from 'vitest' 
import { parseM3NDocument } from '../m3n-direct.js'
import { validateScoreDocument } from './score-rules.js'

describe('score document rules', () => {
  it('accepts adjacent incomplete fragments that form one logical measure', () => {
    const source = '{2/4}\nN: 1\n---\nN: 2 | 3 4 |||'
    expect(validateScoreDocument(parseM3NDocument(source), { source })).toEqual([])
  })

  it('pairs a repeat pickup with each complementary alternate ending', () => {
    const source = [
      '{4/4}',
      'N: ||: 1 | 1 2 3 4 |',
      '---V1',
      'N: 1 2 3 :||',
      '---V2,V3,V4',
      'N: 4 5 6 :||{x4} |||',
    ].join('\n')

    expect(validateScoreDocument(parseM3NDocument(source), { source })).toEqual([])
  })

  it('does not pair incomplete measures across alternate endings', () => {
    const source = '{4/4}\nN: ||: 1 2 3 4 |\n---V1\nN: 1 2 3 :||\n---V2\nN: 4 :|| |||'
    const diagnostics = validateScoreDocument(parseM3NDocument(source), { source })

    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'M3N_METER_INCOMPLETE_MIDDLE',
      messageArgs: expect.objectContaining({ measure: 2, actual: 3 }),
    }))
  })
  it('reports mismatched bass measure counts with a source range', () => {
    const source = '{2/4}\nN: 1 2 | 3 4 |||\nB: 1d 2d |||'
    expect(validateScoreDocument(parseM3NDocument(source))).toContainEqual(expect.objectContaining({
      code: 'M3N_BASS_MEASURE_COUNT',
      message: '双谱表小节数量不一致：正文 2 小节，低音 1 小节',
        range: { start: source.indexOf('1d'), end: source.indexOf('|||', source.indexOf('B:')) + 3 },
      messageArgs: { melodyMeasures: 2, bassMeasures: 1 },
    }))
  })

  it('reports the duration of the corresponding bass measure', () => {
    const source = '{2/4}\nN: 1 2 | 3 4 |||\nB: 1d | 3d 4d |||'
    expect(validateScoreDocument(parseM3NDocument(source))).toContainEqual(expect.objectContaining({
      code: 'M3N_BASS_DURATION_MISMATCH',
      message: '双谱表第 1 小节时值不一致：正文 2 拍，低音 1 拍',
    }))
  })

  it('validates ordinary measure durations without the legacy token state', () => {
    const source = '{4/4}\n1 2 3 | 1 2 3 4 |||'
    expect(validateScoreDocument(parseM3NDocument(source))).toContainEqual(expect.objectContaining({
      code: 'M3N_METER_PICKUP_MISMATCH',
      messageArgs: { first: 3, last: 4, expected: 4 },
    }))
  })

  it('validates ordinary and tuplet tie targets by absolute pitch', () => {
    const ordinarySource = '{key=C} {2/4}\n1 1~ | 2 2 |||'
    const ordinary = validateScoreDocument(parseM3NDocument(ordinarySource), { source: ordinarySource })
    const tuplet = validateScoreDocument(parseM3NDocument('{key=C} {4/4}\n[123~:2] 4 0 |||'))
    expect(ordinary).toContainEqual(expect.objectContaining({
      code: 'M3N_TIE_TARGET_MISMATCH',
      message: '第 2 行，第 1 小节：延音目标的类型或绝对音高不匹配',
      messageArgs: { line: 2, measure: 1 },
    }))
    expect(tuplet.some((item) => item.code === 'M3N_TIE_TARGET_MISMATCH')).toBe(true)
  })

  it('inherits an explicit accidental through the rest of its measure when validating ties', () => {
    const source = '{key=C} {1/4}\n(7b) (7~) | 7b |||'

    expect(validateScoreDocument(parseM3NDocument(source), { source }))
      .not.toContainEqual(expect.objectContaining({ code: 'M3N_TIE_TARGET_MISMATCH' }))
  })
})
