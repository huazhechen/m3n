import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Accidental,
  Formatter,
  Renderer,
  Stave,
  StaveNote,
  Tuplet,
  Voice,
} from 'vexflow'
import type { GroupEvent, M3NDocument, NoteEvent, ScoreState } from '../lib/m3n'

type MeasureUnit =
  | {
      kind: 'note'
      event: NoteEvent
    }
  | {
      kind: 'chord'
      event: GroupEvent
    }
  | {
      kind: 'tuplet'
      event: GroupEvent
    }

type MeasureData = {
  id: string
  state: ScoreState
  units: MeasureUnit[]
}

const scaleSemitones = [0, 2, 4, 5, 7, 9, 11]
const pitchClassMap: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
}

function pow(base: number, exponent: number) {
  return exponent >= 0 ? base ** exponent : 1 / (base ** Math.abs(exponent))
}

function parseMeasures(document: M3NDocument) {
  return document.lines
    .map((line, lineIndex) => {
      const measures: MeasureData[] = []
      let units: MeasureUnit[] = []
      let measureIndex = 0
      let currentState: ScoreState | null = null

      const flush = () => {
        if (!currentState) {
          return
        }
        measures.push({
          id: `${line.id}-measure-${measureIndex++}`,
          state: currentState,
          units,
        })
        units = []
      }

      line.events.forEach((event) => {
        if (event.kind === 'note') {
          currentState ??= event.state
          units.push({ kind: 'note', event })
          return
        }

        if (event.kind === 'group') {
          currentState ??= event.state
          units.push({
            kind: event.mode === 'c' ? 'chord' : 'tuplet',
            event,
          })
          return
        }

        if (event.kind === 'barline') {
          flush()
        }
      })

      flush()

      return {
        id: `staff-line-${lineIndex}`,
        measures: measures.filter((measure) => measure.units.length > 0),
      }
    })
    .filter((line) => line.measures.length > 0)
}

function parsePitchToken(token: string) {
  const match = /^([1-7])([#b=]*)([ed]*)$/.exec(token)
  if (!match) {
    return null
  }

  const degree = Number(match[1])
  const accidentalText = match[2]
  const octaveText = match[3]
  const octaveShift =
    (octaveText.match(/e/g)?.length ?? 0) - (octaveText.match(/d/g)?.length ?? 0)

  let accidental = 0
  if (accidentalText.includes('=')) {
    accidentalText
      .slice(accidentalText.lastIndexOf('=') + 1)
      .split('')
      .forEach((char) => {
        accidental += char === '#' ? 1 : char === 'b' ? -1 : 0
      })
  } else {
    accidentalText.split('').forEach((char) => {
      accidental += char === '#' ? 1 : char === 'b' ? -1 : 0
    })
  }

  return {
    degree,
    accidentalText,
    octaveShift,
    explicitAccidental: accidentalText.length > 0,
    accidental,
  }
}

function tonicMidi(key: string) {
  const value = pitchClassMap[key] ?? 0
  return 60 + value
}

function midiToVexKey(midi: number) {
  const classes = ['c', 'c#', 'd', 'eb', 'e', 'f', 'f#', 'g', 'ab', 'a', 'bb', 'b']
  const pitchClass = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  return `${classes[pitchClass]}/${octave}`
}

function noteDuration(beatValue: number, depth: number, carets = 0, dots = 0) {
  const baseWhole = pow(2, carets - depth) / beatValue
  const denominator = Math.round(1 / baseWhole)
  const durationMap: Record<number, string> = {
    1: 'w',
    2: 'h',
    4: 'q',
    8: '8',
    16: '16',
    32: '32',
    64: '64',
  }

  return {
    duration: durationMap[denominator] ?? '8',
    dots,
  }
}

function applyAccidental(
  token: string,
  measureAccidentals: Map<number, number>,
) {
  const parsed = parsePitchToken(token)
  if (!parsed) {
    return null
  }

  if (parsed.explicitAccidental) {
    measureAccidentals.set(parsed.degree, parsed.accidental)
  }

  const accidental = parsed.explicitAccidental
    ? parsed.accidental
    : (measureAccidentals.get(parsed.degree) ?? 0)

  return {
    degree: parsed.degree,
    accidental,
    octaveShift: parsed.octaveShift,
  }
}

function tokenToKey(
  token: string,
  state: ScoreState,
  measureAccidentals: Map<number, number>,
) {
  const parsed = applyAccidental(token, measureAccidentals)
  if (!parsed) {
    return null
  }

  const midi =
    tonicMidi(state.key) +
    scaleSemitones[parsed.degree - 1] +
    parsed.accidental +
    parsed.octaveShift * 12

  return midiToVexKey(midi)
}

function addRenderedAccidentals(staveNote: StaveNote, keys: string[]) {
  keys.forEach((key, index) => {
    const match = /([a-g])(bb|b|##|#)?\/\d/.exec(key)
    const accidental = match?.[2]
    if (accidental) {
      staveNote.addModifier(new Accidental(accidental), index)
    }
  })
}

function createSingleNote(event: NoteEvent, measureAccidentals: Map<number, number>) {
  const durationSpec = noteDuration(
    event.state.beatValue,
    event.depth,
    event.carets,
    event.dots,
  )

  if (event.value === '0' || event.value === 'X') {
    return new StaveNote({
      clef: 'treble',
      keys: ['b/4'],
      duration: `${durationSpec.duration}r`,
      dots: durationSpec.dots,
    })
  }

  const key = tokenToKey(event.value, event.state, measureAccidentals) ?? 'b/4'
  const staveNote = new StaveNote({
    clef: 'treble',
    keys: [key],
    duration: durationSpec.duration,
    dots: durationSpec.dots,
  })
  addRenderedAccidentals(staveNote, [key])
  return staveNote
}

function createChord(event: GroupEvent, measureAccidentals: Map<number, number>) {
  const durationSpec = noteDuration(event.state.beatValue, event.depth)
  const keys = event.notes
    .map((token) => tokenToKey(token, event.state, measureAccidentals))
    .filter((item): item is string => Boolean(item))

  const staveNote = new StaveNote({
    clef: 'treble',
    keys: keys.length > 0 ? keys : ['b/4'],
    duration: durationSpec.duration,
    dots: durationSpec.dots,
  })
  addRenderedAccidentals(staveNote, keys)
  return staveNote
}

function createTuplet(
  event: GroupEvent,
  measureAccidentals: Map<number, number>,
) {
  const durationSpec = noteDuration(event.state.beatValue, event.depth)
  const notes = event.notes.map((token) => {
    const key = tokenToKey(token, event.state, measureAccidentals) ?? 'b/4'
    const staveNote = new StaveNote({
      clef: 'treble',
      keys: [key],
      duration: durationSpec.duration,
      dots: durationSpec.dots,
    })
    addRenderedAccidentals(staveNote, [key])
    return staveNote
  })

  const occupied = Number(event.value)
  return {
    notes,
    tuplet: new Tuplet(notes, {
      numNotes: notes.length,
      notesOccupied: Number.isFinite(occupied) && occupied > 0 ? occupied : notes.length,
    }),
  }
}

type StaffRendererProps = {
  document: M3NDocument
  compact?: boolean
}

export function StaffRenderer({ document, compact = false }: StaffRendererProps) {
  const lines = useMemo(() => parseMeasures(document), [document])
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(960)

  useEffect(() => {
    const element = hostRef.current
    if (!element) {
      return
    }

    const update = () => {
      setWidth(Math.max(320, Math.floor(element.clientWidth)))
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const element = hostRef.current
    if (!element) {
      return
    }

    element.replaceChildren()

    if (lines.length === 0) {
      return
    }

    const height = Math.max(180, lines.length * 180)
    const renderer = new Renderer(element, Renderer.Backends.SVG)
    renderer.resize(width, height)
    const context = renderer.getContext()
    context.setFont('Arial', 10)
    context.setFillStyle('#f5eedf')
    context.setStrokeStyle('#f5eedf')

    let y = 20
    lines.forEach((line, lineIndex) => {
      const measureWidth = Math.max(170, Math.floor((width - 32) / line.measures.length))
      let x = 10

      line.measures.forEach((measure, measureIndex) => {
        const stave = new Stave(x, y, measureWidth)

        if (lineIndex === 0 && measureIndex === 0) {
          stave.addClef('treble')
          stave.addTimeSignature(`${measure.state.beats}/${measure.state.beatValue}`)
        }

        stave.setContext(context).draw()

        const voice = new Voice({
          numBeats: measure.state.beats,
          beatValue: measure.state.beatValue,
        }).setMode(Voice.Mode.SOFT)

        const tickables: StaveNote[] = []
        const tuplets: Tuplet[] = []
        const measureAccidentals = new Map<number, number>()

        measure.units.forEach((unit) => {
          if (unit.kind === 'note') {
            tickables.push(createSingleNote(unit.event, measureAccidentals))
            return
          }

          if (unit.kind === 'chord') {
            tickables.push(createChord(unit.event, measureAccidentals))
            return
          }

          const tupletBundle = createTuplet(unit.event, measureAccidentals)
          tickables.push(...tupletBundle.notes)
          tuplets.push(tupletBundle.tuplet)
        })

        if (tickables.length > 0) {
          voice.addTickables(tickables)
          new Formatter().joinVoices([voice]).format([voice], measureWidth - 24)
          voice.draw(context, stave)
          tuplets.forEach((tuplet) => tuplet.setContext(context).draw())
        }

        x += measureWidth
      })

      y += 170
    })
  }, [lines, width])

  return (
    <section className={`staff-shell${compact ? ' compact' : ''}`}>
      {compact ? null : <div className="pane-label">五线谱渲染</div>}
      {lines.length === 0 ? (
        <div className="staff-empty">输入 M3N 代码后，这里会渲染成五线谱。</div>
      ) : null}
      <div ref={hostRef} className="staff-canvas" />
      {document.diagnostics.length > 0 ? (
        <div className="staff-warning">存在解析诊断时，五线谱可能只会渲染已识别的部分。</div>
      ) : null}
    </section>
  )
}
