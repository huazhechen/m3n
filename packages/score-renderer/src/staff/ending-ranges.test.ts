// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { analyzeM3N } from '@m3n/notation'
import { projectStaffDocument } from './staff-document.js'
import { findAll, hasClass, textMeasurer } from './layout-svg.js'
import { planStaffLines } from './line-layout.js'
import { engraveStaffSystems } from './staff-system.js'

vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

it('starts each repeated ending number anew in The Second Waltz', () => {
  const score = analyzeM3N(readFileSync('../../src/scores/second_waltz_01.m3n', 'utf8')).score
  const document = projectStaffDocument(score), measure = textMeasurer()
  for (const width of [480, 640, 720]) {
    const lines = planStaffLines(document, width, false, measure, 0.25)
    const systems = engraveStaffSystems(document, lines, width, measure, 0.25, false)
    const brackets = systems.flatMap(system => findAll(system.node, node => hasClass(node, 'voltaBracket')))
    for (let index = 1; index <= 4; index++) {
      const range = brackets.filter(node => hasClass(node, `id-m3n-ending-${index}`))
      expect(range.length).toBeGreaterThan(0)
      expect(range.flatMap(node => findAll(node, child => hasClass(child, 'm3n-ending-start-hook')))).toHaveLength(1)
      expect(range.flatMap(node => findAll(node, child => child.tagName === 'text')).map(node => node.children.join('')).join(''))
        .toBe(`${index % 2 ? 1 : 2}.`)
    }
  }
})
