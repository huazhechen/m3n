import { expect, it } from 'vitest'
import { compileScorePerformance, parseM3NDocument, scoreEventIds } from '@m3n/notation'
import source from '../scores/cai_yun_zhui_yue_01.m3n?raw'

it('plays all eight upper mordents in 彩云追月 without changing timing or highlights', () => {
  const document = parseM3NDocument(source)
  const result = compileScorePerformance(document)
  const plain = compileScorePerformance(parseM3NDocument(source.replaceAll('{prall}', '')))
  const ids = scoreEventIds(document)
  const marked = [...document.parts.values()].flatMap(part => part.melody.flatMap(bar => bar.events))
    .filter(event => event.postfixes.includes('prall'))
  expect(marked).toHaveLength(8)
  expect(result.elements).toEqual(plain.elements)
  expect(result.beats).toBe(plain.beats)
  expect(result.tempos).toEqual(plain.tempos)
  expect(result.notes).toHaveLength(plain.notes.length + 16)
  for (const event of marked) {
    const element = result.elements.find(element => element.xmlId === ids.get(event))!
    const notes = result.notes.filter(note => note.start >= element.start && note.start < element.end)
    const [principal, upper] = event.pitches[0] === '6' ? [74, 76] : event.pitches[0] === '5' ? [72, 74] : [67, 69]
    expect(notes.map(note => note.pitch)).toEqual([principal, upper, principal])
    expect(notes[0]!.start).toBe(element.start)
    expect(notes.at(-1)!.end).toBe(element.end)
  }
})
