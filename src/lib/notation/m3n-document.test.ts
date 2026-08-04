import { describe, expect, it } from 'vitest'
import { parseM3NDocumentStructure } from './m3n-document'

describe('M3N v0.4 document structure', () => {
  it('parses display sections, phrases, and supplemental rows', () => {
    const document = parseM3NDocumentStructure([
      '===A',
      'N: 1 2 |',
      'B: 1d 5d |',
      'L: 甲乙',
      '===B',
      'N: 3 4 |',
      'C: I V |',
    ].join('\n'))

    expect(document.diagnostics).toEqual([])
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

  it('starts a new independent phrase after a section marker', () => {
    const document = parseM3NDocumentStructure('===Verse\nN: 1 2 |\n===\nN: 3 4 |||')

    expect(document.diagnostics).toEqual([])
  })

  it('requires melody rows to end with a bar and restricts supplementary bars to alignment', () => {
    const document = parseM3NDocumentStructure('N: 1 2\nB: 1d 2d ||\nL: 甲乙 :||')

    expect(document.diagnostics).toContain('第 1 行：每个 N: 乐句必须以小节线结束')
    expect(document.diagnostics).toContain('第 2 行：B: 只允许使用普通 | 作为小节对位标记')
    expect(document.diagnostics).toContain('第 3 行：L: 只允许使用普通 | 作为小节对位标记')
  })
})
