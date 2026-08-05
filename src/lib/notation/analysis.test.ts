import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '../m3n-direct'
import { m3nToMei } from '../m3n-mei'
import { invalidMeasureIds } from './measure-diagnostics'
import { analyzeM3N } from './analysis'

describe('M3N analysis', () => {
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
