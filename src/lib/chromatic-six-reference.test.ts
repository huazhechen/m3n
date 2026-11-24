import { compileScorePerformance, formatM3N, parseM3NDocument, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import plan from '../../config/scorebook/editorial-plan.json'
import categories from '../../config/scorebook/library-categories.json'
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
  // Compare the independent principal-note reference; ornament playback has its own tests.
  const melody = reference.slug === 'cai_yun_zhui_yue'
    ? parseM3NDocument(source.replaceAll('{prall}', '')) : document
  const performance = compileScorePerformance(melody)
  expect(performance.beats).toBe(reference.beats)
  // The reviewed Cai Yun Zhui Yue arrangement omits the two upstream grace notes.
  const events = reference.slug === 'cai_yun_zhui_yue'
    ? reference.events.filter(event => !event[3])
    : reference.events
  expect(performance.notes).toHaveLength(events.length)
  events.forEach(([start, end, pitch], index) => {
    const actual = performance.notes[index]!
    const expectedStart = start as number, expectedEnd = end as number
    expect(actual.pitch, `attack ${index + 1}`).toBe(pitch)
    expect(actual.start, `attack ${index + 1} onset`).toBeCloseTo(expectedStart, 6)
    expect(actual.end, `attack ${index + 1} release`).toBeCloseTo(expectedEnd, 6)
  })
  expect(plan.entries.filter(entry => entry.file === file)).toHaveLength(1)
  expect(categories.flatMap(category => category.files).filter(name => name === file)).toHaveLength(1)
})
