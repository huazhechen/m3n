import { expect, it } from 'vitest'
import { scoreLayoutConfig } from '@m3n/numbered-notation/layout'
import { staffSlur } from './staff-slur.js'
import { staffMusicSize } from './staff-music-font.js'
import { arrangeStaffSystem } from './system-layout.js'
import { element, nodes, SvgGeometry, textMeasurer } from './layout-svg.js'

it.each(['dynam', 'hairpin'])('places a %s by local ink rather than its arbitrary initial offset', cls => {
  const place = (y: number) => {
    const rules = [40, 50, 60, 70, 80].map(y => element('path', { class: 'staff-line', d: `M0 ${y} H300`, fill: 'none', stroke: '#000', 'stroke-width': '1' }))
    const attachment = element('g', { class: cls }, [element('rect', { x: '100', y: String(y), width: '20', height: '12' })])
    const node = element('g', { class: 'system' }, [element('g', { class: 'measure' }, [
      element('g', { class: 'staff' }, rules), attachment,
    ])])
    const geometry = new SvgGeometry(node, textMeasurer())
    arrangeStaffSystem(node, geometry, 320, new Set())
    return geometry.ink(attachment)
  }
  const near = place(95), far = place(300)
  expect(far.top).toBeCloseTo(near.top)
  expect((far.top - 80.5) * scoreLayoutConfig.staff.engine.scale).toBeCloseTo(scoreLayoutConfig.staff.attachmentGap)
})

it.each([['dir', 6], ['harm', 6], ['fing', 12]] as const)('anchors upper %s to local music without preserving a fixed head offset', (cls, divisor) => {
  const place = (y: number, distantTop: number) => {
    const rules = [40, 50, 60, 70, 80].map(y => element('path', { class: 'staff-line', d: `M0 ${y} H300`, fill: 'none', stroke: '#000', 'stroke-width': '1' }))
    const attachment = element('g', { class: cls }, [element('rect', { x: '100', y: String(y), width: '20', height: '12' })])
    const node = element('g', { class: 'system' }, [element('g', { class: 'measure' }, [
      element('g', { class: 'staff' }, [...rules, element('rect', { x: '250', y: String(distantTop), width: '10', height: '10' })]), attachment,
    ])])
    const geometry = new SvgGeometry(node, textMeasurer())
    arrangeStaffSystem(node, geometry, 320, new Set())
    return geometry.ink(attachment)
  }
  const near = place(10, 10), far = place(-100, -100)
  expect(far.bottom).toBeCloseTo(near.bottom)
  expect((39.5 - far.bottom) * scoreLayoutConfig.staff.engine.scale).toBeCloseTo(scoreLayoutConfig.numbered.music / divisor)
})


it('uses the bow rise to clear a central obstacle without lifting both endpoints above it', () => {
  const obstacle = { left: 90, right: 110, top: 0, bottom: 10 }
  const shape = staffSlur(0, 200, 100, [obstacle])
  const geometry = new SvgGeometry(shape, textMeasurer())
  const path = nodes(shape)[0]!
  const baseline = Number(/^M\S+ (\S+)/.exec(path.attributes.d!)![1])
  const coordinates = path.attributes.d!.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
  const lowerRise = baseline - coordinates[9]!
  const gap = scoreLayoutConfig.staff.attachmentGap / scoreLayoutConfig.staff.engine.scale
  // A straight line above the obstacle would require a negative baseline.
  expect(baseline).toBeGreaterThan(0)
  for (const x of [90, 100, 110]) {
    const t = x / 200
    const lowerEdge = baseline - 3 * lowerRise * t * (1 - t)
    expect(obstacle.top - lowerEdge).toBeGreaterThanOrEqual(gap - 1e-6)
  }
  expect(geometry.ink(shape).bottom).toBeCloseTo(baseline)
})

it('gives long phrases a visible bounded bow while keeping short slurs compact', () => {
  const space = staffMusicSize() / 4
  const heights = [3, 20, 80, 300].map(span => {
    const shape = staffSlur(0, span * space, 100, [])
    const ink = new SvgGeometry(shape, textMeasurer()).ink(shape)
    return ink.bottom - ink.top
  })
  expect(heights[0]!).toBeLessThan(space)
  expect(heights[1]!).toBeGreaterThan(heights[0]!)
  expect(heights[2]!).toBeGreaterThan(heights[1]!)
  expect(heights[3]!).toBeCloseTo(heights[2]!)
  expect(heights[3]!).toBeLessThan(2 * space)
})


it.each(['dynam', 'hairpin'])('anchors a grand-staff %s to its own lane regardless of initial offset', cls => {
  const place = (lane: number, y: number) => {
    const staffs = [40, 180].map(top => element('g', { class: 'staff' }, [0, 10, 20, 30, 40].map(dy =>
      element('path', { class: 'staff-line', d: `M0 ${top + dy} H300`, fill: 'none', stroke: '#000', 'stroke-width': '1' }))))
    const attachment = element('g', { class: cls, 'data-m3n-staff': String(lane) }, [element('rect', { x: '100', y: String(y), width: '20', height: '12' })])
    const node = element('g', { class: 'system' }, [element('g', { class: 'measure' }, [...staffs, attachment])])
    const geometry = new SvgGeometry(node, textMeasurer())
    arrangeStaffSystem(node, geometry, 320, new Set())
    return geometry.ink(attachment)
  }
  for (const lane of [0, 1]) {
    const near = place(lane, 95), far = place(lane, 400)
    expect(far.top).toBeCloseTo(near.top)
    expect((near.top - (lane ? 220.5 : 80.5)) * scoreLayoutConfig.staff.engine.scale).toBeCloseTo(scoreLayoutConfig.staff.attachmentGap)
    if (!lane) expect(near.bottom).toBeLessThan(179.5)
  }
})

it('clears a framed section title from its caption by the fixed annotation gap', () => {
  const scale = scoreLayoutConfig.staff.engine.scale, gap = scoreLayoutConfig.numbered.music / scoreLayoutConfig.page.annotationGapDivisor
  const rules = [40, 50, 60, 70, 80].map(y => element('path', {
    class: 'staff-line', d: `M0 ${y} H300`, fill: 'none', stroke: '#000', 'stroke-width': '1',
  }))
  const caption = element('g', { class: 'dir' }, [element('rect', { x: '10', y: '20', width: '60', height: '12' })])
  const heading = element('g', { class: 'reh' }, [element('rect', { x: '0', y: '0', width: '80', height: '12' })])
  const node = element('g', { class: 'system' }, [element('g', { class: 'measure', id: 'm-section' }, [
    element('g', { class: 'staff' }, rules), caption, heading,
  ])])
  const geometry = new SvgGeometry(node, textMeasurer())
  arrangeStaffSystem(node, geometry, 320, new Set(['m-section']))
  const frameInk = geometry.ink(heading), captionInk = geometry.ink(caption)
  expect((captionInk.top - frameInk.bottom) * scale).toBeCloseTo(gap)
  expect(frameInk.left).toBeGreaterThanOrEqual(-1e-8)
})

it('does not lift tempo above the temporary position of an inline section frame', () => {
  const place = (headingTop: number) => {
    const rules = [40, 50, 60, 70, 80].map(y => element('path', {
      class: 'staff-line', d: `M0 ${y} H300`, fill: 'none', stroke: '#000', 'stroke-width': '1',
    }))
    const heading = element('g', { class: 'reh' }, [element('rect', { x: '0', y: String(headingTop), width: '80', height: '12' })])
    const tempo = element('g', { class: 'tempo' }, [element('rect', { x: '20', y: '-100', width: '30', height: '12' })])
    const node = element('g', { class: 'system' }, [element('g', { class: 'measure' }, [
      element('g', { class: 'staff' }, rules), heading, tempo,
    ])])
    const geometry = new SvgGeometry(node, textMeasurer())
    arrangeStaffSystem(node, geometry, 320, new Set())
    return { tempo: geometry.ink(tempo), heading: geometry.ink(heading) }
  }
  const near = place(10), far = place(-100)
  expect(far.tempo.bottom).toBeCloseTo(near.tempo.bottom)
  expect((39.5 - far.tempo.bottom) * scoreLayoutConfig.staff.engine.scale).toBeCloseTo(scoreLayoutConfig.staff.attachmentGap)
  expect((far.heading.top + far.heading.bottom) / 2).toBeCloseTo(60)
})
