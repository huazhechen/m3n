import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'

// Performance fingerprints captured before migrating the written choices to houses.
// 星星点灯 includes the subsequent five-page tie/lyric audit and requested removal of all grace notes.
// 童话镇 now has a dedicated uploaded-image/2/4 reference test.
// 爱如潮水 and 枫 include the requested instrumental slide cleanups.
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
    "music": "a662e55ba5dbaab3c29c3b229e4d3db7fe1839dafa0f4a9bf30e44d1cfddecfa",
    "lyrics": "bd942eba5e3e8d377c0cf9de4d95e3d6a1488a450a1cdc42852e8d51a75228e0",
    "events": 517,
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
    "music": "59c9af2c95ce497e0e929be441e8012d340676bc10b830dc49542993335ff307",
    "lyrics": "ac189b92ab239b282cfff89f81e30241d2ab42c875018f0d886b53e0c0161351",
    "events": 454,
    "syllables": 356
  },
  {
    "file": "xing_xing_dian_deng_01.m3n",
    "music": "646cffc94477475ad6f5423e69c81b8461db3bb9a49963bff42bfdf388199052",
    "lyrics": "4952963072692acbc6765ea8b2a7cdd8b8b57dd672137fc485f11e144e040628",
    "events": 719,
    "syllables": 444
  }
]

it.each(cases)('preserves every performed note and lyric after house migration: $file', baseline => {
  const path = baseline.file === 'world-gift-original.m3n' ? `./fixtures/${baseline.file}` : `../scores/${baseline.file}`
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(source).toMatch(/---V/)
  const document = parseM3NDocument(source)
  const performance = unfoldScorePerformance(document)
  const measures = performance.parts.get('score')!.melody
  const pitches = resolveScorePitches(measures)
  const music = measures.flatMap(measure => measure.events.map(event => [pitches.get(event) ?? [], event.beats, event.tie, event.postfixes, event.dynamic ?? null, event.tempo]))
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const lyrics = compileScorePerformance(document).elements.filter(element => element.voice === 'score:melody')
    .flatMap(element => (byId.get(element.xmlId) ?? []).filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
      .map(lyric => [element.start, element.end, lyric.text]))
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  expect(music).toHaveLength(baseline.events)
  expect(lyrics).toHaveLength(baseline.syllables)
  expect(hash(music)).toBe(baseline.music)
  expect(hash(lyrics)).toBe(baseline.lyrics)
})
