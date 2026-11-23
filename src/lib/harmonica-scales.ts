export type HarmonicaAction = { hole: number; breath: 'blow' | 'draw'; pressed: boolean; midi: number }
export type ScaleNote = { name: string; midi: number; actions: HarmonicaAction[] }
export type ScaleTransition = { from: HarmonicaAction; to: HarmonicaAction; base: number; isolation: number; score: number }

export const HARMONICA_KEYS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'] as const
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const NATURALS = [0, 2, 4, 5, 7, 9, 11]
const MAJOR = [0, 2, 4, 5, 7, 9, 11]

/** 12-hole C solo tuning; C6 replaces each fourth blow C with A. */
export function harmonicaLayout(c6 = false): HarmonicaAction[] {
  return Array.from({ length: 12 }, (_, index) => {
    const block = 60 + Math.floor(index / 4) * 12
    return (['blow', 'draw'] as const).flatMap(breath => [false, true].map(pressed => ({
      hole: index + 1, breath, pressed,
      midi: block + (breath === 'blow' ? [0, 4, 7, c6 ? 9 : 12] : [2, 5, 9, 11])[index % 4]! + Number(pressed),
    })))
  }).flat()
}

export function actionLabel(action: HarmonicaAction): string {
  return `${action.hole}孔${action.breath === 'blow' ? '吹' : '吸'}·${action.pressed ? '按键' : '松键'}`
}

/** Scientific pitch notation: C4 is middle C, each C starts a new octave. */
export function pitchLabel(midi: number): string {
  return `${HARMONICA_KEYS[midi % 12]}${Math.floor(midi / 12) - 1}`
}

export function scalePitchLabel(midi: number, key: number): string {
  const degree = MAJOR.indexOf((midi % 12 - key + 12) % 12)
  if (degree < 0) return pitchLabel(midi)
  const letter = (LETTERS.indexOf(HARMONICA_KEYS[key]![0]!) + degree) % 7
  let accidental = (midi % 12 - NATURALS[letter]! + 12) % 12
  if (accidental > 6) accidental -= 12
  const name = LETTERS[letter]! + (accidental > 0 ? '♯'.repeat(accidental) : '♭'.repeat(-accidental))
  const octave = Math.floor((midi - NATURALS[letter]! - accidental) / 12) - 1
  return `${name}${octave}`
}

export function isScaleTone(midi: number, key: number): boolean {
  return MAJOR.includes((midi % 12 - key + 12) % 12)
}

/** Slide change and one-hole moves cost 1; wider jumps grow quadratically. */
export function continuityScore(from: HarmonicaAction, to: HarmonicaAction): number {
  return Number(from.pressed !== to.pressed) + (from.hole - to.hole) ** 2 + Number(from.breath !== to.breath) * 4
}

export const ISOLATED_BREATH_PENALTY = 2
export const MAX_COLOR_SCORE = 13

/** A four-note alternating passage adds 6 to a typical 7-point change. */
export function continuityColor(score: number): string {
  return `hsl(${120 * (1 - Math.min(MAX_COLOR_SCORE, Math.max(0, score)) / MAX_COLOR_SCORE)} 65% 38%)`
}

export function movableDegree(midi: number, key: number): { degree: string; octave: number } {
  const distance = midi - (60 + key)
  const semitone = ((distance % 12) + 12) % 12
  return { degree: ['1', '♯1', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'][semitone]!, octave: Math.floor(distance / 12) }
}

export function degreeLabel(midi: number, key: number): string {
  const { degree, octave } = movableDegree(midi, key)
  return `${degree}${octave === 0 ? '' : `（${octave > 0 ? '高' : '低'}${Math.abs(octave)}个八度）`}`
}

/** Additional cost at each step of an uninterrupted run of breath changes.
 * One isolated note is a small bump; sustained alternation is much harder.
 */
function alternationPenalty(run: number): number {
  return run < 2 ? 0 : Math.min(10, (run - 1) * 4 - 2)
}

/** Choose one playable action per note, retaining breath-run history in the DP.
 * Capping the history at four is exact because the surcharge saturates there.
 */
export function optimizeHarmonicaPhrase(pitches: number[], c6 = false): { actions: HarmonicaAction[]; total: number } {
  const layout = harmonicaLayout(c6)
  type State = { actions: HarmonicaAction[]; total: number; run: number; presses: number }
  let states: State[] = [{ actions: [], total: 0, run: 0, presses: 0 }]
  for (const midi of pitches) {
    const choices = layout.filter(action => action.midi === midi)
    if (!choices.length) throw new RangeError(`Pitch outside harmonica range: ${midi}`)
    const next = new Map<string, State>()
    for (const state of states) for (const action of choices) {
      const previous = state.actions.at(-1)
      const run = previous && previous.breath !== action.breath ? Math.min(4, state.run + 1) : 0
      const total = state.total + (previous ? continuityScore(previous, action) + alternationPenalty(run) : 0)
      const candidate = { actions: [...state.actions, action], total, run, presses: state.presses + Number(action.pressed) }
      const id = `${action.hole}-${action.breath}-${action.pressed}-${run}`
      const best = next.get(id)
      if (!best || total < best.total || (total === best.total && candidate.presses < best.presses)) next.set(id, candidate)
    }
    states = [...next.values()]
  }
  const best = states.sort((a, b) => a.total - b.total || a.presses - b.presses)[0]!
  return { actions: best.actions, total: best.total }
}

/** Diagram connections remain local and may use disconnected substitutes.
 * Difficulty combines the worst five-note phrase with the full-scale average.
 */
export function harmonicaScale(key: number, c6 = false): {
  notes: ScaleNote[]; transitions: ScaleTransition[]; descending: ScaleTransition[]; total: number
  diagramTransitions: ScaleTransition[]; diagramDescending: ScaleTransition[]
  difficulty: {
    ascending: ReturnType<typeof optimizeHarmonicaPhrase>; descending: ReturnType<typeof optimizeHarmonicaPhrase>
    windows: { ascending: ReturnType<typeof optimizeHarmonicaPhrase>; descending: ReturnType<typeof optimizeHarmonicaPhrase> }[]
    bottleneck: number
  }
} {
  const layout = harmonicaLayout(c6)
  const pitches = [...new Set(layout.filter(action => isScaleTone(action.midi, key)).map(action => action.midi))].sort((a, b) => a - b)
  const notes = pitches.map(midi => ({ name: scalePitchLabel(midi, key), midi, actions: layout.filter(action => action.midi === midi) }))
  const choicesFor = (fromIndex: number, toIndex: number, direction: number): ScaleTransition[] => {
    const before = notes[fromIndex - direction]?.actions
    const after = notes[toIndex + direction]?.actions
    const choices = notes[fromIndex]!.actions.flatMap(from => notes[toIndex]!.actions.map(to => {
      const switching = from.breath !== to.breath
      const sourceIsolated = switching && before !== undefined && before.every(action => action.breath !== from.breath)
      const targetIsolated = switching && after !== undefined && after.every(action => action.breath !== to.breath)
      const base = continuityScore(from, to)
      const isolation = (Number(sourceIsolated) + Number(targetIsolated)) * ISOLATED_BREATH_PENALTY / 2
        + (sourceIsolated && targetIsolated ? 4 : 0)
      return { from, to, base, isolation, score: base + isolation }
    }))
    return choices.sort((a, b) => a.score - b.score
      || Number(a.from.pressed) + Number(a.to.pressed) - Number(b.from.pressed) - Number(b.to.pressed)
      || a.from.hole - b.from.hole || a.to.hole - b.to.hole)
  }
  const ascendingChoices = notes.slice(1).map((_, index) => choicesFor(index, index + 1, 1))
  const descendingChoices = notes.slice(1).map((_, index) => choicesFor(notes.length - 1 - index, notes.length - 2 - index, -1))
  const transitions = ascendingChoices.map(choices => choices[0]!)
  const descending = descendingChoices.map(choices => choices[0]!)
  // Keep the primary connection, then only add the nearest same-breath
  // alternative in each half. Do not fan alternate reeds across the instrument.
  const branches = (choices: ScaleTransition[]) => {
    const selected = new Set([choices[0]!])
    for (const breath of ['blow', 'draw'] as const) {
      const sameHalf = choices.find(edge => edge.from.breath === breath && edge.to.breath === breath)
      if (sameHalf) selected.add(sameHalf)
    }
    return choices.filter(edge => selected.has(edge))
  }
  const diagramTransitions = ascendingChoices.flatMap(branches)
  const diagramDescending = descendingChoices.flatMap(branches)
  const comparisonPitches = Array.from({ length: 15 }, (_, index) => 60 + key + Math.floor(index / 7) * 12 + MAJOR[index % 7]!)
  // Start at every scale degree, including phrases crossing the tonic.
  // Five notes expose the four consecutive breath changes in G's D E F# G A.
  const windows = MAJOR.map((_, start) => {
    const phrase = Array.from({ length: 5 }, (_, index) => {
      const degree = start + index
      return 60 + key + Math.floor(degree / 7) * 12 + MAJOR[degree % 7]!
    })
    return {
      ascending: optimizeHarmonicaPhrase(phrase, c6),
      descending: optimizeHarmonicaPhrase([...phrase].reverse(), c6),
    }
  })
  const difficulty = {
    ascending: optimizeHarmonicaPhrase(comparisonPitches, c6),
    descending: optimizeHarmonicaPhrase([...comparisonPitches].reverse(), c6),
    windows,
    bottleneck: Math.max(...windows.flatMap(window => [window.ascending.total, window.descending.total])),
  }
  const average = (difficulty.ascending.total + difficulty.descending.total) / 2
  // Express both terms as a 14-transition equivalent: 75% worst short-phrase
  // density and 25% whole-scale density. Easy passages cannot erase a bottleneck.
  const total = Math.round(.75 * difficulty.bottleneck / 4 * 14 + .25 * average)
  return { notes, transitions, descending, diagramTransitions, diagramDescending, difficulty, total }
}
