import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { writtenEventSpans } from './fixtures/written-event-spans'
import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'

// Performance fingerprints captured before migrating the written choices to houses.
// 星星点灯 includes the user corrections to bars 24/26, repeat boundaries and ending cadences.
// 童话镇 now has a dedicated uploaded-image/2/4 reference test.
// 爱如潮水 and 枫 include the requested instrumental slide cleanups.
// 爱如潮水 also includes the restored 3→2 endings in bars 21 and 30,
// independently covered by love-like-tide-navigation.test.ts.
// 枫 also shares the first three ending bars using the later visits' rhythm.
const cases = [
  {
    "file": "bei_jia_er_hu_pan_01.m3n",
    "music": "828e34e66d9e837fed4ecd7f743aa9ebe2b2128f55de16ced7f72cac2bb0a346",
    "lyrics": "f5fbdc915e40553a53dc35c82f10ac1af45e393f2f5b7373ff1d216ee0fb52c5",
    "events": 271,
    "syllables": 186
  },
  {
    "file": "bai_hua_lin_01.m3n",
    "music": "1d1c34b8e733816de2b3b2b2502d3ebce4b2665ac93ba5808a0a16b021333945",
    "lyrics": "117edd1d6608e4b88365f3bc9c89c19529b6bbd32767687e8c0a19291f28c201",
    "events": 314,
    "syllables": 313
  },
  {
    "file": "feng_01.m3n",
    "music": "d091634778a6e230f4f3163c7d0b763c5bf2ab53f3e5c49f862878bd8eff878e",
    "lyrics": "e4b769544da6a374e27b3e6d8cdaa49d06d0e657e18dd84d20d7b751572df5ce",
    "events": 512,
    "syllables": 397
  },
  {
    "file": "world-gift-original.m3n",
    "music": "63683f37109dd0efafe4a4ea9a53dd5cd98f286c236fb79b8e8ef320ab35e912",
    "lyrics": "25072391744bb43c670779a293a65608c2d61b9f2995389ff02aa53620f8ff70",
    "events": 297,
    "syllables": 227
  },
  {
    "file": "qian_si_xi_01.m3n",
    "music": "e76b2116776323de8b96b41f28b2f979cf71f86fe31044d6e8f5da022e63141d",
    "lyrics": "0f4096fc82cdd429b131dd6b3cf9ed2aafaffb1aec160f3c7bed30e775526522",
    "events": 385,
    "syllables": 310
  },
  {
    "file": "ai_ru_chao_shui_01.m3n",
    "music": "04b5626936ce1fcca55a7fd60d074823e83624ea7f61698a6b3d1e23ee37ea66",
    "lyrics": "e0217427a9c36dd441e64fbf54ec02cddd14f9da2ef6c265cb9d9fedc7af8540",
    "events": 457,
    "syllables": 356
  },
  {
    "file": "xing_xing_dian_deng_01.m3n",
    "music": "40f82efccee2527c1d01ea729b832f7c4eaea270aeafd351387fd0dfeda23fe7",
    "lyrics": "9bc9984c9f935e589e617b2f616e434199856fa59914f38be0fa73894d8678e2",
    "events": 717,
    "syllables": 444
  }
]

it.each(cases)('preserves every performed note and lyric after house migration: $file', baseline => {
  const path = baseline.file === 'world-gift-original.m3n' ? `./fixtures/${baseline.file}` : `../scores/${baseline.file}`
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  expect(validateM3NDiagnostics(source)).toEqual([])
  if (baseline.file === 'feng_01.m3n') expect(source).not.toMatch(/---V|\{order=/)
  else expect(source).toMatch(/---V/)
  const document = parseM3NDocument(source)
  const performance = unfoldScorePerformance(document)
  const measures = performance.parts.get('score')!.melody
  const pitches = resolveScorePitches(measures)
  const music = measures.flatMap(measure => measure.events.map(event => [pitches.get(event) ?? [], event.beats, event.tie, event.postfixes, event.dynamic ?? null, event.tempo]))
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const lyrics = writtenEventSpans(compileScorePerformance(document).elements).filter(element => element.voice === 'score:melody')
    .flatMap(element => (byId.get(element.xmlId) ?? []).filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
      .map(lyric => [element.start, element.end, lyric.text]))
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  expect(music).toHaveLength(baseline.events)
  expect(lyrics).toHaveLength(baseline.syllables)
  expect(hash(music)).toBe(baseline.music)
  expect(hash(lyrics)).toBe(baseline.lyrics)
})
