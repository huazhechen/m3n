import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import reference from './fixtures/ni-shi-wo-xin-ai-de-gu-niang-cangqiang.json'
import plan from '../../config/scorebook/editorial-plan.json'
import categories from '../../config/scorebook/library-categories.json'

const file = 'ni_shi_wo_xin_ai_de_gu_niang_01.m3n'
const source = readFileSync(new URL(`../scores/${file}`, import.meta.url), 'utf8')
const document = parseM3NDocument(source)

// Read the website's independent notation: x marks a triplet eighth,
// g raises the octave, d lowers it, and each dash adds a quarter note.
const sections = new Map([...reference.notation.matchAll(/([ABC]):\n([\s\S]*?)(?=\n[ABC]:|$)/g)].map(([, name, body]) => {
  const text = body!.replace(/\(3:/g, '(')
  const events = [...text.matchAll(/([0-7])([dxg]*)(-*)/g)].map(match => ({
    pitch: match[1] === '0' ? '0' : match[1]! + (match[2]!.includes('d') ? 'd' : match[2]!.includes('g') ? 'e' : ''),
    ticks: match[2]!.includes('x') ? 1 : 3 * (1 + match[3]!.length),
    tie: text[match.index! - 1] === '(' && text[match.index! + match[0].length] === ')',
  }))
  return [name!, events] as const
}))

describe('Cangqiang 5810 transcription', () => {
  it('preserves every original melody event except the documented one-beat pickup correction', () => {
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(document).toMatchObject({ title: '你是我心爱的姑娘', key: 'B', meterCount: 4, meterUnit: 4, tempo: 72, order: ['A', 'B', 'A', 'B', 'B', 'C'] })
    const expected = ['A', 'B', 'A', 'B', 'B', 'C'].flatMap((name, visit) => sections.get(name)!
      .map((event, index, events) => ({ ...event, ticks: visit === 3 && index === events.length - 1 ? 9 : event.ticks })))
    const actual = unfoldScorePerformance(document).parts.get('score')!.melody.flatMap(bar => bar.events)
      .flatMap(event => event.kind === 'tuplet'
        ? event.pitches.map((pitch, index) => ({ pitch, ticks: Math.round(event.beats * 3 / event.pitches.length), tie: !!event.tie && index === event.pitches.length - 1 }))
        : [{ pitch: event.pitches[0] ?? '0', ticks: Math.round(event.beats * 3), tie: event.tie ?? false }])
    expect(actual).toEqual(expected)
    expect(compileScorePerformance(document).beats).toBe(232)
  })

  it('sings both verses, all three choruses and the complete final word', () => {
    const { lyricsByEvent } = deriveScoreInteraction(document)
    const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
    const text = compileScorePerformance(document).elements.filter(element => element.voice === 'score:melody')
      .flatMap(element => (byId.get(element.xmlId) ?? [])
        .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
        .map(lyric => lyric.text)).join('')
    const clean = (value: string) => value.replace(/[\s/；]/g, '')
    const [first, coda] = reference.lyrics[0]!.split('你依然')
    expect(text).toBe(clean(first! + reference.lyrics[1]! + reference.lyrics[2]! + '你依然' + coda!))
    expect(text.endsWith('你依然会是我心爱的姑娘')).toBe(true)
  })

  it('includes the score in the pop library and scorebook', () => {
    expect(categories.find(category => category.id === 'pop')!.files).toContain(file)
    expect(plan.entries.find(entry => entry.file === file)).toMatchObject({ title: document.title, section: 'pop' })
    expect(plan.sourceCount).toBe(plan.entries.length)
  })
})
