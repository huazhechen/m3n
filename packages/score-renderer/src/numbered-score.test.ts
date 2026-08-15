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

  it('uses the normal barline interval for the justified terminal barline', () => {
    const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 |||')
    const measures = (document.parts.get('score')?.melody ?? []).filter((measure) => measure.events.length > 0 || measure.multiRest !== undefined)
    const layout = buildNumberedLayout(measures, { width: 640, padding: 20, fontSize: 18, beatLength: 1 })
    const system = layout[0]
    const measure = system?.measures[0]
    const finalEvent = measure?.placements.at(-1)

    const priorEvent = measure?.placements.at(-2)
    // The visible terminal gap is 35 units while a normal full-note column is
    // 37.5. The invisible post-bar column must not be folded into this gap.
    expect(measure && finalEvent && priorEvent
      ? (measure.barX - finalEvent.center) / (finalEvent.center - priorEvent.center)
      : Number.NaN).toBeCloseTo(35 / 37.5, 3)
    expect(measure?.barX).toBeCloseTo(620, 3)
  })

  it('draws contiguous reduction beams, correct repeat bars, and separate lyric rows', () => {
    const document = parseM3NDocument('{2/4}\nN: ||: (1 2) | (3 4) :|||\nL1: 甲乙 | 丙丁\nL2: 一二 | 三四\nL3: AB | CD')
    const score = NumberedScore.create(document, { width: 640, headerMetadata: [], paged: false })
    const paper = globalThis.document.createElement('div')
    score.attach(paper)
    const beams = paper.querySelectorAll<SVGLineElement>('.numbered-beam')
    expect(beams).not.toHaveLength(0)
    expect([...beams].some((beam) => Number(beam.getAttribute('x2')) > Number(beam.getAttribute('x1')) + 20)).toBe(true)
    expect(paper.querySelectorAll('.numbered-repeat')).not.toHaveLength(0)
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
    expect(paper.querySelectorAll('.numbered-navigation').length).toBeGreaterThanOrEqual(3)

    const firstRepeatBar = paper.querySelector<SVGGElement>('.numbered-bar-rptstart')
    const firstEvent = paper.querySelector<SVGGElement>('#m3n-e-1 .numbered-number')
    expect(Number(firstEvent?.getAttribute('data-numbered-x'))).toBeGreaterThan(Number(firstRepeatBar?.getAttribute('data-bar-x')))
  })

  it('places a forward repeat at the start of a new system after a repeat end', () => {
    const document = parseM3NDocument('{2/4}\nN: 1 2 :||: 3 4 |||')
    const score = NumberedScore.create(document, { width: 640, headerMetadata: [], paged: false })
    const paper = globalThis.document.createElement('div')
    score.attach(paper)

    expect(paper.querySelectorAll('.numbered-bar-rptend')).toHaveLength(1)
    expect(paper.querySelectorAll('.numbered-bar-rptstart')).toHaveLength(1)
    expect(paper.querySelectorAll('.numbered-system')).toHaveLength(2)
  })

  it('reserves a system-leading structural column for an alternate ending', () => {
    const document = parseM3NDocument('{2/4}\nN: 1 2 |||')
    const measure = document.parts.get('score')?.melody.find((item) => item.events.length > 0)
    if (measure) measure.ending = '1'
    const layout = buildNumberedLayout(measure ? [measure] : [], { width: 480, padding: 20, fontSize: 18, beatLength: 1 })
    const systemMeasure = layout[0]?.measures[0]

    expect(systemMeasure?.leftBarX).toBe(20)
    expect(systemMeasure?.placements[0]?.center).toBeGreaterThan(20)
  })

  it('draws repeat boundaries as separated rules instead of opaque glyph blocks', () => {
    const document = parseM3NDocument('{2/4}\nN: ||: 1 2 :||: 3 4 |||')
    const score = NumberedScore.create(document, { width: 640, headerMetadata: [], paged: false })
    const paper = globalThis.document.createElement('div')
    score.attach(paper)

    expect(paper.querySelectorAll('.numbered-repeat-rule')).not.toHaveLength(0)
    expect(paper.querySelectorAll('.numbered-repeat-dot')).not.toHaveLength(0)
    expect(paper.querySelector('use[href="#xunhuan_zuo"], use[href="#xunhuan_you"], use[href="#xunhuan_zuoyou"]')).toBeNull()
  })

  it('renders changed key, meter, and tempo with the Open Fanqie boundary glyphs', () => {
    const document = parseM3NDocument('{key=C} {2/4} {60qpm}\nN: 1 2 | {key=D} {3/4} {90qpm} 3 4 5 |||')
    const score = NumberedScore.create(document, { width: 640, headerMetadata: [], paged: false })
    const paper = globalThis.document.createElement('div')
    score.attach(paper)
    const changedMeasure = paper.querySelectorAll<SVGGElement>('g.measure')[1]
    const references = [...(changedMeasure?.querySelectorAll('use') ?? [])].map((item) => item.getAttribute('href'))

    expect(references).toContain('#diaohao_fu')
    expect(references).toContain('#linshi_paihao_fenxian')
    expect(changedMeasure?.textContent).toContain('= 90')
  })

  it('keeps a dotted eighth as a reduced note instead of a dotted quarter', () => {
    const document = parseM3NDocument('{2/4}\nN: 1 2 |||')
    const firstEvent = document.parts.get('score')?.melody[0]?.events[0]
    if (firstEvent) firstEvent.beats = 0.75
    const score = NumberedScore.create(document, { width: 480, fontSize: 18, headerMetadata: [], paged: false })
    const paper = globalThis.document.createElement('div')
    score.attach(paper)

    expect(paper.querySelector('#m3n-e-1 .numbered-duration-dot')).not.toBeNull()
    expect(paper.querySelector('#m3n-e-1 + .numbered-beam, .numbered-beam[data-duration-level="1"]')).not.toBeNull()
  })

  it('places D.S. left of its terminal barline rather than over it', () => {
    const document = parseM3NDocument('{2/4}\nN: 1 2 {ds} |||')
    const score = NumberedScore.create(document, { width: 480, fontSize: 18, headerMetadata: [], paged: false })
    const paper = globalThis.document.createElement('div')
    score.attach(paper)

    const navigation = paper.querySelector<SVGGElement>('use[href="#xiaojiexian_ds"]')?.parentElement
    const terminalBar = paper.querySelector<SVGGElement>('.numbered-bar-end')
    expect(Number(navigation?.getAttribute('data-numbered-navigation-x'))).toBeLessThan(Number(terminalBar?.getAttribute('data-bar-x')))
  })

  it('gives a long note an independent Open Fanqie sustain column', () => {
    const document = parseM3NDocument('{2/4}\nN: 1 2 |||')
    const firstEvent = document.parts.get('score')?.melody[0]?.events[0]
    if (firstEvent) firstEvent.beats = 2
    const score = NumberedScore.create(document, { width: 480, fontSize: 18, headerMetadata: [], paged: false })
    const paper = globalThis.document.createElement('div')
    score.attach(paper)

    const noteX = Number(paper.querySelector('#m3n-e-1 .numbered-number')?.getAttribute('data-numbered-x'))
    const sustainX = Number(paper.querySelector('.numbered-sustain')?.getAttribute('data-numbered-sustain-x'))
    expect(paper.querySelector('.numbered-sustain use')?.getAttribute('href')).toBe('#yanyinfu')
    expect(sustainX - noteX).toBeGreaterThan(18)
  })

  it('renders tuplets as compact Fanqie digits beneath a numbered arc', () => {
    const document = parseM3NDocument('{2/4}\nN: [123:2] 4 |||')
    const score = NumberedScore.create(document, { width: 480, headerMetadata: [], paged: false })
    const paper = globalThis.document.createElement('div')
    score.attach(paper)

    expect(paper.querySelector('.numbered-tuplet')).not.toBeNull()
    expect(paper.querySelectorAll('.numbered-tuplet-number')).toHaveLength(3)
    expect(paper.querySelector('.numbered-tuplet-label use')?.getAttribute('href')).toBe('#lianyin_shuzi_3')
  })

  it('raises ties over high octave dots using the Verovio-style clearance', () => {
    const document = parseM3NDocument('{2/4}\nN: 1~ 2 | 1e~ 2e |||')
    const score = NumberedScore.create(document, { width: 480, fontSize: 18, headerMetadata: [], paged: false })
    const paper = globalThis.document.createElement('div')
    score.attach(paper)
    const ties = [...paper.querySelectorAll<SVGPathElement>('.numbered-tie')].map((tie) => tie.getAttribute('d') ?? '')

    expect(ties).toHaveLength(2)
    expect(ties[0]).toContain('-16')
    expect(ties[1]).toContain('-21')
  })
})
