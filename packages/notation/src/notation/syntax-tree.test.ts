import { describe, expect, it } from 'vitest' 
import { parseM3NSyntaxTree } from './syntax-tree.js'

describe('M3N syntax tree', () => {
  it('preserves every line and provides absolute token spans', () => {
    const source = '{title=Test}\n=== Verse\nN: 1 2 |\nL: hi |\nnot valid here'
    const tree = parseM3NSyntaxTree(source)
    expect(tree.lines.map((line) => line.kind)).toEqual(['header', 'section', 'row', 'row', 'unknown'])
    expect(tree.lines[2]?.row).toMatchObject({ kind: 'melody', content: '1 2 |', contentStart: 26 })
    for (const token of tree.tokens) expect(source.slice(token.start, token.end)).toBe(token.raw)
  })

  it('tracks columns after newlines', () => {
    const tree = parseM3NSyntaxTree('  1\n  2')
    const notes = tree.tokens.filter((token) => token.kind === 'note')
    expect(notes.map(({ line, column }) => [line, column])).toEqual([[1, 3], [2, 3]])
  })

  it('parses directive nodes with values and closing semantics', () => {
    const tree = parseM3NSyntaxTree('N: {cresc}1 2{/cresc} {rit=72} |||')
    expect(tree.lines[0]?.row?.directives).toEqual([
      expect.objectContaining({ name: 'cresc', closing: false }),
      expect.objectContaining({ name: 'cresc', closing: true }),
      expect.objectContaining({ name: 'rit', value: '72', closing: false }),
    ])
  })
})
