import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import reference from './fixtures/ni-shi-wo-xin-ai-de-gu-niang-jtp123.json'
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

describe('User-approved vocal score with JTP123 reference', () => {
  it('preserves the approved corrections across AB repeats and the expanded ending', () => {
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(document).toMatchObject({ title: '你是我心爱的姑娘', key: 'Bb', meterCount: 4, meterUnit: 4, tempo: 72 })
    expect(document.order).toBeUndefined()
    expect(source).not.toMatch(/^===|\{order=/m)
    expect(source.match(/:\|\|/g)).toHaveLength(1)
    // Compare every triplet subdivision, independently of how sustained notes
    // and the two chorus pickups are grouped into printed measures.
    const expected = ['A', 'B', 'A', 'B', 'B', 'C'].flatMap((name, visit) => {
      const events = sections.get(name)!
      const ticks: string[] = events.flatMap((event, index) => {
        if (visit === 3 && index === events.length - 1) return Array(9).fill('6d')
        if (visit === 4 && index === events.length - 1) return [...Array(9).fill('6d'), '0', '0', '1']
        return Array(event.ticks).fill(event.pitch)
      })
      // User corrections override the website. Each tick is one triplet eighth.
      if (name === 'A') {
        ticks.fill('2', 18, 21) // 言
        for (const bar of [4, 8, 10, 14, 16]) {
          ticks.fill('6d', (bar - 1) * 12 + 3, (bar - 1) * 12 + 9)
        }
      } else if (name === 'B') {
        ticks[14] = '5d' // 我就在你身旁
        ticks[39] = '3' // 方 starts directly on 3 and sustains three beats.
        ticks[56] = '1e' // 模 / 天
        ticks[61] = '5d'
        ticks[62] = '5d' // 即使 / 直到
      }
      return ticks
    })
    const melody = unfoldScorePerformance(document).parts.get('score')!.melody
    const actual = melody.flatMap(bar => bar.events).flatMap(event => event.kind === 'tuplet'
      ? event.pitches.flatMap(pitch => Array(Math.round(event.beats * 3 / event.pitches.length)).fill(pitch))
      : Array(Math.round(event.beats * 3)).fill(event.pitches[0] ?? '0'))
    expect(actual).toEqual(expected)
    // Both verses share measure 3; +一 places a lyric on a tied note.
    const verseMeasure3 = melody.filter(bar => bar.events.length === 4
      && bar.events[0]?.kind === 'tuplet' && bar.events[0].pitches.join() === '2,2,1'
      && bar.events[3]?.kind === 'tuplet' && bar.events[3].pitches.join() === '2,1,6d')
    expect(verseMeasure3[0]!.events[1]).toMatchObject({ tupletTies: [0] })
    expect(verseMeasure3[2]!.events[1]).toMatchObject({ tupletTies: [0] })
    expect(compileScorePerformance(document).beats).toBe(232)
  })

  it('sings both verses, all three choruses and the complete final word', () => {
    const { lyricsByEvent } = deriveScoreInteraction(document)
    const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
    const text = compileScorePerformance(document).elements.filter(element => element.voice === 'score:melody')
      .flatMap(element => (byId.get(element.xmlId) ?? [])
        .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
        .map(lyric => lyric.text)).join('')
    expect(text).toBe(reference.lyrics.join(''))
    expect(text.endsWith('你依然会是我心爱的姑娘')).toBe(true)
  })

  it('includes the score in the pop library and scorebook', () => {
    expect(categories.find(category => category.id === 'pop')!.files).toContain(file)
    expect(plan.entries.find(entry => entry.file === file)).toMatchObject({ title: document.title, section: 'pop' })
    expect(plan.sourceCount).toBe(plan.entries.length)
  })
})
