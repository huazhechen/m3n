import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/you_raise_me_up_01.m3n?raw'
import plan from '../../config/scorebook/editorial-plan.json'
import categories from '../../config/scorebook/library-categories.json'

// Independently read from the replacement image supplied by the user:
// https://iknow-pic.cdn.bcebos.com/58ee3d6d55fbb2fb4fbb739f434a20a44723dcae
// Physical image bars, including the opening/final half-bars; degree 0 is a rest.
const reference = [
  '0:.5 5d:.5 5d:.5 1:.5',
  '3:1.5 1:.5 2:.75 1:.25 1:.5 6d:.5',
  '5d:.5 1:1.5 0:.5 7d:.5 1:.5 3:.5',
  '5:1.5 1:.5 6:.75 5:.25 5:.5 3:.5',
  '2:2 0:.5 5:.5 6:.5 7:.5',
  '1e:1.5 1e:.5 7:.5 6:.5 5:.5 4:.5',
  '5:1 1:1 0:.5 1:.5 5:.5 4:.5',
  '3:1.5 4:.5 3:.5 2:.5 1:.5 7d:.5',
  '1:2 0:.5 5:.5 6:.5 7:.5',
  '1e:1.5 1e:.5 7:.5 6:.5 5:.5 4:.5',
  '5:1 3:1 0:.5 5:.5 2e:.5 7:.5',
  '1e:1.5 1e:.5 7:.5 6:.5 5:.5 4:.5',
  '5:2 0:.5 5:.5 5:.5 7:.5',
  '1e:1.5 1e:.5 7:.5 6:.5 5:.5 4:.5',
  '5:1 1e:1 0:.5 1:.5 5:.5 4:.5',
  '3:1.5 4:.5 3:.5 2:.5 1:.5 7d:.5',
  '1:3 0:1',
  '0:1 0:1 0:.5 5:.5 6:.5 7:.5',
  '1e:1.5 1e:.5 7:.5 6:.5 5:.5 4:.5',
  '5:1 3:1 0:.5 5:.5 2e:.5 7:.5',
  '1e:1.5 1e:.5 7:.5 6:.5 5:.5 4:.5',
  '5:2 0:.5 5:.5 5:.5 4:.5',
  '3:1.5 3:.5 4:.5 3:.5 4:.5 6:.5',
  '5:1 1e:1 0:.5 1:.5 1:.5 2:.5',
  '3:1.5 4:.5 3:.5 2:.5 1:.5 7d:.5',
  '1:3 0:1',
  '0:1 0:1 0:.5 5d:.5 5d:.5 1:.5',
  '1:3 0:1',
  '0:1 0:1 0:.5 5d:.5 1:.5 2:.5',
  '3:1.5 4:.5 3:.5 2:.5 1:.5 7d:.5',
  '1:4',
  '1:2',
]
const alternateVerse = [
  '3:1.5 1:.5 2:.75 1:.25 3:.5 2:.5',
  '1:.5 5d:1.5 0:.5 7d:.5 1:.5 3:.5',
]
function events(bar: string, key: 'Eb' | 'E' | 'F') {
  return bar.split(' ').map(token => {
    const [degree, beats] = token.split(':')
    const value = Number(degree![0])
    const pitch = value === 0 ? null : { Eb: 63, E: 64, F: 65 }[key] + [0, 2, 4, 5, 7, 9, 11][value - 1]! + (degree!.endsWith('e') ? 12 : degree!.endsWith('d') ? -12 : 0)
    return [pitch, Number(beats)] as const
  })
}

it('matches the replacement image notes, credits, alternate verse, Eb/E/F keys and final tie', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect(document).toMatchObject({ title: 'You Raise Me Up', composer: 'Rolf Lovland', lyricist: 'Brendan Graham', key: 'Eb', meterCount: 4, meterUnit: 4, tempo: 60 })
  expect(source).not.toMatch(/===|\{order=|---V/)
  const written = [
    ...reference.slice(0, 27).map((bar, index) => events(bar, index < 17 ? 'Eb' : index < 26 ? 'E' : 'F')),
    ...reference.slice(1, 16).map((bar, index) => events(index < 2 ? alternateVerse[index]! : bar, 'F')),
    ...reference.slice(27).map(bar => events(bar, 'F')),
  ]
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  const pitches = resolveScorePitches(bars)
  const scale: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
  expect(bars.map(bar => bar.events.map(event => {
    const [name, octave, alteration] = pitches.get(event)?.[0]?.split(':') ?? []
    return [name ? 12 * (Number(octave) + 1) + scale[name]! + (alteration === 's' ? 1 : alteration === 'f' ? -1 : 0) : null, event.beats]
  }))).toEqual(written)
  expect(bars.flatMap((bar, index) => bar.events.flatMap((event, position) => event.tie ? [[index, position]] : []))).toEqual([[45, 0]])
  expect(source).not.toContain('{lg}')
  expect(source).toContain('{text=rit.}')
})

it('plays both verses, the E-major chorus, the F-major return and the coda exactly once', () => {
  const firstPass = reference.slice(0, 27).flatMap((bar, index) => events(bar, index < 17 ? 'Eb' : index < 26 ? 'E' : 'F'))
  const secondPass = reference.slice(1, 16).flatMap((bar, index) => events(index < 2 ? alternateVerse[index]! : bar, 'F'))
  const coda = reference.slice(27).flatMap(bar => events(bar, 'F'))
  const expected: number[][] = []
  let time = 0
  for (const [pitch, duration] of [...firstPass, ...secondPass, ...coda]) {
    if (pitch !== null) {
      // Only the last two notes in the image are tied: four plus two beats.
      if (time === 182) expected.at(-1)![1] = time + duration
      else expected.push([time, time + duration, pitch])
    }
    time += duration
  }
  const performance = compileScorePerformance(parseM3NDocument(source))
  expect(time).toBe(184)
  expect(performance.beats).toBe(time)
  expect(performance.notes).toHaveLength(220)
  expect(performance.notes.map(note => [note.start, note.end, note.pitch])).toEqual(expected)
  expect(expected.at(-1)).toEqual([178, 184, 65])
})

it('keeps both English verses and the correct chorus syllables without forced tied-target lyrics', () => {
  const document = parseM3NDocument(source)
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const lyrics = bars.map(bar => bar.events.flatMap(event => (lyricsByEvent.get(event) ?? []).filter(item => item.kind === 'text').map(item => item.text)))
  expect(lyrics.flat().join(' ')).not.toMatch(/\p{Script=Han}/u)
  expect(lyrics[0]).toEqual(['When', 'I', 'am'])
  expect(lyrics[26]).toEqual(['There', 'is', 'no'])
  expect(lyrics[27]).toEqual(['life,', 'no', 'life', 'with', 'out', 'its'])
  expect(lyrics[28]).toEqual(['hun', 'ger,', 'Each', 'rest', 'less'])
  expect(lyrics[41]).toEqual(['up,', 'To', 'more', 'than', 'I', 'can'])
  expect(source).not.toContain('+')
})

it('includes the corrected song once in both the contemporary pop library and the book', () => {
  expect(plan.sourceCount).toBe(plan.entries.length)
  expect(plan.entries.filter(entry => entry.file === 'you_raise_me_up_01.m3n')).toEqual([
    expect.objectContaining({ id: 'you_raise_me_up', title: 'You Raise Me Up', section: 'pop' }),
  ])
  expect(categories.filter(category => category.files.includes('you_raise_me_up_01.m3n')).map(category => category.id)).toEqual(['pop'])
})
