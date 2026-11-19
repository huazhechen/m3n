import { expect, it } from 'vitest'
import { parseM3NDocument } from './m3n-direct.js'
import { validateM3NDiagnostics } from './m3n-validate.js'
import { compileScorePerformance } from './performance.js'

const compile = (source: string) => compileScorePerformance(parseM3NDocument(source))
it('slides between two written notes in one attack, then reattacks the repeated target', () => {
  const source = '{2/4}\nN: (2e{gliss} 1e) 1e |||'
  expect(validateM3NDiagnostics(source)).toEqual([])
  const performance = compile(source)
  expect(performance.notes).toEqual([
    { start: 0, end: 1, pitch: 74, channel: 2, velocity: 90, pitchBends: [{ beat: 0, pitch: 74 }, { beat: .5, pitch: 72 }] },
    { start: 1, end: 2, pitch: 72, channel: 0, velocity: 90 },
  ])
  expect(performance.elements.map(element => [element.start, element.end])).toEqual([[0, .5], [.5, 1], [1, 2]])
})
it('resolves accidentals, key and octave changes and isolates simultaneous slides from bass chords', () => {
  const performance = compile('{key=F}{2/4}\nN: {8va}(3{gliss} 4#){/} 4 |||\nB: (7d{gliss} 1) [135:h] |||')
  const slides = performance.notes.filter(note => note.pitchBends)
  expect(slides.map(note => [note.channel, note.pitchBends])).toEqual([
    [2, [{ beat: 0, pitch: 81 }, { beat: .5, pitch: 83 }]],
    [3, [{ beat: 0, pitch: 64 }, { beat: .5, pitch: 65 }]],
  ])
  expect(performance.notes.filter(note => note.channel === 1).map(note => note.pitch)).toEqual([65, 69, 72])
})
it('continues through tied targets and supports a continuous chain of slides', () => {
  expect(compile('{3/4}\nN: 1{gliss} 2~ 2 |||').notes[0]).toMatchObject({ start: 0, end: 3, pitchBends: [{ beat: 0, pitch: 60 }, { beat: 1, pitch: 62 }] })
  expect(compile('{3/4}\nN: 1{gliss} 2{gliss} 3 |||').notes).toHaveLength(1)
  expect(compile('{3/4}\nN: 1{gliss} 2{gliss} 3 |||').notes[0]!.pitchBends).toEqual([{ beat: 0, pitch: 60 }, { beat: 1, pitch: 62 }, { beat: 2, pitch: 64 }])
})
it('preserves repeats and does not connect slides across navigation jumps', () => {
  const repeated = compile('{2/4}\nN: ||: 1{gliss} 2 :||')
  expect(repeated.notes.map(note => [note.start, note.end])).toEqual([[0, 2], [2, 4]])
  const jump = compile('{2/4}\nN: {segno}1 2 | 3 4{gliss} {ds} | 5 6 |||')
  expect(jump.notes.filter(note => note.pitchBends)).toHaveLength(1)
  expect(jump.notes.find(note => note.start === 3)!.pitchBends).toBeUndefined()
})
it.each(['1{gliss} 0', '1 2{gliss}', '[135:h]{gliss} 2', '1~{gliss} 1', '1{tr}{gliss} 2', '1{gliss} 2{ac(3)}'])('rejects unsupported slide endpoints: %s', music => {
  expect(validateM3NDiagnostics(`{2/4}\nN: ${music} |||`).some(diagnostic => diagnostic.severity === 'error')).toBe(true)
})
