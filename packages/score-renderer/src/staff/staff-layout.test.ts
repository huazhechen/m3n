import { scoreLayoutConfig, scoreCoreGap, scoreMaximumCoreGap, scoreLyricGapScale, interpolateScoreCoreGap } from '@m3n/numbered-notation/layout'
import { staffMusicSize } from './staff-music-font.js'
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
import { readFileSync } from 'node:fs'
import { analyzeM3N, scoreEventIds } from '@m3n/notation'
import { prepareStaffScore } from './staff-score.js'
import { projectStaffDocument, splitStaffMeasure } from './staff-document.js'
import { readXml, findAll, nodes, hasClass, SvgGeometry, textMeasurer, element, overlapsX } from './layout-svg.js'
import { arrangeStaffSystem, systemDistance, type StaffSystem } from './system-layout.js'
import { createStaffMeasure, drawStaffMeasure, STAFF_SCALE } from './staff-engine.js'
import { planStaffLines, prepareStaffLineGraph, type StaffMeasureMinimum } from './line-layout.js'
import { engraveStaffSystems } from './staff-system.js'
import { staffHeader } from './staff-header.js'


async function prepare(source: string, width = 720) {
  const analysis = analyzeM3N(source)
  expect(analysis.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  return prepareStaffScore(analysis.score, { width })
}
describe('staff layout contract', () => {
  it('keeps the opening system within 12px of the title ink', () => {
    const score = analyzeM3N('{title=标题}{4/4}{120qpm}\nN: 1 2 3 4 |||').score
    const measure = textMeasurer()
    const header = staffHeader(score, 720, measure)
    const title = findAll(header.node, node => node.tagName === 'text')[0]!
    expect(header.height - new SvgGeometry(header.node, measure).ink(title).bottom).toBeCloseTo(12)
  })

  it('packs tempo next to local music and raises it for high notes', () => {
    const gaps: number[] = []
    for (const melody of ['1 2 3 4', '1eee 2eee 3eee 4eee']) {
      const document = projectStaffDocument(analyzeM3N(`{4/4}{120qpm}\nN: ${melody} |||`).score)
      const measure = textMeasurer()
      const lines = planStaffLines(document, 720, false, measure, 0.25)
      const node = engraveStaffSystems(document, lines, 720, measure, 0.25, false)[0]!.node
      const geometry = new SvgGeometry(node, textMeasurer())
      const tempos = findAll(node, n => n.attributes.class === 'tempo')
      expect(tempos).toHaveLength(1)
      const tempo = geometry.ink(tempos[0]!)
      const music = findAll(node, n => n.attributes.class === 'staff')
        .flatMap(staff => geometry.pieces(staff))
        .filter(piece => overlapsX(tempo, piece, 3))
      const gap = (Math.min(...music.map(piece => piece.top)) - tempo.bottom) * STAFF_SCALE
      gaps.push(gap)
      expect(gap).toBeCloseTo(scoreLayoutConfig.staff.attachmentGap)
    }
    expect(gaps[0]).toBeCloseTo(gaps[1]!)
  })
  it.each([false, true])('places a changed meter after joined repeats, with a system break=%s', broken => {
    const document = projectStaffDocument(analyzeM3N('{4/4}\nN: 1 2 3 4 :|| ||: {2/4} 1 2 |||').score)
    expect(document.measures[1]!.joinsPreviousRepeat).toBe(true)
    document.measures[1]!.force = broken
    const measure = textMeasurer()
    const lines = planStaffLines(document, 720, false, measure, .25)
    const systems = engraveStaffSystems(document, lines, 720, measure, .25, false)
    expect(systems).toHaveLength(broken ? 2 : 1)
    const previous = findAll(systems[0]!.node, n => n.attributes.id === document.measures[0]!.id)[0]!
    const currentSystem = systems.at(-1)!.node
    const current = findAll(currentSystem, n => n.attributes.id === document.measures[1]!.id)[0]!
    const bars = findAll(current, n => hasClass(n, 'staff-bar'))
    const dots = findAll(bars[0]!, n => hasClass(n, 'm3n-music-glyph'))
    expect(dots).toHaveLength(broken ? 2 : 4)
    const previousBars = findAll(previous, n => hasClass(n, 'staff-bar'))
    expect(nodes(previousBars[1]!).length === 0).toBe(!broken)
    const signature = findAll(current, n => hasClass(n, 'staff-signature'))[0]!
    const geometry = new SvgGeometry(currentSystem, measure)
    if (!broken) expect(geometry.ink(signature).left - geometry.ink(bars[0]!).right).toBeGreaterThanOrEqual(staffMusicSize() / 4 - .1)
    else expect(geometry.ink(signature).right).toBeLessThan(geometry.ink(bars[0]!).left)
  })

  it.each(['1 1 1 1', '1^^'].flatMap(music => [0, 180].map(extra => ({ music, extra }))))('balances music clearance for $music at surplus $extra', ({ music, extra }) => {
    const document = projectStaffDocument(analyzeM3N(`{4/4}\nN: ${music} | ${music} |`).score)
    const model = createStaffMeasure(document.measures[1]!, false, false, textMeasurer(), .25)
    const width = model.minimum + extra, node = drawStaffMeasure(model, width, 0)
    const geometry = new SvgGeometry(node, textMeasurer())
    const heads = findAll(node, n => hasClass(n, 'notehead')).map(n => geometry.ink(n))
    const closingBar = geometry.ink(findAll(node, n => hasClass(n, 'staff-bar'))[1]!)
    const left = heads[0]!.left - staffMusicSize() / 4 * .05
    const right = closingBar.left - heads.at(-1)!.right
    expect(left).toBeCloseTo(right, 3)
    expect(left).toBeGreaterThanOrEqual(9.9)
  })

  it('keeps text and numeric tempo in one movable group on the same line', () => {
    const document = projectStaffDocument(analyzeM3N('{4/4}{120qpm}\nN: {expression=Largo}1 2 {60qpm}{expression=Meno, quasi lento}3 4 |||').score)
    const measure = textMeasurer(), lines = planStaffLines(document, 528, false, measure, .25)
    const node = engraveStaffSystems(document, lines, 528, measure, .25, false)[0]!.node
    const geometry = new SvgGeometry(node, measure)
    const tempos = findAll(node, n => hasClass(n, 'tempo'))
    expect(tempos).toHaveLength(2)
    expect(findAll(node, n => hasClass(n, 'dir'))).toHaveLength(0)
    for (const tempo of tempos) {
      const label = findAll(tempo, n => hasClass(n, 'tempo-direction'))[0]!
      const numeric = findAll(tempo, n => hasClass(n, 'tempo-metronome'))[0]!
      expect(geometry.ink(label).right).toBeLessThan(geometry.ink(numeric).left)
      const texts = findAll(tempo, n => n.tagName === 'text' && !n.attributes['data-m3n-glyph'])
      const direction = texts.find(n => n.children.some(c => typeof c === 'string' && /Largo|Meno/.test(c)))!
      const number = texts.find(n => n.children.some(c => typeof c === 'string' && c.startsWith('=')))!
      expect(direction.attributes.y).toBe(number.attributes.y)
    }
  })

  it.each([false, true])('keeps tempo outside an upper octave line regardless of drawing order (%s)', reversed => {
    const tempo = element('g', { class: 'tempo' }, [element('text', { x: '70', y: '-10', 'font-size': '16' }, ['60'])])
    const octave = element('g', { class: 'octave' }, [element('path', { d: 'M20 -60 H180', stroke: '#000', 'stroke-width': '1', fill: 'none' })])
    const staff = element('g', { class: 'staff' }, [
      ...[40, 50, 60, 70, 80].map(y => element('path', { class: 'staff-line', d: `M0 ${y} H320`, stroke: '#000', 'stroke-width': '1' })),
      element('rect', { x: '70', y: '60', width: '10', height: '6' }),
    ])
    const node = element('g', { class: 'system' }, [element('g', { class: 'measure' }, [staff]),
      ...(reversed ? [octave, tempo] : [tempo, octave])])
    const geometry = new SvgGeometry(node, textMeasurer())
    const system = arrangeStaffSystem(node, geometry, 224, new Set())
    expect(geometry.ink(tempo).bottom + scoreLayoutConfig.staff.attachmentGap / STAFF_SCALE).toBeLessThanOrEqual(geometry.ink(octave).top + 1e-6)
    expect(geometry.ink(octave).top).toBeCloseTo(-60.5)
    expect(system.ink.top).toBeLessThan(geometry.ink(octave).top * STAFF_SCALE)
  })

  it.each([528, 768])('keeps combined tempo above explicit 8va on the initial and continuation systems at %s', width => {
    const document = projectStaffDocument(analyzeM3N('{4/4}{60qpm}\nN: {8va}{expression=Lento molto espressivo}1e 2e 3e 4e | {br}{72qpm}{expression=Meno mosso}5e 6e 7e 1ee{/} |||').score)
    const measure = textMeasurer(), lines = planStaffLines(document, width, false, measure, .25)
    const systems = engraveStaffSystems(document, lines, width, measure, .25, false)
    expect(systems).toHaveLength(2)
    for (const system of systems) {
      const geometry = new SvgGeometry(system.node, measure)
      const tempo = findAll(system.node, n => hasClass(n, 'tempo'))[0]!
      const octave = findAll(system.node, n => hasClass(n, 'octave'))[0]!
      const ink = geometry.ink(tempo)
      const covered = geometry.pieces(octave).filter(piece => overlapsX(ink, piece))
      expect(covered.length).toBeGreaterThan(0)
      expect(ink.bottom + scoreLayoutConfig.staff.attachmentGap / STAFF_SCALE).toBeLessThanOrEqual(Math.min(...covered.map(piece => piece.top)) + 1e-6)
      expect(findAll(tempo, n => hasClass(n, 'tempo-direction'))).toHaveLength(1)
      expect(findAll(tempo, n => hasClass(n, 'tempo-metronome'))).toHaveLength(1)
    }
  })

  it('uses the stave rules as its core and expands gaps only for overlapping ink', () => {
    const makeSystem = (lyricX: number, withLyrics = true) => {
      const rules = [40, 50, 60, 70, 80].map(y => element('path', {
        class: 'staff-line', d: `M0 ${y} L180 ${y}`, fill: 'none', stroke: '#000', 'stroke-width': '1',
      }))
      const node = element('g', { class: 'system' }, [element('g', { class: 'measure' }, [
        element('g', { class: 'staff' }, [...rules, ...(withLyrics ? [element('g', { class: 'verse' }, [
          element('text', { x: String(lyricX), y: '130', 'font-size': '16' }, ['春']),
        ])] : [])]),
      ])])
      return arrangeStaffSystem(node, new SvgGeometry(node, textMeasurer()), 320, new Set())
    }
    const plain = makeSystem(20, false), lyrics = makeSystem(20), outside = makeSystem(220)
    expect(lyrics.core).toEqual(plain.core)
    expect(plain.core.bottom - plain.core.top).toBeCloseTo(41 * STAFF_SCALE)
    const base = systemDistance(plain, plain, 26.4)
    expect(systemDistance(lyrics, plain, 26.4)).toBeGreaterThan(base)
    expect(systemDistance({ ...outside, hasLyrics: false }, plain, 26.4)).toBeCloseTo(base)
  })
  it('does not lower lyrics for nonoverlapping clef tails or isolated low notes', () => {
    const place = (obstacleX: number, obstacleBottom: number) => {
      const rules = [40, 50, 60, 70, 80].map(y => element('path', { class: 'staff-line', d: `M0 ${y} H300`, fill: 'none', stroke: '#000', 'stroke-width': '1' }))
      const lyric = element('g', { class: 'verse' }, [element('text', { x: '80', y: '200', 'font-size': '16' }, ['春'])])
      const node = element('g', { class: 'system' }, [element('g', { class: 'measure' }, [element('g', { class: 'staff' }, [
        ...rules, element('rect', { x: String(obstacleX), y: '60', width: '10', height: String(obstacleBottom - 60) }), lyric,
      ])])])
      const geometry = new SvgGeometry(node, textMeasurer())
      arrangeStaffSystem(node, geometry, 320, new Set())
      return geometry.ink(lyric).top
    }
    expect(place(0, 160)).toBeCloseTo(place(0, 80))
    expect(place(80, 160)).toBeGreaterThan(place(0, 160) + 70)
  })
  it('clears structural clefs without adding the full musical collision gap twice', async () => {
    const document = projectStaffDocument(analyzeM3N('{4/4}\nN: 1 2 3 4 | {br} 1 2 3 4 |||').score)
    const measure = textMeasurer(), lines = planStaffLines(document, 600, false, measure, .25)
    const systems = engraveStaffSystems(document, lines, 600, measure, .25, false)
    const [a, b] = systems as [StaffSystem, StaffSystem]
    expect(a.edgePieces.length).toBeGreaterThan(0)
    const distance = systemDistance(a, b, 28.8)
    for (const upper of a.pieces) for (const lower of b.edgePieces) if (overlapsX(upper, lower))
      expect(distance + lower.top - upper.bottom).toBeGreaterThanOrEqual(lower.gap - 1e-6)
  })
  it('preserves strict point and touching-edge overlap in the row sweep', () => {
    const system = (spacingPieces: StaffSystem['pieces']): StaffSystem => ({
      node: element('g'), pieces: spacingPieces, spacingPieces, edgePieces: [],
      ink: { left: 0, right: 100, top: 0, bottom: 100 },
      core: { left: 0, right: 100, top: 100, bottom: -100 }, section: false, staffSpacing: 0,
    })
    let seed = 17
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let trial = 0; trial < 100; trial++) {
      const pieces = () => Array.from({ length: 12 }, (_, i) => {
        const left = Math.floor(random() * 10), width = i % 3 ? Math.floor(random() * 7) : 0
        return { left, right: left + width, top: Math.floor(random() * 20), bottom: Math.floor(random() * 20) + 30 }
      })
      const upper = system(pieces()), lower = system(pieces())
      let collision = -Infinity
      for (const a of upper.spacingPieces) for (const b of lower.spacingPieces)
        if (overlapsX(a, b)) collision = Math.max(collision, a.bottom - b.top)
      expect(systemDistance(upper, lower, 12)).toBe(Math.max(-188, collision + 6))
    }
  })
  it('uses half of the local lyric core gap for collisions and retains the shared stretch ceiling', () => {
    const make = (bottom: number, hasLyrics: boolean): StaffSystem => {
      const ink = { left: 0, right: 100, top: 0, bottom }
      return { node: element('g'), pieces: [ink], spacingPieces: [ink], edgePieces: [], ink,
        core: { ...ink, bottom: 0 }, section: false, staffSpacing: 0, hasLyrics }
    }
    const lyrics = make(40, true), plain = make(40, false), next = make(20, false)
    expect(systemDistance(lyrics, next, 28.8)).toBeCloseTo(49.6)
    expect(systemDistance(plain, next, 28.8)).toBeCloseTo(54.4)
    expect(systemDistance(lyrics, next, 31.68, 28.8, 31.68)).toBeCloseTo(55.84)
  })
  it('fills a standalone named section without inheriting another section’s spacing', async () => {
    const render = await prepare('{4/4}\n===A\nN: 1 2 3 4 | 5 6 7 1e | 1 2 3 4 | 5 6 7 1e ||\n===Coda\nN: 1^^ |||', 600)
    const lines = render.layoutInfo().lines
    expect(lines).toHaveLength(2)
    expect(lines[1]!.target).toBe(lines[0]!.target)
    expect(lines[1]!.target).toBeGreaterThanOrEqual(lines[1]!.minimum)
  })
  it('keeps middle-band final rows open when full stretch would differ too much', () => {
    const document = projectStaffDocument(analyzeM3N('{4/4}\nN: 1 2 3 4 | 5 6 7 1e | {br} 1 2 3 4 |||').score)
    const lines = planStaffLines(document, 600, false, textMeasurer(), 0.25, () => 200)
    expect(lines).toHaveLength(2)
    const [first, last] = lines
    // A slightly larger final minimum must increase the target smoothly,
    // rather than snapping it from inherited spacing to the full line.
    const larger = planStaffLines(document, 600, false, textMeasurer(), 0.25,
      measure => measure.id === document.measures.at(-1)!.id ? 250 : 200)
    expect(larger.at(-1)!.target - last!.target).toBeCloseTo(50)
    expect(larger.at(-1)!.target).toBeLessThan(first!.target)
  })

  it.each([
    { minimum: 100, weight: 1, fill: false },
    { minimum: 100, weight: 2, fill: false },
    { minimum: 200, weight: 2, fill: true },
    { minimum: 300, weight: 2, fill: true },
  ])('uses trial occupancy and preceding stretch for staff endings: %j', sample => {
    const document = projectStaffDocument(analyzeM3N('{4/4}\nN: 1 2 3 4 | 5 6 7 1e | {br} 1 2 3 4 |||').score)
    const lastId = document.measures.at(-1)!.id
    const minimum: StaffMeasureMinimum = measure => measure.id === lastId ? sample.minimum : 200
    minimum.describe = measure => ({ weight: measure.id === lastId ? sample.weight : 1, beats: 4, labelWidth: 0 })
    const lines = planStaffLines(document, 600, false, textMeasurer(), 0.25, minimum)
    expect(lines).toHaveLength(2)
    const [first, last] = lines
    const inherited = last!.minimum + (first!.target - first!.minimum) / first!.weight * last!.weight
    expect(last!.target).toBeCloseTo(sample.fill ? first!.target : inherited)
  })

  it('clears a lone ending bracket from music and relations after initial placement', () => {
    const slur = element('g', { class: 'slur' }, [element('rect', { x: '80', y: '12', width: '20', height: '13' })])
    const ending = element('g', { class: 'ending voltaBracket' }, [element('path', { d: 'M20 20 V5 H160 V20', fill: 'none', stroke: '#000', 'stroke-width': '1' })])
    const node = element('g', { class: 'system' }, [element('g', { class: 'measure' }, [element('g', { class: 'staff' }, [element('rect', { x: '0', y: '40', width: '180', height: '40' })])]), slur, ending])
    const geometry = new SvgGeometry(node, textMeasurer())
    arrangeStaffSystem(node, geometry, 320, new Set())
    for (const a of geometry.pieces(ending)) for (const b of geometry.pieces(slur))
      expect(overlapsX(a, b) && a.top < b.bottom && b.top < a.bottom).toBe(false)
  })
  it('keeps transformed ending strokes in ordinary collision ink', () => {
    const score = analyzeM3N(readFileSync('../../src/scores/zhi_ai_li_si_01.m3n', 'utf8')).score
    const document = projectStaffDocument(score), measure = textMeasurer()
    const lines = planStaffLines(document, 640, false, measure, 0.25)
    const systems = engraveStaffSystems(document, lines, 640, measure, 0.25, false)
    const system = systems.find(row => findAll(row.node, node => hasClass(node, 'm3n-ending-row')).length)!
    expect(system).toBeDefined()
    const geometry = new SvgGeometry(system.node, measure)
    const rows = findAll(system.node, node => hasClass(node, 'm3n-ending-row'))
    const expected = rows.flatMap(row => geometry.pieces(element('g', system.node.attributes, [row])))
    for (const piece of expected) expect(system.spacingPieces).toContainEqual({
      left: piece.left * STAFF_SCALE, right: piece.right * STAFF_SCALE,
      top: piece.top * STAFF_SCALE, bottom: piece.bottom * STAFF_SCALE,
    })
    expect(system.edgePieces.every(piece => piece.gap === scoreLayoutConfig.staff.music * .1)).toBe(true)
  })
  it('keeps half the local lyric core gap between Ai Ru Chao Shui lyrics and the next row ending strokes', async () => {
    const score = analyzeM3N(readFileSync('../../src/scores/ai_ru_chao_shui_01.m3n', 'utf8')).score
    const info = (await prepareStaffScore(score, { width: 720 })).layoutInfo()
    const document = projectStaffDocument(score), measure = textMeasurer()
    const graph = prepareStaffLineGraph(document, 718, false, measure, info.spacing)
    const ends = info.lines.map(line => graph.measured.findIndex(member => member.id === line.measures.at(-1)) + 1)
    const systems = engraveStaffSystems(document, graph.makeLines(ends), 718, measure, info.spacing, false)
    const lowerIndex = systems.findIndex((system, index) => index > 0 && findAll(system.node, node => hasClass(node, 'ending')).length > 0)
    expect(lowerIndex).toBeGreaterThan(0)
    const upper = systems[lowerIndex - 1]!, lower = systems[lowerIndex]!
    const ending = new SvgGeometry(lower.node, measure).pieces(element('g', lower.node.attributes,
      nodes(lower.node).filter(node => hasClass(node, 'ending') || hasClass(node, 'm3n-ending-row'))))
      .map(piece => ({ left: piece.left * STAFF_SCALE, right: piece.right * STAFF_SCALE,
        top: piece.top * STAFF_SCALE, bottom: piece.bottom * STAFF_SCALE }))
    expect(upper.hasLyrics).toBe(true)
    expect(ending.length).toBeGreaterThan(0)
    let pairs = 0
    expect(info.pageCount).toBe(1)
    const upperPlaced = info.pages[0]!.systems[lowerIndex - 1]!, lowerPlaced = info.pages[0]!.systems[lowerIndex]!
    const minimumGap = scoreCoreGap(score)
    const gap = interpolateScoreCoreGap(minimumGap, scoreMaximumCoreGap(minimumGap), info.pages[0]!.gap, scoreLyricGapScale(minimumGap))
    for (const a of upper.spacingPieces) for (const b of ending) if (overlapsX(a, b)) {
      expect(lowerPlaced.y + b.top - upperPlaced.y - a.bottom).toBeGreaterThanOrEqual(gap * .5 - 1e-6)
      pairs++
    }
    expect(pairs).toBeGreaterThan(0)
  })
  it('paints inline key changes as well as allocating their width', () => {
    const analysis = analyzeM3N('{4/4}\nN: 1 2 {key=G} 3 4 |||')
    expect(analysis.diagnostics.filter(d => d.severity === 'error')).toEqual([])
    const score = analysis.score
    const measure = projectStaffDocument(score).measures[0]!
    const model = createStaffMeasure(measure, true, false, textMeasurer(), 0.25)
    const drawing = drawStaffMeasure(model, model.minimum, 0)
    const rules = findAll(drawing, n => n.attributes.class === 'staff-line')
    expect(rules).toHaveLength(5)
    const geometry = new SvgGeometry(drawing, textMeasurer())
    for (const rule of rules) {
      expect(rule.tagName).toBe('path')
      const ink = geometry.ink(rule)
      expect(ink.bottom - ink.top).toBeCloseTo(staffMusicSize() / 4 * .1)
      expect(ink.right - ink.left).toBeGreaterThan(model.minimum - 1)
    }
    const signatures = findAll(drawing, n => n.attributes.class === 'inline-signature')
    expect(signatures).toHaveLength(1)
    for (const signature of signatures)
      expect(findAll(signature, n => n.numericInk !== undefined || n.tagName === 'text').length).toBeGreaterThan(0)
  })
  it('respects short explicit lines, section entries and standalone section headings', async () => {
    const render = await prepare('{4/4}\n===A\nN: 1 2 3 4 | {br}5 6 7 1e |\n===B{br}\nN: 1 2 3 4 |||')
    expect(render.layoutInfo().lines.map((line) => line.measures.length)).toEqual([1, 1, 1])
    expect(render.layoutInfo().pages.flatMap((p) => p.systems)).toHaveLength(3)
    const ordinary = await prepare('{4/4}\nN: 1 2 3 4 |\n---\nN: 5 6 7 1e |||')
    expect(ordinary.layoutInfo().lines).toHaveLength(1)
  })
  it('counts real measures across multi-rests', () => {
    const document = projectStaffDocument(analyzeM3N('{4/4}\nN: {rest=4} | 1 2 3 4 |||').score)
    expect(document.measures.map(m => m.number)).toEqual([1, 5])
  })
  it('reserves the multi-rest bar after the opening signatures in Second Waltz', () => {
    const score = analyzeM3N(readFileSync('../../src/scores/second_waltz_01.m3n', 'utf8')).score
    const document = projectStaffDocument(score), measure = textMeasurer()
    for (const width of [320, 545, 550, 555, 720]) {
      const lines = planStaffLines(document, width, false, measure, 0.25)
      const systems = engraveStaffSystems(document, lines, width, measure, 0.25, false)
      let count = 0
      for (const { node } of systems) {
        const geometry = new SvgGeometry(node, measure)
        for (const m of nodes(node).filter(n => hasClass(n, 'measure'))) {
          const rest = nodes(m).find(n => hasClass(n, 'multi-rest'))
          if (!rest) continue
          count++
          const bar = geometry.ink(nodes(rest)[0]!)
          const staff = nodes(m).find(n => hasClass(n, 'staff'))!
          const signatures = nodes(staff).filter(n => !hasClass(n, 'staff-line') && n.tagName !== 'rect' && !hasClass(n, 'stavebarline'))
          for (const signature of signatures) {
            const ink = geometry.ink(signature)
            if (ink.left < bar.left) expect(ink.right + 7).toBeLessThanOrEqual(bar.left)
            else expect(bar.right + 7).toBeLessThanOrEqual(ink.left)
          }
          const barline = findAll(node, n => hasClass(n, 'staff-bar')).filter(n => n.children.length && geometry.ink(n).left >= bar.right)
            .sort((a,b) => geometry.ink(a).left - geometry.ink(b).left)[0]!
          expect(bar.right + 7).toBeLessThanOrEqual(geometry.ink(barline).left)
        }
      }
      expect(count).toBe(3)
    }
  })
  it('splits a dense measure at shared beats without losing original events', async () => {
    const source = '{4/4}\nN: ' + Array.from({ length: 32 }, () => '1___').join(' ') + ' |||'
    const score = analyzeM3N(source).score
    const before = structuredClone(score)
    const render = await prepareStaffScore(score, { width: 320 })
    const lines = render.layoutInfo().lines
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.flatMap(line => line.measures).every(id => id.includes('-fragment'))).toBe(true)
    expect(lines.every(line => line.minimum <= 316)).toBe(true)
    expect(score).toEqual(before)
  })
  it('retains IDs, pitches, lyrics and tuplets while splitting an oversized measure', () => {
    const score = analyzeM3N('{4/4}\nN: 1 2 3 4 |||\nL: 春夏秋冬').score
    const measure = projectStaffDocument(score).measures[0]!
    const fragments = splitStaffMeasure(measure, 2)
    expect(fragments).toHaveLength(2)
    expect(fragments.map(f => f.number)).toEqual([1, 1])
    expect(fragments[0]!.source.right).toBe('invis')
    expect(fragments[1]!.source.left).toBe('invis')
    const events = fragments.flatMap(f => f.melody)
    expect(events.map(e => e.id)).toEqual([...scoreEventIds(score).values()])
    expect(events.flatMap(e => e.lyrics.map(l => l.text))).toEqual(['春', '夏', '秋', '冬'])
    const tuplet = projectStaffDocument(analyzeM3N('{4/4}\nN: [123:2] 4 5 |||').score).measures[0]!
    expect(splitStaffMeasure(tuplet, 0.25)[0]!.melody[0]!.children).toHaveLength(3)
  })
  it('fits measured header text, supports leading, and stretches gaps within fixed pages', async () => {
    const render = await prepare(
      '{title=长标题测试长标题测试长标题测试长标题测试}{leading=0.8}{4/4}\nN: ' +
        Array.from({ length: 12 }, () => '1 2 3 4 | {br}').join(' ') +
        '1 2 3 4 |||',
      540,
    )
    const info = render.layoutInfo()
    expect(info.headerHeight).toBeGreaterThan(32)
    expect(info.spacing).toBeGreaterThanOrEqual(0.25)
    for (const page of info.pages) {
      expect(page.gap).toBeGreaterThanOrEqual(19.2)
      expect(page.gap).toBeLessThanOrEqual(21.12 + 1e-9)
      for (const system of page.systems) {
        expect(system.ink.top + system.y).toBeGreaterThanOrEqual(-1e-6)
        expect(system.ink.bottom + system.y).toBeLessThanOrEqual(page.height + 1e-6)
      }
    }
    expect(render.pageCount(true)).toBe(info.pages.length)
    expect(render.pageCount(false)).toBe(1)
  })
  it('measures transformed glyph outlines and keeps empty brackets open', () => {
    const root = readXml(
      '<svg><defs><g id="glyph"><path d="M0 0 Q10 20 20 0"/></g></defs><g id="ink" transform="translate(10 30) scale(2)"><use href="#glyph"/></g></svg>',
    )
    expect(new SvgGeometry(root, textMeasurer()).ink(findAll(root, (n) => n.attributes.id === 'ink')[0]!)).toEqual({
      left: 10,
      right: 50,
      top: 30,
      bottom: 50,
    })
  })
  it('keeps continuous engraving available when the header and first system exceed A4', async () => {
    const render = await prepare(`{title=${'长标题'.repeat(200)}}{4/4}\nN: 1 2 3 4 |||`, 320)
    expect([.6, 1.8]).toContain(render.layoutInfo().spacing)
    expect(render.pageCount(false)).toBe(1)
    expect(() => render.pageCount(true)).toThrow('单个五线谱谱行')
    expect(() => render(true)).toThrow('单个五线谱谱行')
  })
  it('replans final line-context widths instead of overflowing Flower Dance', async () => {
    const source = readFileSync(`../../src/scores/flower_dance_01.m3n`, 'utf8')
    const render = await prepare(source, 700)
    for (const page of render.layoutInfo().pages)
      for (const system of page.systems) expect(system.ink.right).toBeLessThanOrEqual(701)
  }, 30_000)
  it('keeps an explicit output core gap fixed rather than stretching it to a staff-only ceiling', async () => {
    const score = analyzeM3N('{4/4}\nN: 1 2 3 4 | {br} 1 2 3 4 |||').score
    for (const coreGap of [12, 28.8]) {
      const info = (await prepareStaffScore(score, { width: 640, coreGap })).layoutInfo()
      expect(info.pages.every(page => page.gap === coreGap)).toBe(true)
    }
  })
  it('keeps custom output gaps out of the shared horizontal spacing decision', async () => {
    const score = analyzeM3N('{4/4}\nN: ' + Array.from({ length: 16 }, () => '1 2 3 4').join(' | ') + ' |||').score
    const compact = (await prepareStaffScore(score, { width: 540, coreGap: 0 })).layoutInfo()
    const open = (await prepareStaffScore(score, { width: 540, coreGap: 80 })).layoutInfo()
    expect(open.lines).toEqual(compact.lines)
    expect(open.spacing).toBe(compact.spacing)
    expect(open.pages.every((page) => page.gap === 80)).toBe(true)
  })
})

it('renders an unmeasured interlude with a multimeasure rest symbol and no text or count', () => {
  const source = '{4/4}\nN: 1 2 3 4 | {interlude} | 5 6 7 1e |||'
  const document = projectStaffDocument(analyzeM3N(source).score)
  expect(document.measures.map(measure => measure.number)).toEqual([1, 1, 2])
  expect(document.measures[1]!.melody).toEqual([])
  const measurer = textMeasurer()
  const lines = planStaffLines(document, 600, false, measurer, 0.25)
  const systems = engraveStaffSystems(document, lines, 600, measurer, 0.25, false)
  const marker = systems.flatMap(system => findAll(system.node, node => hasClass(node, 'interlude')))
  expect(marker.length).toBeGreaterThan(0)
  expect(marker).toHaveLength(1)
  expect(hasClass(marker[0]!, 'multi-rest')).toBe(true)
  expect(marker.flatMap(nodes).filter(node => node.tagName === 'path')).toHaveLength(1)
  expect(marker.flatMap(nodes).some(node => node.tagName === 'text' || node.attributes['stroke-dasharray'])).toBe(false)
})

it('keeps bass slurs on the bass staff instead of lifting them over the treble staff', () => {
  const document = projectStaffDocument(analyzeM3N('{4/4}\nN: 1e 2e 3e 4e |\nB: {lg}1d 2d 3d 4d{/} |').score)
  const measure = textMeasurer()
  const lines = planStaffLines(document, 640, false, measure, 0.25)
  const system = engraveStaffSystems(document, lines, 640, measure, 0.25, false)[0]!
  const geometry = new SvgGeometry(system.node, measure)
  const slur = findAll(system.node, n => hasClass(n, 'slur'))[0]!
  const treble = findAll(system.node, n => n.attributes['data-staff'] === 'melody')[0]!
  expect(geometry.ink(slur).top).toBeGreaterThan(geometry.ink(treble).bottom)
})

it('separates nested slurs including their shared endpoint', () => {
  const document = projectStaffDocument(analyzeM3N('{4/4}\nN: {lg}1 2 {lg}3 4{/}{/} |').score)
  const measure = textMeasurer()
  const lines = planStaffLines(document, 640, false, measure, 0.25)
  const system = engraveStaffSystems(document, lines, 640, measure, 0.25, false)[0]!
  const geometry = new SvgGeometry(system.node, measure)
  const slurs = findAll(system.node, n => hasClass(n, 'slur'))
  expect(slurs).toHaveLength(2)
  const [inner, outer] = slurs.map(slur => geometry.pieces(slur))
  for (const a of inner!) for (const b of outer!) {
    if (a.left < b.right && b.left < a.right) expect(b.bottom).toBeLessThan(a.top)
  }
})

it('reports available widths in the same logical pixels as its line geometry', async () => {
  const score = analyzeM3N('{4/4}\nN: 1 2 3 4 | 5 6 7 1e |').score
  const render = await prepareStaffScore(score, { width: 640 })
  const info = render.layoutInfo()
  expect(info.lines[0]!.target).toBeCloseTo(info.availableWidth)
})

it('retains beat phase when an oversized measure is split off the beat', () => {
  const score = analyzeM3N('{4/4}\nN: (1) 2 (3 4 5) 6 |').score
  const original = projectStaffDocument(score).measures[0]!
  const fragment = splitStaffMeasure(original, 1.5)[1]!
  const model = createStaffMeasure(fragment, true, false, textMeasurer(), 0.25)
  expect(fragment.beatOffset).toBe(1.5)
  expect(model.entries[0]![0]!.notes[0]!.beam).toBeUndefined()
  expect(model.beams[0]!.notes).toEqual(model.entries[0]!.slice(1).flatMap(entry => entry.notes))
})

it('uses the active key when a continuation fragment starts a new system', () => {
  const score = analyzeM3N('{key=C}{4/4}\nN: 1 {key=G}2 3 4 |').score
  const continuation = splitStaffMeasure(projectStaffDocument(score).measures[0]!, 2)[1]!
  expect(continuation.key).toBe('G')
  expect(continuation.previousKey).toBe('G')
})

it('centers inline section labels on the five staff rules, excluding clef and key outlines', () => {
  const document = projectStaffDocument(analyzeM3N('{key=Bb}{4/4}\n===A\nN: 1 2 3 4 |').score)
  const measure = textMeasurer()
  const lines = planStaffLines(document, 640, false, measure, 0.25)
  const system = engraveStaffSystems(document, lines, 640, measure, 0.25, false)[0]!
  const geometry = new SvgGeometry(system.node, measure)
  const label = geometry.ink(findAll(system.node, n => hasClass(n, 'reh'))[0]!)
  const rules = findAll(system.node, n => hasClass(n, 'staff-line'))
  expect((label.top + label.bottom) / 2).toBeCloseTo((geometry.ink(rules[0]!).top + geometry.ink(rules[4]!).bottom) / 2)
})

it('keeps downward tuplet numbers between their music and the first lyric row', () => {
  const score = analyzeM3N('{key=Bb}{4/4}\nN: ([2 2 1:2]) ([2 2 1:2]) ([2 2 2:2]) ([2 1 6d:2]) |\nL1: 春夏秋冬天地山川日月星辰\nL2: 春夏秋冬天地山川日月星辰').score
  const document = projectStaffDocument(score), measure = textMeasurer()
  const lines = planStaffLines(document, 640, false, measure, 0.25)
  const system = engraveStaffSystems(document, lines, 640, measure, 0.25, false)[0]!
  const geometry = new SvgGeometry(system.node, measure)
  const labels = findAll(system.node, n => hasClass(n, 'm3n-tuplet-label') && n.attributes['data-m3n-below'] === 'true')
  const lyrics = findAll(system.node, n => hasClass(n, 'verse')).flatMap(n => geometry.pieces(n))
  expect(labels.length).toBeGreaterThan(0)
  const lyricTop = Math.min(...lyrics.map(piece => piece.top))
  for (const label of labels) expect(geometry.ink(label).bottom).toBeLessThan(lyricTop)
})


it('fits a volta around high central music using its strokes instead of its empty interior', () => {
  const rule = element('path', { d: 'M20 -30 H160', fill: 'none', stroke: '#000', 'stroke-width': '1' })
  const ending = element('g', { class: 'ending voltaBracket' }, [rule,
    element('path', { d: 'M20 -30 V-15 M160 -30 V-15', fill: 'none', stroke: '#000', 'stroke-width': '1' }),
  ])
  const highNote = element('rect', { x: '80', y: '20', width: '20', height: '10' })
  const staff = element('g', { class: 'staff' }, [highNote,
    element('rect', { x: '0', y: '60', width: '180', height: '40' }),
  ])
  const node = element('g', { class: 'system' }, [element('g', { class: 'measure' }, [staff]), ending])
  const geometry = new SvgGeometry(node, textMeasurer())
  arrangeStaffSystem(node, geometry, 320, new Set())
  const strokes = geometry.pieces(ending)
  const horizontal = strokes.find(piece => piece.right - piece.left > 100)!
  expect((geometry.ink(highNote).top - horizontal.bottom) * STAFF_SCALE).toBeCloseTo(scoreLayoutConfig.staff.music * .07)
  expect(Math.max(...strokes.map(piece => piece.bottom))).toBeGreaterThan(geometry.ink(highNote).top)
})

it('pulls triplet brackets toward local music on both sides of the staff', () => {
  for (const notes of ['1 2 3', '1e 2e 3e']) {
    const document = projectStaffDocument(analyzeM3N(`{4/4}\nN: [${notes}:2] 4 5 |`).score)
    const measure = textMeasurer()
    const lines = planStaffLines(document, 640, false, measure, 0.25)
    const system = engraveStaffSystems(document, lines, 640, measure, 0.25, false)[0]!
    const geometry = new SvgGeometry(system.node, measure)
    const label = findAll(system.node, n => hasClass(n, 'm3n-tuplet-label'))[0]!
    const staff = findAll(system.node, n => hasClass(n, 'staff'))[0]!
    const music = geometry.withoutClasses(staff, ['m3n-tuplet-label', 'verse'])
    const below = label.attributes['data-m3n-below'] === 'true'
    const gaps = geometry.pieces(label).flatMap(piece => music
      .filter(other => overlapsX(piece, other, 1.5 / STAFF_SCALE))
      .map(other => (below ? piece.top - other.bottom : other.top - piece.bottom) * STAFF_SCALE))
    expect(Math.min(...gaps)).toBeCloseTo(scoreLayoutConfig.staff.music * .1)
  }
})

it('keeps slur endpoint clearance local instead of extending the peak over its full span', () => {
  const document = projectStaffDocument(analyzeM3N('{4/4}\nN: {lg}1 2 3 4{/} |').score)
  const measure = textMeasurer()
  const lines = planStaffLines(document, 640, false, measure, 0.25)
  const system = engraveStaffSystems(document, lines, 640, measure, 0.25, false)[0]!
  const slur = findAll(system.node, n => hasClass(n, 'slur'))[0]!
  const path = nodes(slur)[0]!
  const geometry = new SvgGeometry(slur, measure)
  const bounds = geometry.ink(slur)
  const pieces = geometry.pieces(slur)
  expect(pieces.length).toBeGreaterThan(2)
  expect(pieces[0]!.top).toBeGreaterThan(bounds.top + 5)
  const original = element('path', { ...path.attributes })
  const fullBounds = new SvgGeometry(original, measure).ink(original)
  for (const edge of ['left', 'right', 'top', 'bottom'] as const) expect(bounds[edge]).toBeCloseTo(fullBounds[edge])
})


it('keeps grand-staff expressions attached to the indicated staff', () => {
  const source = '{4/4}\nN: {p}{cresc}(1 2 3 4) 5 6{/} | {f}{decres=text}1e 7 6 5{/} |||\nB: {mp}{cresc}1d 2d 3d 4d{/} | {ff}{8vb}5d 6d 7d 1{/} |\nL: 春夏秋冬山川 | 天地人间'
  const analysis = analyzeM3N(source)
  expect(analysis.diagnostics.filter(item => item.severity === 'error')).toEqual([])
  const document = projectStaffDocument(analysis.score)
  const measure = textMeasurer()
  const lines = planStaffLines(document, 640, false, measure, .25)
  const systems = engraveStaffSystems(document, lines, 640, measure, .25, false)
  const expressions = systems.flatMap(system => findAll(system.node, node => hasClass(node, 'dynam') || hasClass(node, 'hairpin') || hasClass(node, 'octave')))
  expect(expressions.length).toBeGreaterThan(4)
  expect(expressions.every(node => ['0', '1'].includes(node.attributes['data-m3n-staff']!))).toBe(true)
  for (const system of systems) {
    const geometry = new SvgGeometry(system.node, measure)
    const bass = findAll(system.node, node => hasClass(node, 'staff') && node.attributes['data-staff'] === 'bass')
    const bassPieces = bass.flatMap(node => geometry.pieces(node))
    for (const expression of findAll(system.node, node => hasClass(node, 'dynam') && node.attributes['data-m3n-staff'] === '0')) {
      const ink = geometry.ink(expression)
      const localBass = bassPieces.filter(piece => overlapsX(ink, piece))
      expect(localBass.length).toBeGreaterThan(0)
      expect(ink.bottom).toBeLessThan(Math.min(...localBass.map(piece => piece.top)))
    }
  }
})
