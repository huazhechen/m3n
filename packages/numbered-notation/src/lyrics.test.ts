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

describe('shared lyric visit labels', () => {
  const rows = (source: string) => [...lyricsByEvent(parseM3NDocument(source)).values()]
    .flatMap(slots => [...slots.values()].flatMap(rows => [...rows.values()]))

  it('omits labels for one row shared by all three visits without losing playback passes', () => {
    const data = rows('{2/4}\nN: ||: 1 2 :|||{x3}\nL1: 春天\nL2: {L1}\nL3: {L1}')
    expect(data.map(row => row.texts.join('')).join('')).toBe('春天')
    expect(data.every(row => row.annotation === undefined)).toBe(true)
    expect(data.map(row => [...row.passes!])).toEqual([[1, 2, 3], [1, 2, 3]])
  })

  it('retains labels for different rows and partially shared visits', () => {
    const data = rows('{2/4}\nN: ||: 1 2 :|||{x3}\nL1: 春天\nL2: 花开\nL3: {L2}')
    expect(data.flatMap(row => row.annotation ? [row.annotation] : [])).toEqual(['1.', '2.3.'])
  })

  it('retains a label for a single row that only covers some actual visits', () => {
    const document = parseM3NDocument('{2/4}\nN: ||: 1 2 :|||{x3}\nL1: 春天\nL2: {L1}\nL3: {L1}')
    // A single shared block can also be restricted independently of the music.
    document.lyrics[0]!.sharedPasses = '2,3'
    const data = [...lyricsByEvent(document).values()].flatMap(slots => [...slots.values()].flatMap(rows => [...rows.values()]))
    expect(data.flatMap(row => row.annotation ? [row.annotation] : [])).toEqual(['2.3.'])
    expect(data.map(row => [...row.passes!])).toEqual([[2, 3], [2, 3]])
  })

  it('omits the redundant chorus label in 明天会更好 and keeps the differing ending labels', () => {
    const source = readFileSync(new URL('../../../src/scores/ming_tian_hui_geng_hao_01.m3n', import.meta.url), 'utf8')
    expect(validateM3NDiagnostics(source)).toEqual([])
    const data = rows(source)
    const chorus = data.find(row => row.texts.includes('唱'))!
    expect(chorus.annotation).toBeUndefined()
    expect([...chorus.passes!]).toEqual([1, 2, 3])
    expect(data.filter(row => row.texts.includes('骄')).map(row => row.annotation)).toEqual(['1.2.', '3.'])
  })
})
