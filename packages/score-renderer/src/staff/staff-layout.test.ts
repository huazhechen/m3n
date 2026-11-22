// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
import { readFileSync } from 'node:fs'
import { analyzeM3N, scoreEventIds } from '@m3n/notation'
import { prepareStaffScore } from './staff-score.js'
import { projectStaffDocument, splitStaffMeasure } from './staff-document.js'
import { readXml, findAll, nodes, hasClass, SvgGeometry, textMeasurer, element, overlapsX } from './layout-svg.js'
import { arrangeStaffSystem, systemDistance } from './system-layout.js'
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
