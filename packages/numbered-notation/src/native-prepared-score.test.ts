import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { NativeNumberedNotationScore, PreparedNumberedNotationScore, renderSharedNumberedNotationScores, renderSharedPreparedNumberedNotationScores } from './native-score.js'
import { layoutNativeScore } from './native-layout.js'

describe('prepared export layouts', () => {
  it.each([
    '{title=旋律}{4/4}\nN: 1 2 3 4 |{br} (5 6) 7 1u |||\nL: 春天 来到 这里',
    '{title=基本功}{leading=0.8}{equal-measures=true}{4/4}\nN: ' + '1 2 3 4 |{br} '.repeat(45),
    '{title=低音}{3/4}\nN: ||: 1 2 3 |{br} 4 5 6 :||\nB: 1d 2d 3d | 4d 5d 6d |',
  ])('matches fresh paged and continuous renders across repeated mode changes', source => {
    const document = parseM3NDocument(source)
    const options = { width: 640, pageMargin: 0 }
    const prepared = new PreparedNumberedNotationScore(document, options)
    const fresh = (paged: boolean, coreGap?: number) => NativeNumberedNotationScore.create(document).render({ ...options, paged, coreGap })
    const paged = fresh(true)
    expect(prepared.pageCount).toBe(paged.length)
    expect(prepared.continuousHeight()).toBe(Math.ceil(layoutNativeScore(document, { ...options, paged: false }).pages[0]!.height))
    expect(prepared.renderPaged()).toEqual(paged)
    expect(prepared.renderContinuous()).toEqual(fresh(false))
    expect(prepared.renderContinuous(32)).toEqual(fresh(false, 32))
    expect(prepared.renderPaged()).toEqual(paged)
  })

  it('fits the same shared pages and preserves standalone renders after sharing', () => {
    const documents = [3, 4].map(rows => parseM3NDocument('{leading=0.8}{4/4}\nN: ' + '1 2 3 4 |{br} '.repeat(rows)))
    const options = { width: 640, pageMargin: 0 }
    const prepared = documents.map(document => new PreparedNumberedNotationScore(document, options))
    expect(renderSharedPreparedNumberedNotationScores(prepared, 32)).toEqual(renderSharedNumberedNotationScores(documents, options, 32))
    prepared.forEach((score, index) => expect(score.renderPaged()).toEqual(NativeNumberedNotationScore.create(documents[index]!).render({ ...options, paged: true })))
    expect(() => renderSharedPreparedNumberedNotationScores([prepared[0]!, new PreparedNumberedNotationScore(documents[0]!, { ...options, width: 540 })])).toThrow('相同版宽')
    expect(() => renderSharedPreparedNumberedNotationScores(Array(20).fill(prepared[0]))).toThrow('最小核心行距')
  })
})
