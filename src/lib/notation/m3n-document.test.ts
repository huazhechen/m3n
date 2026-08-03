import { describe, expect, it } from 'vitest'
import { parseM3NDocumentStructure } from './m3n-document'

describe('M3N v0.3 document structure', () => {
  it('parses form, named sections, phrases, and supplemental rows', () => {
    const document = parseM3NDocumentStructure([
      '{form=A,B,A}',
      '===A',
      'N: 1 2 |',
      'B: 1d 5d |',
      'L: 甲乙',
      '===B',
      'N: 3 4 |',
      'C: I V |',
    ].join('\n'))

    expect(document.diagnostics).toEqual([])
    expect(document.form).toEqual(['A', 'B', 'A'])
    expect(document.sections.map((section) => section.name)).toEqual(['A', 'B'])
    expect(document.sections[0]?.phrases[0]).toMatchObject({
      melody: { text: '1 2 |' },
      bass: { text: '1d 5d |' },
      lyrics: [{ label: '', text: '甲乙' }],
    })
    expect(document.sections[1]?.phrases[0]?.harmony?.text).toBe('I V |')
  })

  it('rejects duplicate melody rows and mixed lyric modes', () => {
    const document = parseM3NDocumentStructure('N: 1 2 |\nN: 3 4 |\nL: 甲乙\nL1: 丙丁')

    expect(document.diagnostics).toContain('第 2 行：同一乐句只能有一个 N: 行')
    expect(document.diagnostics).toContain('第 1 行：L: 与编号歌词行不能混用')
  })
})
