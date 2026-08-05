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

    expect(document.diagnostics).toContainEqual(expect.objectContaining({
      code: 'M3N_STRUCTURE_DUPLICATE_MELODY',
      message: '第 2 行：同一乐句只能有一个 N: 行',
      range: { start: 9, end: 17 },
    }))
    expect(document.diagnostics).toContainEqual(expect.objectContaining({
      code: 'M3N_STRUCTURE_MIXED_LYRIC_LABELS',
      message: '第 1 行：L: 与编号歌词行不能混用',
    }))
  })

  it('starts a new independent phrase after a section marker', () => {
    const document = parseM3NDocumentStructure('===Verse\nN: 1 2 |\n===\nN: 3 4 |||')

    expect(document.diagnostics).toEqual([])
  })

  it('allows melody fragments and restricts supplementary bars to alignment', () => {
    const document = parseM3NDocumentStructure('N: 1 2\nB: 1d 2d ||\nL: 甲乙 :||')

    expect(document.diagnostics.map((item) => item.message)).toEqual([
      '第 2 行：B: 只允许使用普通 | 作为小节对位标记',
      '第 3 行：L: 只允许使用普通 | 作为小节对位标记',
    ])
  })

  it('rejects a phrase ending with a forward repeat bar', () => {
    const document = parseM3NDocumentStructure([
      'N: 1 2 ||:',
      '---',
      'N: 3 4 :||:',
      '---',
      'N: ||: 5 6 |',
    ].join('\n'))

    expect(document.diagnostics).toEqual([
      expect.objectContaining({
        code: 'M3N_STRUCTURE_TRAILING_REPEAT_START',
        message: '第 1 行：乐句不能以前反复线结尾',
      }),
      expect.objectContaining({
        code: 'M3N_STRUCTURE_TRAILING_REPEAT_START',
        message: '第 3 行：乐句不能以前反复线结尾',
      }),
    ])
  })

  it('keeps absolute row offsets for CRLF documents', () => {
    const document = parseM3NDocumentStructure('===Verse\r\nN: 1 2 |\r\nL: 甲乙 |')
    expect(document.sections[0]?.phrases[0]).toMatchObject({
      melody: { start: 13 },
      lyrics: [{ start: 23 }],
    })
  })
})
