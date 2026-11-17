import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'

// Performance fingerprints captured before migrating the written choices to houses.
// 爱如潮水 includes the separately committed 醉→不 slide cleanup (62af603).
const cases = [
  {
    "file": "bei_jia_er_hu_pan_01.m3n",
    "music": "828e34e66d9e837fed4ecd7f743aa9ebe2b2128f55de16ced7f72cac2bb0a346",
    "lyrics": "f5fbdc915e40553a53dc35c82f10ac1af45e393f2f5b7373ff1d216ee0fb52c5",
    "events": 271,
    "syllables": 186
  },
  {
    "file": "tong_hua_zhen_01.m3n",
    "music": "abab557f69007cf4211f829e9147ab5cc233120d6dfccc951ee1fa6348252a59",
    "lyrics": "a3fbb57e26372b394140d8196aae40f741562a6b131fb3b77eed35be6c966d30",
    "events": 473,
    "syllables": 365
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
    "music": "296a138b9cecf76ac822b44e6b9bc48679a7eb22f7fe43bb6a7e06b990e64c9e",
    "lyrics": "4a61f66447e7d3d0f8116d78ebc980424b1aedec887e6890947e0aa19a426edc",
    "events": 523,
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
    "music": "4ce044db58e46b8a2a904d68a4456410145163e593a0439fe4f031d475059075",
    "lyrics": "1ff60c533601e318f3e268617cdeff11a8ce60d6ecac9306c99e5e50ff42b896",
    "events": 718,
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
