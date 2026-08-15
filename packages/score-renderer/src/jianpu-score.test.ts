// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ScoreDocument } from '@m3n/notation'
import { analyzeM3N } from '@m3n/notation'
import { JianpuScore } from './jianpu-score.js'
import { layoutMeasures, positionEvents } from './m3n-jianpu-layout.js'

const scoreDocument: ScoreDocument = {
  title: 'Test', subtitle: '', singer: '', composer: '', lyricist: '', arranger: '', copyright: '', source: '', note: '', transpose: '', key: 'C', meterCount: 4, meterUnit: 4, tempo: 100, hasExplicitTempo: true, lyrics: [], intervals: [],
  parts: new Map([['default', { melody: [{ events: [{ sourceStart: 0, sourceEnd: 1, kind: 'note', pitches: ['c'], key: 'C', beats: 1, tie: false, postfixes: [], navigation: [], octaveShift: 0 }], right: 'single' }], bass: [] }]]),
}

describe('JianpuScore', () => {
  it('renders a ScoreDocument directly without JianpuScoreData', () => {
    const score = JianpuScore.create(scoreDocument, { width: 640, paged: false, headerMetadata: [] })
    const paper = document.createElement('div')
    score.attach(paper)
    expect(paper.querySelector('svg.jianpu-page')).not.toBeNull()
    expect(paper.querySelector('g.measure')).not.toBeNull()
    expect(paper.querySelector('#m3n-e-1')).not.toBeNull()
    expect(paper.querySelector('[data-source-start="0"]')).not.toBeNull()
  })

  it('uses ScoreMeasure repeat data and direct event durations in the SVG', () => {
    const withRepeat: ScoreDocument = {
      ...scoreDocument,
      parts: new Map([['score', { melody: [{
        left: 'rptstart', right: 'rptend', ending: '1',
        events: [{ sourceStart: 2, sourceEnd: 3, kind: 'note', pitches: ['c'], key: 'C', beats: 0.5, tie: false, postfixes: [], navigation: [], octaveShift: 0 }],
      }], bass: [] }]]),
    }
    const score = JianpuScore.create(withRepeat, { width: 640, paged: false, headerMetadata: [] })
    const paper = document.createElement('div')
    score.attach(paper)
    expect(paper.querySelectorAll('.repeat-dot')).toHaveLength(4)
    expect(paper.querySelector('.ending-bracket')).not.toBeNull()
    expect(paper.querySelector('.duration-line')).not.toBeNull()
  })

  it('aligns phrase syllables to distinct ScoreDocument events', () => {
    const first = { sourceStart: 10, sourceEnd: 11, kind: 'note' as const, pitches: ['c'], key: 'C', beats: 1, tie: false, postfixes: [], navigation: [], octaveShift: 0 }
    const second = { ...first, sourceStart: 12, sourceEnd: 13, pitches: ['d'] }
    const withLyrics: ScoreDocument = {
      ...scoreDocument,
      lyrics: [{ range: '1', mode: 'char', targetStart: 10, targetEnd: 13, syllables: [
        { text: '你', sourceStart: 0, sourceEnd: 1, forceTiedTarget: false, kind: 'text', underlined: false },
        { text: '好', sourceStart: 1, sourceEnd: 2, forceTiedTarget: false, kind: 'text', underlined: false },
      ] }],
      parts: new Map([['score', { melody: [{ events: [first, second] }], bass: [] }]]),
    }
    const score = JianpuScore.create(withLyrics, { width: 640, paged: false, headerMetadata: [] })
    const paper = document.createElement('div')
    score.attach(paper)
    expect([...paper.querySelectorAll('.event-lyric')].map((node) => node.textContent)).toEqual(['你', '好'])
  })

  it('only renders inline settings when the effective ScoreDocument state changes', () => {
    const first = { sourceStart: 10, sourceEnd: 11, kind: 'note' as const, pitches: ['c'], key: 'C', beats: 1, tie: false, postfixes: [], navigation: [], octaveShift: 0, meterCount: 4, meterUnit: 4, tempo: 100 }
    const second = { ...first, sourceStart: 12, sourceEnd: 13, pitches: ['d'], key: 'F', meterCount: 3, meterUnit: 4, tempo: 88 }
    const withChange: ScoreDocument = {
      ...scoreDocument,
      parts: new Map([['score', { melody: [{ events: [first, second] }], bass: [] }]]),
    }
    const score = JianpuScore.create(withChange, { width: 640, paged: false, headerMetadata: [] })
    const paper = document.createElement('div')
    score.attach(paper)
    expect([...paper.querySelectorAll('.m3n-jianpu-inline-setting')].map((node) => node.textContent)).toEqual(['1=F 3/4 ♩=88'])
  })

  it('renders the qian_si_xi corpus score directly from ScoreDocument', () => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/qian_si_xi_01.m3n'), 'utf8')
    const analysis = analyzeM3N(source)
    const score = JianpuScore.create(analysis.score, { width: 920, paged: true, headerMetadata: [] })
    const paper = document.createElement('div')
    score.attach(paper)
    const eventIds = [...paper.querySelectorAll<SVGGElement>('[id^="m3n-e-"]')].map((node) => node.id)
    expect(analysis.conversion.diagnostics).toEqual([])
    expect(paper.querySelectorAll('.score-page-sheet').length).toBeGreaterThan(0)
    expect(eventIds.length).toBeGreaterThan(100)
    expect(new Set(eventIds).size).toBe(eventIds.length)
    expect(paper.querySelectorAll('.repeat-dot').length).toBeGreaterThan(0)
    expect(paper.querySelectorAll('.event-lyric').length).toBeGreaterThan(0)
    expect(paper.querySelectorAll('.m3n-jianpu-inline-setting')).toHaveLength(0)
    const placements = layoutMeasures(analysis.score.parts.get('score')!.melody, 920, 28, 80, 136, 32, 1)
    const systems = new Map<number, typeof placements>()
    for (const placement of placements) systems.set(placement.y, [...(systems.get(placement.y) ?? []), placement])
    const targetRightEdge = Math.max(...placements.map((placement) => placement.x + placement.width))
    for (const system of systems.values()) {
      const rightEdge = Math.max(...system.map((placement) => placement.x + placement.width))
      expect(rightEdge).toBeCloseTo(targetRightEdge, 4)
    }
    const tiedWithinMeasure = placements.flatMap((placement) => {
      const positioned = positionEvents(placement, 1)
      return positioned.flatMap((event, index) => event.event.tie && positioned[index + 1]
        ? [positioned[index + 1]!.centerX - event.centerX]
        : [])
    })
    expect(Math.min(...tiedWithinMeasure)).toBeGreaterThan(24)
    const measureYs = new Set([...paper.querySelectorAll<SVGGElement>('g.measure')]
      .map((measure) => /translate\([^,]+,([^\)]+)\)/.exec(measure.getAttribute('transform') ?? '')?.[1])
      .filter((y): y is string => y !== undefined))
    expect(measureYs.size).toBeGreaterThan(1)
    expect([...paper.querySelectorAll<SVGLineElement>('g.measure .barline-thin')]
      .every((barline) => barline.closest('g.measure')?.getAttribute('transform')?.includes(',') ?? false)).toBe(true)
  })
})
