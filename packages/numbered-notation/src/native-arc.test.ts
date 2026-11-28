import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { nativeStyle } from './native-style.js'
import { nativeArcSlice } from './native-curve.js'
import { nativeTiePortTop } from './native-note-metrics.js'
import { cacheNativeArcObstacles, releaseNativeArcObstacles, nativeArcGeometry, nativeArcPath } from './native-arc.js'
import { layoutNativeScore } from './native-layout.js'
import { NativeNumberedNotationScore } from './native-score.js'
import { DefaultTextMeasurer } from './native-measure.js'

const options = { width: 800, paged: false }
describe('native musical arc geometry', () => {
  it.each([{ width: 320, paged: false }, { width: 1000, paged: true }])('uses independent phrase heights at $width, paged=$paged', ({ width, paged }) => {
    const layout = layoutNativeScore(parseM3NDocument('{5/4}\nN: {lg}(1 2){/} {lg}3 (4 5) 6 7{/} |||'), { width, paged })
    let checked = 0
    for (const system of layout.systems) for (const relation of system.relations) {
      if (relation.kind !== 'slur') continue
      const members = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs))
      if (!members.includes(relation.first) || !members.includes(relation.last)) continue
      const ratio = Math.min(1, Math.abs(relation.last.x - relation.first.x) / (nativeStyle.music * 2.3))
      expect(nativeArcGeometry(relation, system).height).toBeCloseTo(nativeStyle.music * .5 * ratio * (2 - ratio), 8)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
    if (width === 320) {
      const system = layout.systems[0]!, [short, long] = system.relations.filter(relation => relation.kind === 'slur')
      expect(nativeArcGeometry(short!, system).height).toBeLessThan(nativeArcGeometry(long!, system).height)
    }
  })

  it.each([
    '{lg}1 2{/} {lg}3 4{/} | {br} {lg}5 6{/} {lg}7 1e{/} |',
    '(1~ 1) (2~ 2) 3 4 | {br} (5~ 5) (6~ 6) 7 1e |',
  ])('preserves every grouped bow when sharing row height preparation: %s', music => {
    const layout=layoutNativeScore(parseM3NDocument('{4/4}\nN: '+music),options)
    for(const system of layout.systems) {
      const arcs=system.relations.filter(r=>r.kind==='tie' || r.kind==='slur')
      const expected=arcs.map(relation=>nativeArcGeometry(relation,system))
      cacheNativeArcObstacles(system)
      try { expect(arcs.map(relation=>nativeArcGeometry(relation,system))).toEqual(expected) }
      finally { releaseNativeArcObstacles(system) }
    }
  })
  it('uses a tapered ribbon whose measured height equals its cubic extremum', () => {
    const layout = layoutNativeScore(parseM3NDocument('{2/4}\nN: {lg}1e 2e{/} |||'), options)
    const relation = layout.relations[0]!, system = layout.systems[0]!
    const arc = nativeArcGeometry(relation, system)
    const [start, outer, inner, close] = arc.commands
    if (start?.op !== 'M' || outer?.op !== 'C' || inner?.op !== 'C') throw new Error('expected a closed cubic ribbon')
    expect(close?.op).toBe('Z')
    expect(start.x).toBe(relation.first.x)
    expect(outer.x).toBe(relation.last.x)
    expect(inner.x).toBe(start.x)
    expect(inner.y).toBe(start.y)
    const topAtMidpoint = (start.y + outer.y + 3 * outer.cy1 + 3 * outer.cy2) / 8
    const innerAtMidpoint = (outer.y + inner.y + 3 * inner.cy1 + 3 * inner.cy2) / 8
    expect(-topAtMidpoint).toBeCloseTo(arc.top)
    expect(innerAtMidpoint - topAtMidpoint).toBeCloseTo(24 * 0.09)
    expect(system.lanes[0]!.top).toBeCloseTo(arc.top)
  })

  it('continues across systems with curved, tapered ribbons on every fragment', () => {
    const layout = layoutNativeScore(parseM3NDocument('{2/4}\nN: {lg}1 2 | {br}3 4 | {br}5 6{/} |||'), options)
    expect(layout.systems).toHaveLength(3)
    const relation = layout.relations[0]!
    const arcs = layout.systems.map(system => nativeArcGeometry(relation, system))
    for (const [index, arc] of arcs.entries()) {
      const left = nativeArcSlice(arc.commands, arc.left)!
      const right = nativeArcSlice(arc.commands, arc.right)!
      const middle = nativeArcSlice(arc.commands, (arc.left + arc.right) / 2)!
      expect(middle.top).toBeLessThan(Math.min(left.top, right.top) - 4)
      expect(left.bottom - left.top).toBeCloseTo(0)
      expect(right.bottom - right.top).toBeCloseTo(0)
      expect(middle.bottom - middle.top).toBeCloseTo(24 * .09)
      expect(arc.height).toBeGreaterThan(9.9)
      expect(arc.commands.at(-1)?.op).toBe('Z')
      expect(nativeArcPath(arc)).not.toMatch(/NaN|Infinity/)
      const system = layout.systems[index]!
      const placed = system.relationLayout!.get(relation)!
      expect(system.lanes[0]!.top).toBeCloseTo(-placed.ink.top)
      expect(system.lanes[0]!.top).toBeGreaterThanOrEqual(arc.top - .001)
    }
  })

  it('uses independent flatter and thinner ties without inheriting an adjacent phrase slur', () => {
    const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: (1~ 1) {lg}2 3{/} 4 |||'), options)
    const system = score.systems[0]!, tie = score.relations.find(r => r.kind === 'tie')!, slur = score.relations.find(r => r.kind === 'slur')!
    const tieArc = nativeArcGeometry(tie, system), slurArc = nativeArcGeometry(slur, system)
    expect(tieArc.height).toBeLessThan(slurArc.height)
    const sameSpanSlur = nativeArcGeometry({ ...tie, kind: 'slur' }, system)
    expect(tieArc.height).toBeLessThan(sameSpanSlur.height)
    const middle = (arc: typeof tieArc) => nativeArcSlice(arc.commands, (arc.left + arc.right) / 2)!
    expect(middle(tieArc).bottom - middle(tieArc).top).toBeLessThan(middle(slurArc).bottom - middle(slurArc).top)
  })

  it.each([320, 720])('draws tapered curved cross-line ties at %spx', width => {
    const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: 1 2 3 4~ | {br}4 5 6 7 |||'), { width, paged: true, pageMargin: 0 })
    const tie = score.relations.find(r => r.kind === 'tie')!
    for (const system of score.systems) {
      const arc = system.relationLayout!.get(tie)!.arc!
      const left = nativeArcSlice(arc.commands, arc.left)!, right = nativeArcSlice(arc.commands, arc.right)!
      const middle = nativeArcSlice(arc.commands, (arc.left + arc.right) / 2)!
      expect(left.bottom - left.top).toBeCloseTo(0)
      expect(right.bottom - right.top).toBeCloseTo(0)
      expect(middle.top).toBeLessThan(left.top)
      expect(arc.commands.some(command => command.op === 'L')).toBe(false)
    }
  })

  it('clears a high intervening note and shares that envelope with pagination', () => {
    const layout = layoutNativeScore(parseM3NDocument('{3/4}\nN: {lg}1 2ee 3{/} |||'), options)
    const arc = nativeArcGeometry(layout.relations[0]!, layout.systems[0]!)
    const high = layout.projection.glyphs[1]!
    // The high note clears the curved lower edge; the endpoints can stay lower.
    expect(arc.top).toBeGreaterThan(high.top)
    expect(arc.top - arc.height).toBeLessThan(high.top)
    const tips = high.musicInk!.filter(piece => Math.abs(piece.top + high.tieTop!) < 1e-6)
    expect(tips).toHaveLength(1)
    for (const x of tips.flatMap(piece => [high.x + piece.left, high.x + piece.right])) {
      expect(nativeArcSlice(arc.commands, x)!.bottom).toBeLessThanOrEqual(-nativeTiePortTop(high) + 1e-7)
    }
    expect(layout.systems[0]!.lanes[0]!.top).toBeCloseTo(arc.top)
  })

  it.each([320, 720].flatMap(width => [false, true].map(paged => ({ width, paged }))))('scales a short closing slur independently of full-row continuations at $width, paged=$paged', ({ width, paged }) => {
    const layout = layoutNativeScore(parseM3NDocument('{4/4}\nN: {lg}1 2 3 4 | {br}5 6 7 1e | {br}2e{/} 3e 4e 5e |||'), {
      width, paged, pageMargin: 0,
    })
    const slur = layout.relations.find(relation => relation.kind === 'slur')!
    const arcs = layout.systems.map(system => nativeArcGeometry(slur, system))
    const closing = arcs.at(-1)!
    expect(closing.right).toBeCloseTo(slur.last.x)
    expect(closing.left).toBeCloseTo(0)
    expect(closing.height).toBeLessThan(arcs[1]!.height)
    for (const system of layout.systems) {
      const { ink, arc } = system.relationLayout!.get(slur)!
      expect(ink.left).toBeGreaterThanOrEqual(-.001)
      expect(ink.right).toBeLessThanOrEqual(width + .001)
      const center = nativeArcSlice(arc!.commands, (arc!.left + arc!.right) / 2)!
      expect(center.top).toBeCloseTo(ink.top, 5)
      expect(center.bottom - center.top).toBeCloseTo(2.16)
    }
  })

  it('keeps curved intermediate segments when a long slur crosses a page boundary', () => {
    const measures = Array.from({ length: 20 }, (_, index) => `${index ? '{br}' : '{lg}'}1 2 3 4${index === 19 ? '{/} |||' : ' |'}`).join(' ')
    const layout = layoutNativeScore(parseM3NDocument(`{4/4}\nN: ${measures}`), { width: 320, paged: true, pageMargin: 0 })
    expect(layout.pages.length).toBeGreaterThan(1)
    const slur = layout.relations.find(relation => relation.kind === 'slur')!
    for (const page of layout.pages) for (const system of page.systems) {
      const { arc, ink } = system.relationLayout!.get(slur)!
      const midpoint = nativeArcSlice(arc!.commands, (arc!.left + arc!.right) / 2)!
      const start = nativeArcSlice(arc!.commands, arc!.left)!
      expect(midpoint.top).toBeLessThan(start.top - 4)
      expect(start.bottom - start.top).toBeCloseTo(0)
      const lane = system.lanes.find(lane => lane.id === 'melody')!
      expect(lane.y + ink.top).toBeGreaterThanOrEqual(-.001)
      expect(lane.y + ink.bottom).toBeLessThanOrEqual(page.height + .001)
    }
  })

  it('keeps an inline meter separate from the note port while clearing its actual column', () => {
    const source = '{4/4}\nN: 1 2 3 4~ | {3/4}4 5 6 |||'
    const fallback = new DefaultTextMeasurer()
    // This fixture needs tall fraction digits to obstruct the ribbon. Declare
    // their ink explicitly rather than using the fallback em box's blank tail.
    const textMeasurer = { measureText(text: string, style: Parameters<typeof fallback.measureText>[1]) {
      const metrics = fallback.measureText(text, style)
      return style.fontSize === 18 ? { ...metrics, inkBottom: metrics.h } : metrics
    } }
    const layout = layoutNativeScore(parseM3NDocument(source), { ...options, textMeasurer })
    const relation = layout.relations.find(relation => relation.kind === 'tie')!
    const arc = nativeArcGeometry(relation, layout.systems[0]!)
    expect(relation.last.controls.map(control => control.kind)).toContain('meter')
    expect(relation.last.top).toBeCloseTo(27.18)
    expect(relation.last.musicTop).toBeCloseTo(19.2)
    const control = relation.last.controls.find(control => control.kind === 'meter')!
    const gaps = control.ink.flatMap(piece => {
      const left = Math.max(arc.left, control.x! + piece.left), right = Math.min(arc.right, control.x! + piece.right)
      return left > right ? [] : [left, right].map(x => piece.top - nativeArcSlice(arc.commands, x)!.bottom)
    })
    expect(Math.min(...gaps)).toBeCloseTo(0, 8)
    // Lift only the overlap correction, rather than treating the meter as a note endpoint.
    expect(arc.top - arc.height).toBeLessThan(control.top)
    expect(layout.systems[0]!.lanes[0]!.top).toBeGreaterThanOrEqual(relation.last.top)
  })

  it('connects above a marked high note without duplicating its covered octave-dot gap beside a control', () => {
    const layout = layoutNativeScore(parseM3NDocument('{4/4}\nN: 1 2 3 4e~ | {3/4}4e{tip} 5 6 |||'), options)
    const relation = layout.relations.find(relation => relation.kind === 'tie')!
    const arc = nativeArcGeometry(relation, layout.systems[0]!)
    expect(nativeTiePortTop(relation.first) - relation.first.tieTop!).toBeCloseTo(24 * 0.05)
    const mark = relation.last.markLayout!.find(value => value.name === 'tip')!
    expect(arc.top - arc.height).toBeCloseTo(-mark.top)
  })

  it('clears a marked intervening note in a cross-system fragment', () => {
    const layout = layoutNativeScore(parseM3NDocument('{3/4}\nN: {lg}1 2ee{tip} 3 | {br}4 5 6{/} |||'), options)
    const relation = layout.relations.find(relation => relation.kind === 'slur')!
    const arc = nativeArcGeometry(relation, layout.systems[0]!)
    const high = layout.projection.glyphs[1]!
    expect(arc.height).toBeGreaterThan(9.9)
    expect(arc.top - arc.height).toBeLessThan(nativeTiePortTop(high))
    const tips = high.musicInk!.filter(piece => Math.abs(piece.top + high.tieTop!) < 1e-6)
    expect(tips.length).toBeGreaterThan(0)
    for (const x of tips.flatMap(piece => [high.x + piece.left, high.x + piece.right])) {
      expect(nativeArcSlice(arc.commands, x)!.bottom).toBeLessThanOrEqual(-nativeTiePortTop(high) + 1e-7)
    }
    expect(layout.systems[0]!.lanes[0]!.top).toBeCloseTo(arc.top)
  })

  it('measures both ribbon edges at the cubic midpoint and the tapered tips', () => {
    const layout = layoutNativeScore(parseM3NDocument('{2/4}\nN: {lg}1 2{/} |||'), options)
    const arc = nativeArcGeometry(layout.relations[0]!, layout.systems[0]!)
    const middle = nativeArcSlice(arc.commands, (arc.left + arc.right) / 2)!
    expect(middle.top).toBeCloseTo(-arc.top)
    expect(middle.bottom - middle.top).toBeCloseTo(2.16)
    const tip = nativeArcSlice(arc.commands, arc.left)!
    expect(tip.top).toBeCloseTo(tip.bottom)
    expect(nativeArcSlice(arc.commands, arc.left - 1)).toBeUndefined()
  })

  it('starts a continued arc after the shared voice connector', () => {
    const layout = layoutNativeScore(parseM3NDocument('{2/4}\nN: {lg}1 2 | {br}3 4{/} |||\nB: 1d^ | 5d^ |||'), options)
    const second = layout.systems[1]!, relation = layout.relations.find(relation => relation.kind === 'slur')!
    const firstNote = second.measures[0]!.columns[0]!.glyphs.find(glyph => glyph.lane === 'melody')!
    const arc = nativeArcGeometry(relation, second)
    expect(arc.left).toBeGreaterThan(second.measures[0]!.start + 20)
    expect(arc.left).toBeCloseTo(firstNote.x - firstNote.musicLeft!)
  })

  it('fills the measured ribbon without adding an outline that thickens its tips', () => {
    const document = parseM3NDocument('{2/4}\nN: {lg}1 2{/} |||')
    const svg = NativeNumberedNotationScore.create(document).render(options).join('')
    const arcs = svg.match(/<path[^>]+data-m3n-relation="slur"[^>]*>/g)!
    expect(arcs).toHaveLength(1)
    expect(arcs[0]).toContain('fill="#000"')
    expect(arcs[0]).not.toMatch(/\sstroke=/)
    expect(arcs[0]).toContain('transform="translate(0 ')
  })
})

it('keeps an initial accidental outside the arc from changing its musical port', () => {
  const plain = layoutNativeScore(parseM3NDocument('{2/4}\nN: {lg}1 2{/} |||'), options)
  const sharp = layoutNativeScore(parseM3NDocument('{2/4}\nN: {lg}1# 2{/} |||'), options)
  const port = (layout: typeof plain) => nativeTiePortTop(layout.relations[0]!.first)
  expect(port(sharp)).toBeCloseTo(port(plain))
  expect(sharp.relations[0]!.first.musicTop).toBeGreaterThan(port(sharp))
})

it('resolves side ink to a fixed point without moving past already separated components', async () => {
  const { nativeArcInkLift } = await import('./native-curve.js')
  const ribbon = [
    { op: 'M' as const, x: 0, y: -10 }, { op: 'L' as const, x: 100, y: -10 },
    { op: 'L' as const, x: 100, y: -8 }, { op: 'L' as const, x: 0, y: -8 }, { op: 'Z' as const },
  ]
  const high = { left: 20, right: 30, top: -16, bottom: -13 }
  const low = { left: 20, right: 30, top: -12, bottom: -9 }
  expect(nativeArcInkLift(ribbon, 0, 100, [high])).toBe(0)
  expect(nativeArcInkLift(ribbon, 0, 100, [high, low])).toBe(8)
  expect(nativeArcInkLift(ribbon, 0, 100, [low, high])).toBe(8)
  expect(nativeArcInkLift(ribbon, 0, 100, [high], 4)).toBe(8)
})

it('clears measured endpoint side ink through nesting and line breaks', () => {
  for (const source of [
    '{2/4}\nN: {lg}1 2#{/} |||',
    '{2/4}\nN: {lg}1{ac(3)} 2{/} |||',
    '{2/4}\nN: {lg}1 2{ac(3)}{/} |||',
    '{3/4}\nN: {lg}1 {lg}2 3#{/}{/} |||',
    '{2/4}\nN: {lg}1 2 | {br}3# 4{/} |||',
  ]) for (const width of [320, 800]) {
    const layout = layoutNativeScore(parseM3NDocument(source), { width, paged: false })
    for (const system of layout.systems) for (const [relation, placed] of system.relationLayout!) {
      if (relation.kind !== 'tie' && relation.kind !== 'slur') continue
      const arc = nativeArcGeometry(relation, system)
      const dy = placed.ink.top + arc.top
      for (const glyph of system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs))) {
        if (glyph.lane !== relation.first.lane) continue
        for (const piece of glyph.musicInk ?? []) {
          const left = Math.max(arc.left, glyph.x + piece.left), right = Math.min(arc.right, glyph.x + piece.right)
          for (let x = left + 0.001; x < right; x += 0.1) {
            const band = nativeArcSlice(arc.commands, x)!
            expect(band.bottom + dy <= piece.top + 0.002 || band.top + dy >= piece.bottom - 0.002, source).toBe(true)
          }
        }
      }
    }
  }
})
