import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseM3NDocument, validateM3NDiagnostics } from '@m3n/notation'
import { lyricsByEvent } from './lyrics.js'

describe('lyrics across phrase boundaries', () => {
  it('leaves the opening tied note of 我的祖国 measure 10 empty in every verse', () => {
    const source = readFileSync(new URL('../../../src/scores/wo_de_zu_guo_01.m3n', import.meta.url), 'utf8')
    expect(validateM3NDiagnostics(source)).toEqual([])
    const document = parseM3NDocument(source)
    const lyrics = lyricsByEvent(document)
    const measures = document.parts.get('score')!.melody
    const text = (measure: number, event: number, row: number) => lyrics.get(measures[measure - 1]!.events[event]!)?.get(0)?.get(row)?.texts.join('')
    for (const row of [0, 1, 2]) {
      expect(text(10, 0, row)).toBe('')
      expect(text(10, 1, row)).toBe('这')
      expect(text(10, 2, row)).toBe('是')
      expect(text(11, 2, row)).toBe('的')
      expect(text(12, 0, row)).toBe('祖')
      expect(text(12, 4, row)).toBe('国')
    }
  })

  it('still allows an explicit lyric on a tied continuation at a phrase opening', () => {
    const document = parseM3NDocument('{4/4}\nN: 1^^~ |\nL: 春\n---\nN: 1^^ |||\nL: +风')
    const event = document.parts.get('score')!.melody[1]!.events[0]!
    expect(lyricsByEvent(document).get(event)?.get(0)?.get(0)?.texts).toEqual(['风'])
  })
})
