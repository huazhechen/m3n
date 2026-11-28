import { readFileSync, readdirSync } from 'node:fs'
import { parseM3NDocument, scoreEventIds } from '@m3n/notation'
import { expect, it } from 'vitest'
import { projectNativeScore } from './native-model.js'
import { DefaultTextMeasurer } from './native-measure.js'

it('projects every library, work and example event without reparsing or mutating the document', () => {
  const textMeasurer = new DefaultTextMeasurer()
  for (const scope of ['scores', 'works', 'examples']) {
    const folder = new URL(`../../../src/${scope}/`, import.meta.url)
    for (const file of readdirSync(folder).filter(file => file.endsWith('.m3n'))) {
      const document = parseM3NDocument(readFileSync(new URL(file, folder), 'utf8'))
      const before = structuredClone(document), ids = scoreEventIds(document)
      Object.defineProperty(document, 'source', { get() { throw new Error('projection must not reparse source') } })
      const projection = projectNativeScore(document, { textMeasurer })
      const slots = new Map<string, Set<number>>()
      for (const glyph of projection.glyphs) {
        if (!glyph.event) continue // Multi-bar rests have no source event.
        if (!slots.has(glyph.xmlId)) slots.set(glyph.xmlId, new Set())
        slots.get(glyph.xmlId)!.add(glyph.slot)
      }
      expect([...slots.keys()].sort(), file).toEqual([...ids.values()].sort())
      for (const [event, id] of ids) {
        if (event.kind === 'tuplet') expect(slots.get(id)!.size, `${file}: ${id}`).toBe(event.pitches.length)
      }
      expect(new Set(projection.glyphs.map(glyph => glyph.id)).size, file).toBe(projection.glyphs.length)
      expect(projection.diagnostics.filter(item => item.severity === 'error'), file).toEqual([])
      expect([...document.parts], file).toEqual([...before.parts])
    }
  }
})
