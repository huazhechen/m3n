import { describe, expect, it } from 'vitest'
import { continuityColor, continuityScore, harmonicaLayout, harmonicaScale, isScaleTone, movableDegree, optimizeHarmonicaPhrase, scalePitchLabel, type HarmonicaAction } from './harmonica-scales'

function phraseCost(actions: HarmonicaAction[]): number {
  let base = 0
  const switches: boolean[] = []
  for (let index = 1; index < actions.length; index++) {
    const from = actions[index - 1]!, to = actions[index]!
    const switching = from.breath !== to.breath
    switches.push(switching)
    base += Number(from.pressed !== to.pressed) + 2 * Math.abs(from.hole - to.hole) + 4 * Number(switching)
  }
  // A run of n consecutive breath changes adds 0, 2, 8, 18, 28, ...
  return base + switches.map(value => value ? 'x' : ' ').join('').split(' ').reduce((sum, run) =>
    sum + (run.length < 2 ? 0 : run.length === 2 ? 2 : run.length === 3 ? 8 : 18 + (run.length - 4) * 10), 0)
}

describe('12-hole C chromatic harmonica', () => {
  it('uses solo tuning and raises every reed a semitone with the slide', () => {
    const layout = harmonicaLayout()
    expect(layout).toHaveLength(48)
    expect(layout.filter(action => !action.pressed && action.breath === 'blow').map(action => action.midi))
      .toEqual([60, 64, 67, 72, 72, 76, 79, 84, 84, 88, 91, 96])
    expect(layout.filter(action => !action.pressed && action.breath === 'draw').map(action => action.midi))
      .toEqual([62, 65, 69, 71, 74, 77, 81, 83, 86, 89, 93, 95])
    for (const action of layout.filter(action => action.pressed)) {
      const open = layout.find(other => other.hole === action.hole && other.breath === action.breath && !other.pressed)!
      expect(action.midi).toBe(open.midi + 1)
    }
  })

  it('scores slide, distance and breath at weights 1, 2, 4 and uses a fixed color scale', () => {
    const start: HarmonicaAction = { hole: 1, breath: 'blow', pressed: false, midi: 60 }
    expect(continuityScore(start, start)).toBe(0)
    expect(continuityScore(start, { ...start, pressed: true })).toBe(1)
    expect(continuityScore(start, { ...start, hole: 3 })).toBe(4)
    expect(continuityScore(start, { ...start, breath: 'draw' })).toBe(4)
    expect(continuityScore(start, { ...start, hole: 3, breath: 'draw', pressed: true })).toBe(9)
    expect(continuityColor(0)).toBe('hsl(120 65% 38%)')
    expect(continuityColor(13)).toBe('hsl(0 65% 38%)')
    expect(continuityColor(20)).toBe(continuityColor(13))
  })

  it('maps movable-do semitones and octave dots relative to the selected tonic', () => {
    expect(movableDegree(60, 0)).toEqual({ degree: '1', octave: 0 })
    expect(movableDegree(72, 0)).toEqual({ degree: '1', octave: 1 })
    expect(movableDegree(60, 2)).toEqual({ degree: '♭7', octave: -1 })
    expect(movableDegree(66, 2)).toEqual({ degree: '3', octave: 0 })
    expect(movableDegree(97, 1)).toEqual({ degree: '1', octave: 3 })
    expect(scalePitchLabel(71, 6)).toBe('C♭5')
  })

  it('uses substitutes to avoid isolated breathing but charges unavoidable reversals', () => {
    const c = harmonicaScale(0), g = harmonicaScale(7)
    const eToF = c.transitions.find(edge => edge.from.midi === 64 && edge.to.midi === 65)!
    expect(eToF.from.breath).toBe('blow')
    expect(eToF.to.breath).toBe('blow')
    expect(eToF.to.pressed).toBe(true)
    expect(eToF.isolation).toBe(0)
    const fSharpToG = g.transitions.find(edge => edge.from.midi === 66 && edge.to.midi === 67)!
    expect(fSharpToG).toMatchObject({ base: 7, isolation: 6, score: 13 })
    const db = harmonicaScale(1)
    expect(db.transitions.some((edge, index) => index > 0 && JSON.stringify(db.transitions[index - 1]!.to) !== JSON.stringify(edge.from))).toBe(true)
    const easy = [0, 1, 3, 5, 6, 8, 10].map(key => harmonicaScale(key).total)
    const difficult = [2, 4, 7, 9, 11].map(key => harmonicaScale(key).total)
    expect(Math.max(...easy)).toBeLessThan(Math.min(...difficult))
  })


  it('finds the global optimum against exhaustive playable fingerings in every key', () => {
    const layout = harmonicaLayout()
    for (let key = 0; key < 12; key++) {
      const pitches = [0, 2, 4, 5, 7, 9, 11, 12].map(offset => 60 + key + offset)
      for (const phrase of [pitches, [...pitches].reverse()]) {
        let routes: HarmonicaAction[][] = [[]]
        for (const midi of phrase) routes = routes.flatMap(route => layout.filter(action => action.midi === midi).map(action => [...route, action]))
        const best = optimizeHarmonicaPhrase(phrase)
        expect(best.actions.map(action => action.midi)).toEqual(phrase)
        expect(best.total).toBe(Math.min(...routes.map(phraseCost)))
      }
    }
  })

  it('charges sustained alternation more heavily than separated isolated notes', () => {
    // Unique reeds: E4 (blow), F#4 (draw), G4 (blow), A4 (draw).
    const alternating = optimizeHarmonicaPhrase([64, 66, 67, 69])
    const isolated = optimizeHarmonicaPhrase([64, 66, 67, 67])
    const extras = (actions: HarmonicaAction[]) => phraseCost(actions) - actions.slice(1).reduce((sum, action, index) => sum + continuityScore(actions[index]!, action), 0)
    expect(extras(alternating.actions)).toBe(8)
    expect(extras(isolated.actions)).toBe(2)
    expect(optimizeHarmonicaPhrase([])).toEqual({ actions: [], total: 0 })
    expect(() => optimizeHarmonicaPhrase([59])).toThrow(RangeError)
  })

  it('independently minimizes each adjacent pair in both directions, allowing substitute breaks', () => {
    const layout = harmonicaLayout()
    for (let key = 0; key < 12; key++) {
      const scale = harmonicaScale(key)
      const pitches = [...new Set(layout.filter(action => isScaleTone(action.midi, key)).map(action => action.midi))].sort((a, b) => a - b)
      expect(scale.notes.map(note => note.midi)).toEqual(pitches)
      expect(scale.transitions).toHaveLength(pitches.length - 1)
      expect(scale.total).toBe(Math.round((scale.difficulty.ascending.total + scale.difficulty.descending.total) / 2))
      expect(scale.difficulty.ascending.total).toBe(scale.difficulty.descending.total)
      for (const route of [scale.difficulty.ascending, scale.difficulty.descending]) {
        expect(route.actions).toHaveLength(15)
        expect(Math.abs(route.actions.at(-1)!.midi - route.actions[0]!.midi)).toBe(24)
        expect(Math.min(...route.actions.map(action => action.midi))).toBe(60 + key)
        expect(route.total).toBe(phraseCost(route.actions))
        for (const action of route.actions) expect(layout).toContainEqual(action)
      }
      for (const [direction, edges] of [[1, scale.transitions], [-1, scale.descending]] as const) {
        for (const edge of edges) {
          expect(layout).toContainEqual(edge.from)
          expect(layout).toContainEqual(edge.to)
          const fromIndex = pitches.indexOf(edge.from.midi), toIndex = pitches.indexOf(edge.to.midi)
          const possible: number[] = []
          for (const from of layout.filter(action => action.midi === edge.from.midi)) {
            for (const to of layout.filter(action => action.midi === edge.to.midi)) {
              const before = layout.filter(action => action.midi === pitches[fromIndex - direction])
              const after = layout.filter(action => action.midi === pitches[toIndex + direction])
              const switchBreath = from.breath !== to.breath
              const source = switchBreath && before.length > 0 && before.every(action => action.breath !== from.breath)
              const target = switchBreath && after.length > 0 && after.every(action => action.breath !== to.breath)
              const extra = Number(source) + Number(target) + (source && target ? 4 : 0)
              possible.push(Number(from.pressed !== to.pressed) + 2 * Math.abs(from.hole - to.hole) + 4 * Number(switchBreath) + extra)
            }
          }
          expect(edge.score).toBe(Math.min(...possible))
        }
      }
    }
  })
})
