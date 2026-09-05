import { describe, expect, it } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { happi123ToM3N } from './happi123-m3n'
describe('happi current compatibility', () => {
  it('output parses as structured m3n', () => {
    const output = happi123ToM3N('{title:测试}\n{key_signature:C}\n{time_signature:4/4}\n1 2 3 4 |||').output
    const analysis = analyzeM3N(output)
    expect(analysis.conversion.diagnostics).toEqual([])
    expect([...analysis.score.parts.values()][0]?.melody.flatMap((measure) => measure.events)).toHaveLength(4)
  })

  it('keeps lyric rows in the current phrase structure', () => {
    const output = happi123ToM3N('{title:歌词}\n{key_signature:C}\n{time_signature:4/4}\n1 2 3 4 |||\n{lyric}春 夏 秋 冬{/lyric}').output
    const analysis = analyzeM3N(output)
    expect(output).toContain('N: 1 2 3 4 |||')
    expect(output).toContain('L: 春夏秋冬')
    expect(analysis.score.lyrics[0]?.syllables.map((item) => item.text)).toEqual(['春', '夏', '秋', '冬'])
  })

  it('maps alternative blocks to current volta rows', () => {
    const output = happi123ToM3N('{key_signature:C}\n{time_signature:2/4}\n1 2 | {+3 4%%5 6} |||').output
    expect(output).toContain('---V1')
    expect(output).toContain('---V2')
    const analysis = analyzeM3N(output)
    expect(analysis.score.parts.get('score')?.melody.some((measure) => measure.ending === '1')).toBe(true)
  })
})
