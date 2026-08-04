import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '../m3n-direct'
import { validateScoreDocument } from './score-rules'

describe('score document rules', () => {
  it('reports mismatched bass measure counts with a source range', () => {
    const source = '{2/4}\nN: 1 2 | 3 4 |||\nB: 1d 2d |||'
    expect(validateScoreDocument(parseM3NDocument(source))).toContainEqual(expect.objectContaining({
      code: 'M3N_BASS_MEASURE_COUNT',
      legacyMessage: '双谱表小节数量不一致：正文 2 小节，低音 1 小节',
      range: { start: source.indexOf('1d'), end: source.indexOf(' |||', source.indexOf('B:')) },
    }))
  })

  it('reports the duration of the corresponding bass measure', () => {
    const source = '{2/4}\nN: 1 2 | 3 4 |||\nB: 1d | 3d 4d |||'
    expect(validateScoreDocument(parseM3NDocument(source))).toContainEqual(expect.objectContaining({
      code: 'M3N_BASS_DURATION_MISMATCH',
      legacyMessage: '双谱表第 1 小节时值不一致：正文 2 拍，低音 1 拍',
    }))
  })
})
