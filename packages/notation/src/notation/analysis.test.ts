import { describe, expect, it, vi } from 'vitest'
import * as conversion from '../m3n-mei.js'
import { scoreMetadataFromSource } from '../score-metadata.js'
import { parseM3NDocument } from '../m3n-direct.js'
import { m3nToMei } from '../m3n-mei.js'
import { invalidMeasureIds } from './measure-diagnostics.js'
import { analyzeM3N } from './analysis.js'

describe('M3N analysis', () => {
  it('does not serialize MEI for metadata and memoizes conversion without validating again', () => {
    const convert = vi.spyOn(conversion, 'm3nToMei')
    try {
      const source = '{title=Lazy}{4/4}\nN: 1 2 3 4 |||'
      expect(scoreMetadataFromSource('lazy', source).title).toBe('Lazy')
      const analysis = analyzeM3N(source)
      expect(analysis.diagnostics).toEqual([])
      expect(convert).not.toHaveBeenCalled()
      const first = analysis.conversion
      expect(analysis.conversion).toBe(first)
      expect(first.diagnostics).toBe(analysis.diagnostics)
      expect(convert).toHaveBeenCalledTimes(1)
    } finally { convert.mockRestore() }
  })
  it('keeps conversion compatibility while exposing both document models', () => {
    const source = '{title=Test} {key=C} {4/4}\nN: 1 2 3 4 |||'
    const analysis = analyzeM3N(source)
    expect(analysis.source).toBe(source)
    expect(analysis.syntaxTree.source).toBe(source)
    expect(analysis.score.title).toBe('Test')
    expect(analysis.conversion).toEqual(m3nToMei(source, parseM3NDocument(source)))
    expect(analysis.invalidMeasureIds).toEqual([])
  })

  it('derives renderer diagnostics from the same parsed score', () => {
    const source = '{2/4}\nN: 1 2 3 |'
    const analysis = analyzeM3N(source)

    expect(analysis.invalidMeasureIds).toEqual(invalidMeasureIds(source, analysis.score))
    expect(analysis.conversion.diagnostics).toEqual(m3nToMei(source, analysis.score, {
      syntaxTree: analysis.syntaxTree,
      projection: analysis.projection,
    }).diagnostics)
  })
})
