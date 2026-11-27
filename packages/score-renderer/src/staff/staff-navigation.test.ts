import { expect, it } from 'vitest'
import { scoreLayoutConfig, scoreNavigationGlyphHeight } from '@m3n/numbered-notation/layout'
import { staffNavigationGlyph } from './staff-music-font.js'
import { analyzeM3N } from '@m3n/notation'
import { projectStaffDocument } from './staff-document.js'
import { planStaffLines } from './line-layout.js'
import { engraveStaffSystems } from './staff-system.js'
import { findAll, textMeasurer, xml } from './layout-svg.js'

it.each(['segno', 'coda'] as const)('normalizes %s ink height independently of staff music em', name => {
  const node = staffNavigationGlyph(name, 30, -10)
  const pieces = node.numericInk!
  const height = Math.max(...pieces.map(p => p.bottom)) - Math.min(...pieces.map(p => p.top))
  expect(height * scoreLayoutConfig.staff.engine.scale).toBeCloseTo(scoreNavigationGlyphHeight())
  expect(Math.min(...pieces.map(p => p.left))).toBeGreaterThan(29)
})

it('uses dedicated Bravura dynamic glyphs and shared text sizes', () => {
  const document = projectStaffDocument(analyzeM3N('{4/4}\nN: {mf}{text=soft}1 2 3 4 |||').score)
  const measure = textMeasurer()
  const lines = planStaffLines(document, 640, false, measure, .25)
  const system = engraveStaffSystems(document, lines, 640, measure, .25, true)[0]!
  const dynamic = findAll(system.node, node => node.attributes.class === 'dynam')[0]!
  expect(xml(dynamic)).toContain('Bravura')
  expect(xml(dynamic)).not.toContain('>mf<')
  for (const key of ['title', 'subtitle', 'credit', 'text', 'annotation', 'navigation', 'fine', 'measureNumber', 'fingering'] as const)
    expect(scoreLayoutConfig.staff[key]).toBe(scoreLayoutConfig.numbered[key])
})
