import { describe, expect, it, vi } from 'vitest'
import { scoreMetadataFromSource } from '../score-metadata.js'
import * as tokenizer from './m3n-tokens.js'
import { invalidMeasureIds } from './measure-diagnostics.js'
import { analyzeM3N } from './analysis.js'

describe('M3N analysis', () => {
  it('tokenizes once for building, validation and source mapping', () => {
    const tokenize = vi.spyOn(tokenizer, 'tokenizeM3N')
    try {
      const source = '// comment\r\n{key=G}{4/4}\r\nN: 1 2 3 4 |||\r\nB: 1d 2d 3d 4d |\r\nL: 春夏秋冬'
      const analysis = analyzeM3N(source)
      expect(analysis.diagnostics).toEqual([])
      expect(tokenize).toHaveBeenCalledTimes(1)
      for (const range of analysis.interaction.sourceMap) expect(source.slice(range.sourceStart, range.sourceEnd)).not.toBe('')
    } finally { tokenize.mockRestore() }
  })

  it('returns directly cloneable analysis with event identity preserved across the worker boundary', () => {
    const source = '{title=Test}{4/4}\nN: 1 2 3 4 |||\nL: 春夏秋冬'
    const analysis = structuredClone(analyzeM3N(source))
    expect(analysis.source).toBe(source)
    expect(analysis.syntaxTree.source).toBe(source)
    expect(analysis.score.title).toBe('Test')
    expect(analysis.diagnostics).toEqual([])
    expect(analysis.invalidMeasureIds).toEqual([])
    const first = analysis.score.parts.get('score')!.melody[0]!.events[0]!
    expect(analysis.interaction.lyricsByEvent.get(first)?.[0]?.text).toBe('春')
    expect(analysis.interaction.sourceMap[0]).toMatchObject({ xmlId: 'm3n-e-1', sourceStart: first.sourceStart, sourceEnd: first.sourceEnd })
    expect(scoreMetadataFromSource('test', source).title).toBe('Test')
  })

  it('derives renderer diagnostics from the same parsed score', () => {
    const source = '{2/4}\nN: 1 2 3 |'
    const analysis = analyzeM3N(source)
    expect(analysis.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error' }))
    expect(analysis.invalidMeasureIds).toEqual(invalidMeasureIds(source, analysis.score))
  })
})
