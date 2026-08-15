// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { NumberedScore } from './numbered-score.js'
import { buildNumberedLayout } from './numbered-layout.js'

describe('NumberedScore', () => {
  it('lays out whole measures, preserves event IDs, and anchors lyrics below their notes', () => {
    const document = parseM3NDocument('{key=C} {2/4}\nN: 1^ 2^ | 3 4 |||\nL: 春天 | 来了')
    const firstEvent = document.parts.get('score')?.melody[0]?.events[0]
    if (firstEvent) firstEvent.beats = 0.5
    const score = NumberedScore.create(document, { width: 360, headerMetadata: [], paged: false })
    const paper = globalThis.document.createElement('div')
    score.attach(paper)
    expect(paper.querySelectorAll('svg.numbered-score')).toHaveLength(1)
    expect(paper.querySelectorAll('g.measure')).toHaveLength(2)
    expect(paper.querySelector('#m3n-e-1')).not.toBeNull()
    expect(paper.querySelectorAll('.numbered-lyric')).not.toHaveLength(0)
    expect(paper.querySelectorAll('.numbered-beam')).not.toHaveLength(0)
  })

  it('reserves lyric width before system wrapping instead of allowing text to overlap', () => {
    const document = parseM3NDocument('{key=C} {2/4}\nN: 1 2 | 3 4 |||\nL: 长长 | 歌词')
    const measures = (document.parts.get('score')?.melody ?? []).filter((measure) => measure.events.length > 0 || measure.multiRest !== undefined)
    const layout = buildNumberedLayout(measures, {
      width: 320,
      padding: 28,
      fontSize: 30,
      beatLength: 1,
      lyricOverflow: () => 120,
    })
    expect(layout).toHaveLength(2)
    expect(layout[0]?.measures).toHaveLength(1)
    expect(layout[1]?.measures).toHaveLength(1)
  })

  it('draws contiguous reduction beams, correct repeat bars, and separate lyric rows', () => {
    const document = parseM3NDocument('{2/4}\nN: ||: (1 2) | (3 4) :|||\nL1: 甲乙 | 丙丁\nL2: 一二 | 三四\nL3: AB | CD')
    const score = NumberedScore.create(document, { width: 640, headerMetadata: [], paged: false })
    const paper = globalThis.document.createElement('div')
    score.attach(paper)
    const beams = paper.querySelectorAll<SVGLineElement>('.numbered-beam')
    expect(beams).not.toHaveLength(0)
    expect([...beams].some((beam) => Number(beam.getAttribute('x2')) > Number(beam.getAttribute('x1')) + 20)).toBe(true)
    expect(paper.querySelectorAll('.numbered-bar-heavy')).not.toHaveLength(0)
    expect(paper.querySelectorAll('[data-lyric-row="0"]')).not.toHaveLength(0)
    expect(paper.querySelectorAll('[data-lyric-row="1"]')).not.toHaveLength(0)
    expect(paper.querySelectorAll('[data-lyric-row="2"]')).not.toHaveLength(0)
  })

  it('renders a Fanqie-style header, ending bracket, navigation marks, dots, and a clear forward repeat column', () => {
    const document = parseM3NDocument('{title=测试曲} {key=D#} {3/4} {90qpm}\nN: ||: 1. 2 3 |\n---V1\nN: 4~ 5 6 {fine} :||{x3}\n---V2\nN: {dc}7 1e 2e ||| {ds}')
    const score = NumberedScore.create(document, { width: 640, headerMetadata: [], paged: false })
    const paper = globalThis.document.createElement('div')
    score.attach(paper)

    expect(paper.querySelector('[data-numbered-key="D#"]')).not.toBeNull()
    expect(paper.querySelector('[data-numbered-tempo="90"]')).not.toBeNull()
    expect(paper.querySelector('.numbered-duration-dot')).not.toBeNull()
    expect(paper.querySelector('.numbered-ending')).not.toBeNull()
    expect(paper.querySelector('.numbered-tie')).not.toBeNull()
    expect(paper.textContent).toContain('Fine')
    expect(paper.textContent).toContain('D.C.')
    expect(paper.textContent).toContain('D.S.')

    const firstRepeatBar = paper.querySelector<SVGGElement>('.numbered-bar-rptstart')
    const firstEvent = paper.querySelector<SVGGElement>('#m3n-e-1 .numbered-number')
    expect(Number(firstEvent?.getAttribute('data-numbered-x'))).toBeGreaterThan(Number(firstRepeatBar?.getAttribute('data-bar-x')))
  })
})
