import { compileScorePerformance, formatM3N, parseM3NDocument, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import plan from '../../scorebook/editorial-plan.json'
import categories from '../../scorebook/library-categories.json'
import references from './fixtures/chromatic-six-references.json'

const sources = import.meta.glob<string>('../scores/*.m3n', { eager: true, query: '?raw', import: 'default' })

it.each(references.scores)('preserves the independent reference melody and playback route: $slug', reference => {
  const file = `${reference.slug}_01.m3n`
  const source = sources[`../scores/${file}`]!
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(formatM3N(source)).toBe(source)
  const document = parseM3NDocument(source)
  expect(document.order).toBeUndefined()
  expect(document.sections ?? []).toEqual([])
  const performance = compileScorePerformance(document)
  expect(performance.beats).toBe(reference.beats)
  expect(performance.notes).toHaveLength(reference.events.length)
  reference.events.forEach(([start, end, pitch, grace], index) => {
    const actual = performance.notes[index]!
    let expectedStart = start as number, expectedEnd = end as number
    // The upstream grace anticipates the beat; M3N steals 1/16 beat from its host.
    if (grace) {
      expectedStart = end as number
      expectedEnd = expectedStart + 1 / 16
    } else if (reference.events[index - 1]?.[3]) expectedStart += 1 / 16
    expect(actual.pitch, `attack ${index + 1}`).toBe(pitch)
    expect(actual.start, `attack ${index + 1} onset`).toBeCloseTo(expectedStart, 6)
    expect(actual.end, `attack ${index + 1} release`).toBeCloseTo(expectedEnd, 6)
  })
  expect(plan.entries.filter(entry => entry.file === file)).toHaveLength(1)
  expect(categories.flatMap(category => category.files).filter(name => name === file)).toHaveLength(1)
})
