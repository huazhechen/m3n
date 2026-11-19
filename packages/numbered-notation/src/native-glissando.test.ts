// @vitest-environment jsdom
import { parseM3NDocument } from '@m3n/notation'
import { expect, it } from 'vitest'
import { layoutNativeScore } from './native-layout.js'
import { renderNativePages } from './native-svg.js'
import { DefaultTextMeasurer } from './native-measure.js'

it.each([320, 800])('draws a measured slide between its two hosts while preserving lyrics at width %s', width => {
  const layout = layoutNativeScore(parseM3NDocument('{2/4}\nN: (2e{gliss} 1e) 1e |||\nL: 拥%抱'), { width, paged: false, textMeasurer: new DefaultTextMeasurer() })
  expect(layout.projection.diagnostics).toEqual([])
  const relations = layout.relations.filter(relation => relation.kind === 'gliss')
  expect(relations).toHaveLength(1)
  expect(relations[0]!.first.pitches[0]!.degree).toBe('2')
  expect(relations[0]!.last.pitches[0]!.degree).toBe('1')
  const root = new DOMParser().parseFromString(renderNativePages(layout).join(''), 'text/html')
  expect(root.querySelectorAll('[data-m3n-role="gliss-curve"]')).toHaveLength(1)
  const placed = layout.systems[0]!.relationLayout!.get(relations[0]!)!
  expect(placed.ink.left).toBeGreaterThan(relations[0]!.first.x + relations[0]!.first.musicRight!)
  expect(placed.ink.right).toBeLessThan(relations[0]!.last.x - relations[0]!.last.musicLeft!)
  expect(root.querySelector('[data-m3n-relation="gliss"][data-direction]')?.getAttribute('data-direction')).toBe('down')
  expect(root.querySelectorAll('[data-m3n-role="gliss-arrowhead"]')).toHaveLength(1)
  expect(placed.ink.left).toBeLessThan(placed.ink.right)
  expect(placed.ink.top).toBeLessThan(placed.ink.bottom)
  expect(root.body.textContent).toContain('拥')
  expect(root.body.textContent).toContain('抱')
})
it('renders both fragments of a slide at a forced system break', () => {
  const layout = layoutNativeScore(parseM3NDocument('{1/4}\nN: 1{gliss} | {br} 2 |||'), { width: 320, paged: false, textMeasurer: new DefaultTextMeasurer() })
  expect(layout.systems).toHaveLength(2)
  const root = new DOMParser().parseFromString(renderNativePages(layout).join(''), 'text/html')
  expect(root.querySelectorAll('[data-m3n-role="gliss-curve"]')).toHaveLength(2)
  expect(root.querySelectorAll('[data-m3n-role="gliss-arrowhead"]')).toHaveLength(1)
})

it.each([['1', '2', 'up'], ['2', '1', 'down'], ['1e', '7', 'down'], ['1#', '1=', 'down'], ['1#', '1', 'level']] as const)('points %s → %s in the pitch direction', (from, to, direction) => {
  const layout = layoutNativeScore(parseM3NDocument(`{2/4}\nN: ${from}{gliss} ${to} |||`), { width: 320, paged: false, textMeasurer: new DefaultTextMeasurer() })
  const root = new DOMParser().parseFromString(renderNativePages(layout).join(''), 'text/html')
  expect(root.querySelector('[data-m3n-relation="gliss"][data-direction]')?.getAttribute('data-direction')).toBe(direction)
  const curve = root.querySelector('[data-m3n-role="gliss-curve"]')!.getAttribute('d')!
  const coordinates = curve.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
  expect(coordinates[0]).toBeLessThan(coordinates.at(-2)!)
  if (direction === 'up') expect(coordinates[1]).toBeGreaterThan(coordinates.at(-1)!)
  else if (direction === 'down') expect(coordinates[1]).toBeLessThan(coordinates.at(-1)!)
  else expect(coordinates[1]).toBe(coordinates.at(-1)!)
})
