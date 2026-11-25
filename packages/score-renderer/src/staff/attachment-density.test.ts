import { expect, it } from 'vitest'
import { scoreLayoutConfig } from '@m3n/numbered-notation'
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


it('uses the bow rise to clear a central obstacle without lifting both endpoints above it', () => {
  const obstacle = { left: 90, right: 110, top: 0, bottom: 10 }
  const shape = staffSlur(0, 200, 100, [obstacle])
  const geometry = new SvgGeometry(shape, textMeasurer())
  const path = nodes(shape)[0]!
  const baseline = Number(/^M\S+ (\S+)/.exec(path.attributes.d!)![1])
  const gap = scoreLayoutConfig.staff.attachmentGap / scoreLayoutConfig.staff.engine.scale
  // A straight line above the obstacle would require a negative baseline.
  expect(baseline).toBeGreaterThan(0)
  for (const x of [90, 100, 110]) {
    const t = x / 200
    const lowerEdge = baseline - 3 * (staffMusicSize() / 4 * 1.2) * t * (1 - t)
    expect(obstacle.top - lowerEdge).toBeGreaterThanOrEqual(gap - 1e-6)
  }
  expect(geometry.ink(shape).bottom).toBeCloseTo(baseline)
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
