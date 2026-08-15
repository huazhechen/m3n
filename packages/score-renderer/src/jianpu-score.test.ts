// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { JianpuScoreData } from '@m3n/notation'
import { JianpuScore } from './jianpu-score'

function makeData(overrides: Partial<JianpuScoreData> = {}): JianpuScoreData {
  return {
    title: 'Test',
    subtitle: '',
    singer: '',
    composer: '',
    lyricist: '',
    arranger: '',
    key: 'C',
    tempo: 120,
    meterCount: 4,
    meterUnit: 4,
    hasBass: false,
    notes: [
      { staff: 'melody', start: 0, length: 1, pitch: 60, xmlId: 'm3n-e-1', sourceStart: 0, sourceEnd: 3, staccato: false, trill: false, accent: false },
      { staff: 'melody', start: 1, length: 1, pitch: 62, xmlId: 'm3n-e-2', sourceStart: 3, sourceEnd: 6, staccato: false, trill: false, accent: false },
      { staff: 'melody', start: 2, length: 1, pitch: 64, xmlId: 'm3n-e-3', sourceStart: 6, sourceEnd: 9, staccato: false, trill: false, accent: false },
      { staff: 'melody', start: 3, length: 1, pitch: 65, xmlId: 'm3n-e-4', sourceStart: 9, sourceEnd: 12, staccato: false, trill: false, accent: false },
    ],
    measures: [
      { partIndex: 0, index: 0, number: 1, start: 0, length: 4, meterCount: 4, meterUnit: 4, xmlId: 'm3n-measure-1-1', repeatStart: false, repeatEnd: false, navigation: [] },
    ],
    keySignatures: [{ start: 0, key: 0 }],
    layoutTimeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
    timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
    tempos: [{ start: 0, qpm: 120 }],
    lyrics: [],
    tuplets: [],
    graces: [],
    continuations: [],
    ...overrides,
  }
}

let originalGetBBox: (() => DOMRect) | undefined

beforeEach(() => {
  originalGetBBox = (SVGElement.prototype as { getBBox?: () => DOMRect }).getBBox
  ;(SVGElement.prototype as { getBBox?: () => DOMRect }).getBBox = function getBBoxMock() {
    const start = this.getAttribute('data-block-start')
    if (start !== null) {
      return { x: Number(start) * 40, y: -30, width: 30, height: 60 } as DOMRect
    }
    if (this.getAttribute('data-id') === 'music') {
      return { x: 0, y: -30, width: 1000, height: 70 } as DOMRect
    }
    return { x: 0, y: 0, width: 20, height: 20 } as DOMRect
  }
  ;(SVGElement.prototype as { getCTM?: () => null }).getCTM = () => null
})

afterEach(() => {
  if (originalGetBBox) (SVGElement.prototype as { getBBox?: () => DOMRect }).getBBox = originalGetBBox
  else delete (SVGElement.prototype as { getBBox?: () => DOMRect }).getBBox
  delete (SVGElement.prototype as { getCTM?: () => null }).getCTM
})

describe('JianpuScore', () => {
  it('renders a paged score with measures, note ids and sheet wrapping', () => {
    const score = JianpuScore.create(makeData(), { width: 800, paged: true, headerMetadata: [] })
    const paper = document.createElement('div')
    score.attach(paper)
    expect(paper.querySelectorAll('svg')).toHaveLength(1)
    expect(paper.querySelector('g.measure#m3n-measure-1-1')).not.toBeNull()
    expect(paper.querySelector('g#m3n-e-1')).not.toBeNull()
    expect(paper.querySelectorAll('.score-page-sheet')).toHaveLength(1)
    expect(paper.querySelectorAll('.measure')).toHaveLength(1)
  })

  it('marks tied continuations with data-m3n-id', () => {
    const data = makeData({
      notes: [
        { staff: 'melody', start: 3, length: 2, pitch: 60, xmlId: 'm3n-e-1', sourceStart: 0, sourceEnd: 6, staccato: false, trill: false, accent: false },
      ],
      continuations: [{ staff: 'melody', start: 4, xmlId: 'm3n-e-2' }],
    })
    const score = JianpuScore.create(data, { width: 800, paged: false, headerMetadata: [] })
    const paper = document.createElement('div')
    score.attach(paper)
    const continuationBlock = paper.querySelector<SVGGElement>('g[data-m3n-id="m3n-e-2"]')
    expect(continuationBlock).not.toBeNull()
    expect(Number(continuationBlock?.getAttribute('data-block-start'))).toBeGreaterThan(3)
  })

  it('renders a separate bass row when the score has bass', () => {
    const data = makeData({
      hasBass: true,
      notes: [
        ...makeData().notes,
        { staff: 'bass', start: 0, length: 4, pitch: 36, xmlId: 'm3n-e-5', sourceStart: 0, sourceEnd: 3, staccato: false, trill: false, accent: false },
      ],
    })
    const score = JianpuScore.create(data, { width: 800, paged: true, headerMetadata: [] })
    const paper = document.createElement('div')
    score.attach(paper)
    expect(paper.querySelector('g#m3n-e-5')).not.toBeNull()
    expect(paper.querySelectorAll('g.measure[id]')).toHaveLength(2)
    expect(paper.querySelector('g.measure#m3n-measure-1-1-bass')).not.toBeNull()
  })

  it('bakes the score header into the first page', () => {
    const score = JianpuScore.create(makeData(), {
      width: 800,
      paged: true,
      headerMetadata: [{ side: 'center', value: '测试标题', priority: 0 }],
    })
    const pages = score.pagesClone()
    expect(pages).toHaveLength(1)
    expect(pages[0]?.textContent).toContain('测试标题')
    expect(pages[0]?.getAttribute('data-m3n-header')).toBe('true')
  })

  it('keeps continuous mode as a single unscrolled page', () => {
    const score = JianpuScore.create(makeData(), { width: 800, paged: false, headerMetadata: [] })
    const pages = score.pagesClone()
    expect(pages).toHaveLength(1)
    expect(pages[0]?.getAttribute('viewBox')).toContain('800')
  })
})
