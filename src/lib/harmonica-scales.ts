export type HarmonicaAction = { hole: number; breath: 'blow' | 'draw'; pressed: boolean; midi: number }
export type ScaleNote = { name: string; midi: number; actions: HarmonicaAction[] }
export type ScaleTransition = { from: HarmonicaAction; to: HarmonicaAction; base: number; isolation: number; score: number }

export const HARMONICA_KEYS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'] as const
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const NATURALS = [0, 2, 4, 5, 7, 9, 11]
const MAJOR = [0, 2, 4, 5, 7, 9, 11]

/** 12-hole C solo tuning: C E G C / D F A B, repeated three times. */
export function harmonicaLayout(): HarmonicaAction[] {
  return Array.from({ length: 12 }, (_, index) => {
    const block = 60 + Math.floor(index / 4) * 12
    return (['blow', 'draw'] as const).flatMap(breath => [false, true].map(pressed => ({
      hole: index + 1, breath, pressed,
      midi: block + (breath === 'blow' ? [0, 4, 7, 12] : [2, 5, 9, 11])[index % 4]! + Number(pressed),
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

/** Switching the slide costs 1, each hole moved costs 2, changing breath costs 4. */
export function continuityScore(from: HarmonicaAction, to: HarmonicaAction): number {
  return Number(from.pressed !== to.pressed) + Math.abs(from.hole - to.hole) * 2 + Number(from.breath !== to.breath) * 4
}

export const ISOLATED_BREATH_PENALTY = 4
export const MAX_COLOR_SCORE = 11

/** Two neighboring isolated notes can add 4 to an ordinary 7-point change. */
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

/** Find each adjacent pair independently. The same pitch may use different
 * substitutes for incoming and outgoing edges; the diagram permits this break.
 * Context adds half of an isolated-breath penalty to each adjacent edge only
 * when the outer neighbor has no same-breath substitute to avoid the reversal.
 */
export function harmonicaScale(key: number): { notes: ScaleNote[]; transitions: ScaleTransition[]; descending: ScaleTransition[]; total: number } {
  const layout = harmonicaLayout()
  const pitches = [...new Set(layout.filter(action => isScaleTone(action.midi, key)).map(action => action.midi))].sort((a, b) => a - b)
  const notes = pitches.map(midi => ({ name: scalePitchLabel(midi, key), midi, actions: layout.filter(action => action.midi === midi) }))
  const connect = (fromIndex: number, toIndex: number, direction: number): ScaleTransition => {
    const before = notes[fromIndex - direction]?.actions
    const after = notes[toIndex + direction]?.actions
    const choices = notes[fromIndex]!.actions.flatMap(from => notes[toIndex]!.actions.map(to => {
      const switching = from.breath !== to.breath
      const sourceIsolated = switching && before !== undefined && before.every(action => action.breath !== from.breath)
      const targetIsolated = switching && after !== undefined && after.every(action => action.breath !== to.breath)
      const base = continuityScore(from, to)
      const isolation = (Number(sourceIsolated) + Number(targetIsolated)) * ISOLATED_BREATH_PENALTY / 2
      return { from, to, base, isolation, score: base + isolation }
    }))
    return choices.sort((a, b) => a.score - b.score
      || Number(a.from.pressed) + Number(a.to.pressed) - Number(b.from.pressed) - Number(b.to.pressed)
      || a.from.hole - b.from.hole || a.to.hole - b.to.hole)[0]!
  }
  const transitions = notes.slice(1).map((_, index) => connect(index, index + 1, 1))
  const descending = notes.slice(1).map((_, index) => connect(notes.length - 1 - index, notes.length - 2 - index, -1))
  return { notes, transitions, descending, total: transitions.reduce((sum, edge) => sum + edge.score, 0) }
}
