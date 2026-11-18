import { compileScorePerformance, formatM3N, parseM3NDocument, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/xiao_ye_qu_01.m3n?raw'
import categories from '../../scorebook/library-categories.json'
import plan from '../../scorebook/editorial-plan.json'

// ec00e30443f76fb2d5c44087611095f6.jpeg: one entry per printed bar,
// grouped by the ten image rows. Rn denotes an n-bar rest.
const rows = [
  'R4 / 3 4 3 6 3 / 2 3 2 6 2 0 / 3 2 2 1 7d / 1 0 / R2 / 3 4 3 1e 3',
  '2 3 2 7d 6d / 5 4 4 3 2 / 3 0 / R2 / 3 5# 1e 7 / 6 3 1e 6d',
  '4 3 4 6 4 / 3 / 2 1# 2 4 2 / 1 / 3 5# 1e 7 / 6 3 1#e 6d',
  '4 3# 4 6 4 / 3 / 7 6# 7 2e 5# / 6 / R8 / 3 4 3 6 3',
  '2 3 2 6 2 0 / 3 2 2 1 7d / 1 0 / R2 / 3 4 3 1e 3 / 3 4 3 7d 6d',
  '5 4 4 3 2 / 3 0 / R2 / 3 5# 1e 7 / 6 3 1e 6d / 4 3 4 6 4',
  '3 / 2 1# 2 4 2 / 1 / 3 5# 1e 7 / 6 3 1#e 6d / 4 3# 4 6 4',
  '3 / 7 6# 7 2e 5# / 6 / 3 3 5# 5 7 7 / 6 5# 0 / 3 5# 7 6',
  '5# 0 / 1#e 7 7 6 5# / 4 5# 6 4 0 / R2 / 4 3# 4 6 4 / 2',
  '7 6# 7 2e 5# / 6 / 6 0 6 / 4b / 3 / 1# / R5 / 0 0 0',
]

it('matches every printed pitch, rest and three-beat bar in the uploaded Serenade', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(formatM3N(source)).toBe(source)
  const document = parseM3NDocument(source)
  expect([document.title, document.key, document.meterCount, document.meterUnit, document.tempo])
    .toEqual(['小夜曲', 'F', 3, 4, 80])
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length || bar.multiRest)
  expect(bars.map(bar => bar.multiRest ? `R${bar.multiRest}` : bar.events.flatMap(event =>
    event.kind === 'rest' ? ['0'] : event.pitches).join(' ')))
    .toEqual(rows.flatMap(row => row.split(' / ')))
  for (const bar of bars.filter(bar => !bar.multiRest)) {
    expect(bar.events.reduce((sum, event) => sum + event.beats, 0)).toBeCloseTo(3)
  }
  expect(compileScorePerformance(document).beats).toBe(246)
  expect(bars[46]!.events.map(event => event.beats)).toEqual([.75, .25, .75, .25, .75, .25])
  expect(bars[48]!.events.map(event => event.beats)).toEqual([1.5, .5, .75, .25])
  expect(bars[56]!.events[0]!.tie).toBe(true)
})

it('retains all seven grace pairs on the first tuplet note and plays them within its beat', () => {
  const document = parseM3NDocument(source)
  const events = document.parts.get('score')!.melody.flatMap(bar => bar.events)
  expect(events.flatMap(event => event.postfixes)).toEqual([
    'ac(4 5)', 'ac(2 3)', 'ac(4# 5#)', 'ac(4 5)', 'ac(2 3)', 'ac(4# 5#)', 'ac(4# 5#)',
  ])
  const shortSource = '{key=F}{3/4}\nN: {lg}([4 3 4:2]{ac(4 5)}){/} 6. (4) |||'
  expect(validateM3NDiagnostics(shortSource)).toEqual([])
  const performance = compileScorePerformance(parseM3NDocument(shortSource))
  expect(performance.notes.slice(0, 5).map(note => note.pitch)).toEqual([70, 72, 70, 69, 70])
  expect(performance.notes.slice(0, 3).map(note => note.start)).toEqual([0, 1 / 16, 1 / 8])
  expect(performance.notes[2]!.end).toBeCloseTo(1 / 3)
  expect(performance.notes[3]!.start).toBeCloseTo(1 / 3)
  expect(performance.beats).toBe(3)
  expect(validateM3NDiagnostics('{3/4}\nN: ([4 3 4:2]){tr} 6 4 |||').some(item => item.severity === 'error')).toBe(true)
})

it('places Serenade in the final chapter with the same web and book ordering', () => {
  const category = categories.at(-1)!
  expect(category.id).toBe('instrumental')
  expect(category.files[2]).toBe('xiao_ye_qu_01.m3n')
  expect(plan.entries.filter(entry => entry.section === category.id).map(entry => entry.file)).toEqual(category.files)
  expect(plan.sourceCount).toBe(plan.entries.length)
})
