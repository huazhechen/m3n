import { compileScorePerformance, deriveScoreInteraction, formatM3N, parseM3NDocument, scoreEventIds, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/zui_chang_de_dian_ying_01.m3n?raw'
import reference from './fixtures/zui-chang-de-dian-ying-kuaiyuepu.json'

it('preserves the original A-B-C-B-C-C pitches, attacks and lyric anchors with complementary pickup endings', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(formatM3N(source)).toBe(source)
  const document = parseM3NDocument(source)
  expect(document).toMatchObject({ title: '最长的电影', singer: '周杰伦', composer: '周杰伦', lyricist: '周杰伦', key: reference.key, tempo: reference.tempo })
  const performance = compileScorePerformance(document)
  expect(performance.beats).toBe(reference.performedBeats)
  expect(performance.notes.filter(note => note.channel === 0).map(note => [note.start, note.end, note.pitch])).toEqual(reference.notes)
  expect(performance.notes.filter(note => note.channel !== 0)).toEqual([])
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const lyrics = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const actual = performance.elements.filter(element => element.voice === 'score:melody').flatMap(element => (lyrics.get(element.xmlId) ?? [])
    .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
    .map(lyric => [element.start, lyric.text]))
  expect(actual).toEqual(reference.lyrics.map(([start, , text]) => [start, text]))
})

it('uses full-measure repeat and DS boundaries with pickups inside the first and second houses', () => {
  const document = parseM3NDocument(source)
  expect(document.order).toBeUndefined()
  expect(document.sections ?? []).toEqual([])
  const bars = document.parts.get('score')!.melody
  const navigation = (bar: typeof bars[number]) => [...(bar.navigation ?? []), ...bar.events.flatMap(event => event.navigation)]
  const structural = bars.filter(bar => bar.left === 'rptstart' || bar.right === 'rptend' || navigation(bar).some(mark => mark === 'ds' || mark === 'segno'))
  expect(structural).toHaveLength(4)
  for (const bar of structural) expect(bar.events.reduce((sum, event) => sum + event.beats, 0)).toBe(4)
  expect(source).toMatch(/---V1\nN: 1e\^ 0 \(1 2\) :\|\|/)
  expect(source).toMatch(/---V2\nN: 1e\^ \(0 3e\) \(2e 1e\) \{ds\}/)
  expect(source).toContain('---V3\nN: 1e^. |||')
})
