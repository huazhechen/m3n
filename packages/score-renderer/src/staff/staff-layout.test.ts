// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
import { readFileSync } from 'node:fs'
import { analyzeM3N, scoreEventIds } from '@m3n/notation'
import { prepareStaffScore } from './staff-score.js'
import { projectStaffDocument, splitStaffMeasure } from './staff-document.js'
import { readXml, findAll, nodes, hasClass, SvgGeometry, textMeasurer, element, overlapsX } from './layout-svg.js'
import { arrangeStaffSystem, systemDistance, type StaffSystem } from './system-layout.js'
import { createStaffContext, createVexMeasure, drawVexMeasure, STAFF_SCALE } from './vexflow-engine.js'
import { planStaffLines } from './line-layout.js'
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
      expect(gap).toBeGreaterThanOrEqual(5.9)
      expect(gap).toBeLessThanOrEqual(6.1)
    }
    expect(gaps[0]).toBeCloseTo(gaps[1]!)
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
    expect(systemDistance(outside, plain, 26.4)).toBeCloseTo(base)
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
  it('leaves a short final named section open instead of stretching it across the page', async () => {
    const render = await prepare('{4/4}\n===A\nN: 1 2 3 4 | 5 6 7 1e | 1 2 3 4 | 5 6 7 1e ||\n===Coda\nN: 1^^ |||', 600)
    const lines = render.layoutInfo().lines
    expect(lines).toHaveLength(2)
    expect(lines[1]!.target).toBeLessThanOrEqual(lines[0]!.target * 0.6)
    expect(lines[1]!.target).toBeGreaterThanOrEqual(lines[1]!.minimum)
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
  it('measures ending collision edges with their enclosing row transforms', () => {
    const score = analyzeM3N(readFileSync('../../src/scores/zhi_ai_li_si_01.m3n', 'utf8')).score
    const document = projectStaffDocument(score), measure = textMeasurer()
    const lines = planStaffLines(document, 640, false, measure, 0.25)
    const systems = engraveStaffSystems(document, lines, 640, measure, 0.25, false)
    const system = systems.find(row => findAll(row.node, node => hasClass(node, 'm3n-ending-row')).length)!
    expect(system).toBeDefined()
    const geometry = new SvgGeometry(system.node, measure)
    const rows = findAll(system.node, node => hasClass(node, 'm3n-ending-row'))
    const expected = rows.flatMap(row => geometry.pieces(element('g', system.node.attributes, [row])))
    expect(system.edgePieces.filter(piece => piece.gap === 2)).toEqual(expected.map(piece => ({
      left: piece.left * STAFF_SCALE, right: piece.right * STAFF_SCALE,
      top: piece.top * STAFF_SCALE, bottom: piece.bottom * STAFF_SCALE, gap: 2,
    })))
  })
  it('paints inline key changes as well as allocating their width', () => {
    const analysis = analyzeM3N('{4/4}\nN: 1 2 {key=G} 3 4 |||')
    expect(analysis.diagnostics.filter(d => d.severity === 'error')).toEqual([])
    const score = analysis.score
    const measure = projectStaffDocument(score).measures[0]!
    const model = createVexMeasure(measure, true, false, textMeasurer(), 0.25)
    const drawing = drawVexMeasure(model, model.minimum, 0, createStaffContext())
    const rules = findAll(drawing, n => n.attributes.class === 'staff-line')
    expect(rules).toHaveLength(5)
    const geometry = new SvgGeometry(drawing, textMeasurer())
    for (const rule of rules) {
      expect(rule.tagName).toBe('path')
      const ink = geometry.ink(rule)
      expect(ink.bottom - ink.top).toBeCloseTo(1)
      expect(ink.right - ink.left).toBeGreaterThan(model.minimum - 1)
    }
    const signatures = findAll(drawing, n => n.attributes.class === 'inline-signature')
    expect(signatures).toHaveLength(1)
    for (const signature of signatures)
      expect(findAll(signature, n => n.tagName === 'path' && Boolean(n.attributes.d)).length).toBeGreaterThan(0)
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
          const barline = nodes(m).find(n => hasClass(n, 'barLine'))!
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
      expect(page.gap).toBeGreaterThanOrEqual(17.6)
      expect(page.gap).toBeLessThanOrEqual(32)
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
    expect(render.layoutInfo().spacing).toBe(0.25)
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
  const model = createVexMeasure(fragment, true, false, textMeasurer(), 0.25)
  expect(fragment.beatOffset).toBe(1.5)
  expect(model.entries[0]![0]!.notes[0]!.getBeam()).toBeUndefined()
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
  expect((geometry.ink(highNote).top - horizontal.bottom) * STAFF_SCALE).toBeCloseTo(2)
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
    expect(Math.min(...gaps)).toBeCloseTo(3)
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
