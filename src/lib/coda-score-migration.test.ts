import { writtenEventSpans } from './fixtures/written-event-spans'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { compileScorePerformance, deriveScoreInteraction, formatM3N, parseM3NDocument, resolveScorePitches, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'

// Captured from the four approved arrangements before changing navigation or houses.
// 黑色幽默 includes the approved bar 43 pitches, restored original triplet ending,
// and simplified final 3e notes in bars 19 and 20.
const baselines = [
  ['flower_dance', '9587f1f7ec480e7b2ead654bf49d1a03109301a5b5adac14b573261f16acba79'],
  ['ai_de_li_zan', 'e830f4034c0e44a479a4296928034ee8c57049c8d59eb01bbbea9e153ca9a279'],
  ['hei_se_you_mo', '340fe545e89d2db554fceb5e61bff5a2481772ea70efdb3ef9ca0d01cf48d2fd'],
  ['bai_hua_lin', '125c0c339df5316ed23e903bdbd9e266131bc13fd772c5fdfb02b3404994c70b'],
] as const

it.each(baselines)('preserves every performed event and lyric after simplifying %s', (name, hash) => {
  const source = readFileSync(new URL(`../scores/${name}_01.m3n`, import.meta.url), 'utf8')
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(formatM3N(source)).toBe(source)
  const document = parseM3NDocument(source)
  const performance = compileScorePerformance(document)
  const interaction = deriveScoreInteraction(document)
  const ids = new Map([...scoreEventIds(document)].map(([event, id]) => [id, interaction.lyricsByEvent.get(event) ?? []]))
  const bars = unfoldScorePerformance(document).parts.get('score')!.melody
  const pitches = resolveScorePitches(bars)
  const data = {
    beats: performance.beats, notes: performance.notes, tempos: performance.tempos,
    events: bars.flatMap(bar => bar.events.map(event => [pitches.get(event) ?? [], event.beats, event.tie, event.postfixes, event.dynamic ?? null, event.tempo])),
    lyrics: writtenEventSpans(performance.elements).filter(element => element.voice === 'score:melody')
      .flatMap(element => (ids.get(element.xmlId) ?? [])
        .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
        .map(lyric => [element.start, element.end, lyric.text])),
  }
  expect(createHash('sha256').update(JSON.stringify(data)).digest('hex')).toBe(hash)
  const houses = document.parts.get('score')!.melody.filter(bar => bar.ending)
  if (name === 'bai_hua_lin') {
    expect(houses.map(bar => bar.ending)).toEqual(['1', '2'])
    expect(source).not.toContain('{tocoda}')
  } else if (name === 'hei_se_you_mo') {
    expect(houses.map(bar => bar.ending)).toEqual(['1', '2'])
    expect(source).not.toMatch(/\{(?:tocoda|coda)\}/)
    expect(source).not.toMatch(/\|\|:/)
    expect(source.match(/:\|\|/g)).toHaveLength(1)
  } else {
    expect(source).toContain('{tocoda}')
    expect(source).toContain('{coda}')
    expect(houses).toHaveLength(0)
    expect(source).not.toMatch(/^===|\{order=/m)
  }
})
