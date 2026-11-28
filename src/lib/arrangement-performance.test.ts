import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'

// Independent performance fingerprints captured before the arrangement and label edits.
it.each([
  ['lao_nan_hai_01', '83d2a9227296eae6a3d38df122d73a8b1c1f546f31d9d7bb63d323de02aa931d', '4453d091612f624765e840069a462fad02a9915d34c4d9aef3f6cf4702a3a7dd'],
  ['turkish_march_01', '85e896c17ec121f345e1f953dc7e993ff02405a644884ad20ce80e7397db6889', '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'],
])('preserves all music and timed lyrics for %s', (file, musicHash, lyricsHash) => {
  const source = readFileSync(new URL(`../scores/${file}.m3n`, import.meta.url), 'utf8')
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  const bars = unfoldScorePerformance(document).parts.get('score')!.melody
  const pitches = resolveScorePitches(bars)
  const music = bars.flatMap(bar => bar.events.map(event => [pitches.get(event), event.beats, event.tie, event.postfixes, event.dynamic, event.tempo]))
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const performance = compileScorePerformance(document)
  // Captured from the pre-8va source: written grace notes may change while sounding music stays identical.
  const { notes, tempos, meters, beats } = performance
  const soundingMusic = { notes, tempos, meters, beats }
  const lyrics = performance.elements.flatMap(element => (byId.get(element.xmlId) ?? [])
    .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
    .map(lyric => [element.start, element.end, lyric.text]))
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  expect(hash(file === 'turkish_march_01' ? soundingMusic : music)).toBe(musicHash)
  expect(hash(lyrics)).toBe(lyricsHash)
})
