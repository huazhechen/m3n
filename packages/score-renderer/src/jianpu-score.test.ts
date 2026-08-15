// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { JianpuScoreData } from '@m3n/notation'
import { JianpuScore } from './jianpu-score'

function makeData(overrides: Partial<JianpuScoreData> = {}): JianpuScoreData {
  const notes = Array.from({ length: 4 }, (_, index) => ({
    staff: 'melody' as const,
    start: index,
    length: 1,
    pitch: 60 + index * 2,
    xmlId: `m3n-e-${index + 1}`,
    sourceStart: index * 3,
    sourceEnd: index * 3 + 3,
    staccato: false,
    trill: false,
    accent: false,
  }))
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
    notes,
    measures: Array.from({ length: 1 }, (_, index) => ({
      partIndex: 0,
      index,
      number: index + 1,
      start: index * 4,
      length: 4,
      meterCount: 4,
      meterUnit: 4,
      xmlId: `m3n-measure-1-${index + 1}`,
      repeatStart: false,
      repeatEnd: false,
      navigation: [],
    })),
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

function longData(measureCount: number): JianpuScoreData {
  return makeData({
    notes: Array.from({ length: measureCount * 4 }, (_, index) => ({
      staff: 'melody' as const,
      start: index,
      length: 1,
      pitch: 60 + (index % 7) * 2,
      xmlId: `m3n-e-${index + 1}`,
      sourceStart: index,
      sourceEnd: index + 1,
      staccato: false,
      trill: false,
      accent: false,
    })),
    measures: Array.from({ length: measureCount }, (_, index) => ({
      partIndex: 0,
      index,
      number: index + 1,
      start: index * 4,
      length: 4,
      meterCount: 4,
      meterUnit: 4,
      xmlId: `m3n-measure-1-${index + 1}`,
      repeatStart: false,
      repeatEnd: false,
      navigation: [],
    })),
  })
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

  it('stacks several systems on one page instead of one row per page', () => {
    const score = JianpuScore.create(longData(24), { width: 800, paged: true, headerMetadata: [] })
    const pages = score.pagesClone()
    expect(pages).toHaveLength(1)
    const systems = pages[0]?.querySelectorAll('.m3n-jianpu-system') ?? []
    expect(systems.length).toBeGreaterThanOrEqual(2)
    expect(pages[0]?.querySelectorAll('g.measure[id]')).toHaveLength(24)
  })

  it('breaks onto a second page when systems exceed the page height', () => {
    const score = JianpuScore.create(longData(60), { width: 800, paged: true, headerMetadata: [] })
    const pages = score.pagesClone()
    expect(pages.length).toBeGreaterThanOrEqual(2)
  })
})
