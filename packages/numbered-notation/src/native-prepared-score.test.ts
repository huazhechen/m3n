import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { NativeNumberedNotationScore, numberedLayoutQuality, PreparedNumberedNotationScore, renderSharedNumberedNotationScores, renderSharedPreparedNumberedNotationScores } from './native-score.js'

describe('prepared export layouts', () => {
  it.each([
    '{title=旋律}{4/4}\nN: 1 2 3 4 |{br} (5 6) 7 1u |||\nL: 春天 来到 这里',
    '{title=基本功}{equal-measures=true}{4/4}\nN: ' + '1 2 3 4 |{br} '.repeat(45),
    '{title=低音}{3/4}\nN: ||: 1 2 3 |{br} 4 5 6 :||\nB: 1d 2d 3d | 4d 5d 6d |',
  ])('matches fresh paged and continuous renders across repeated mode changes', source => {
    const document = parseM3NDocument(source)
    const options = { width: 640, pageMargin: 0 }
    const timings: Record<string, number> = {}
    const prepared = new PreparedNumberedNotationScore(document, options, timings)
    const fresh = (paged: boolean, coreGap?: number) => NativeNumberedNotationScore.create(document).render({ ...options, paged, coreGap })
    const paged = fresh(true)
    const quality = numberedLayoutQuality(document, { ...options, paged: true })
    expect(prepared.quality).toEqual(quality)
    expect(timings.layoutTrials).toBeGreaterThan(0)
    expect(timings.projectionMs).toBeGreaterThanOrEqual(0)
    for (const name of ['scoreProjectionMs', 'headerGeometryMs', 'relationsMs', 'voltasMs', 'lyricsPlacementMs'])
      expect(timings[name]).toBeGreaterThanOrEqual(0)
    expect(prepared.pageCount).toBe(paged.length)
    expect(prepared.continuousHeight()).toBe(Number(/^<svg\b[^>]*\bheight="([^"]+)"/.exec(fresh(false)[0]!)![1]))
    expect(prepared.renderPaged()).toEqual(paged)
    expect(prepared.renderContinuous()).toEqual(fresh(false))
    expect(prepared.renderContinuous(32)).toEqual(fresh(false, 32))
    expect(prepared.renderPaged(32)).toEqual(fresh(true, 32))
    expect(prepared.renderPaged()).toEqual(paged)
    expect(prepared.quality).toEqual(quality)
  })

  it('fits the same shared pages and preserves standalone renders after sharing', () => {
    const documents = [3, 4].map(rows => parseM3NDocument('{4/4}\nN: ' + '1 2 3 4 |{br} '.repeat(rows)))
    const options = { width: 640, pageMargin: 0 }
    const prepared = documents.map(document => new PreparedNumberedNotationScore(document, options))
    expect(renderSharedPreparedNumberedNotationScores(prepared, 32)).toEqual(renderSharedNumberedNotationScores(documents, options, 32))
    prepared.forEach((score, index) => expect(score.renderPaged()).toEqual(NativeNumberedNotationScore.create(documents[index]!).render({ ...options, paged: true })))
    expect(() => renderSharedPreparedNumberedNotationScores([prepared[0]!, new PreparedNumberedNotationScore(documents[0]!, { ...options, width: 540 })])).toThrow('相同版宽')
    expect(() => renderSharedPreparedNumberedNotationScores(Array(20).fill(prepared[0]))).toThrow('最小核心行距')
  })
  it.each([2, 3])('distributes spare space equally after each of %i whole scores after row gaps reach the 1.6em ceiling', count => {
    const documents = Array.from({ length: count }, (_, index) => parseM3NDocument(`{title=曲目${index}}{4/4}\nN: 1 2 3 4 |||`))
    const options = { width: 640, pageMargin: 0 }
    const scores = documents.map(document => new PreparedNumberedNotationScore(document, options))
    const result = renderSharedPreparedNumberedNotationScores(scores, 32)
    expect(result.coreGap).toBeCloseTo(38.4)
    expect(result.scoreGap).toBeGreaterThan(32)
    expect(result.trailingGap).toBeCloseTo(result.scoreGap - 32, 8)
    const heights = scores.map(score => score.continuousHeight(result.coreGap))
    expect(heights.reduce((a, b) => a + b, 0) + result.scoreGap * (count - 1) + result.trailingGap).toBeCloseTo(Math.floor(640 * 273 / 186), 8)
    expect(result.usedHeight).toBe(Math.floor(640 * 273 / 186))
    expect(result.markup).toEqual(documents.map(document => NativeNumberedNotationScore.create(document).render({ ...options, paged: false, coreGap: result.coreGap })[0]))
  })

})
