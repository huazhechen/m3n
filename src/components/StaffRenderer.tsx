import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Accidental,
  BarlineType,
  Beam,
  Formatter,
  Renderer,
  Stave,
  StaveNote,
  StaveTie,
  Tuplet,
  Voice,
} from 'vexflow'
import type { GroupEvent, M3NDocument, NoteEvent, ScoreState } from '../lib/m3n'

type MeasureUnit =
  | { kind: 'note'; event: NoteEvent }
  | { kind: 'chord'; event: GroupEvent }
  | { kind: 'tuplet'; event: GroupEvent }

type MeasureData = {
  id: string
  state: ScoreState
  startBarType: BarlineType
  endBarType: BarlineType
  units: MeasureUnit[]
}

type StaffLineData = {
  id: string
  measures: MeasureData[]
}

type PlaybackEvent = {
  id: string
  noteIds: string[]
  durationSeconds: number
  frequencies: number[]
}

type PitchInfo = {
  key: string
  midi: number
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
const naturalPitchClasses: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}
const noteLetters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const

function dotMultiplier(dots: number) {
  let factor = 1
  let addition = 0.5

  for (let index = 0; index < dots; index += 1) {
    factor += addition
    addition /= 2
  }

  return factor
}

function getTempoBpm(state: ScoreState) {
  const match = /(\d+(?:\.\d+)?)/.exec(state.tempo ?? '')
  return match ? Number(match[1]) : 96
}

function getBaseWholeDuration(state: ScoreState, depth: number, carets = 0) {
  return 2 ** (carets - depth) / state.beatValue
}

function getWholeDuration(state: ScoreState, depth: number, carets = 0, dots = 0) {
  return getBaseWholeDuration(state, depth, carets) * dotMultiplier(dots)
}

function getQuarterDurationSeconds(state: ScoreState, wholeDuration: number) {
  return wholeDuration * 4 * (60 / getTempoBpm(state))
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
    accidental,
    explicitAccidental: accidentalText.length > 0,
    octaveShift,
  }
}

function tonicMidi(key: string) {
  const value = pitchClassMap[key] ?? 0
  return 60 + value
}

function parseKeyInfo(key: string) {
  const match = /^([A-G])([#b]*)$/.exec(key)
  const letter = match?.[1] ?? 'C'
  const accidentalText = match?.[2] ?? ''
  let accidental = 0

  accidentalText.split('').forEach((char) => {
    accidental += char === '#' ? 1 : char === 'b' ? -1 : 0
  })

  return {
    letter,
    accidental,
    pitchClass: pitchClassMap[key] ?? 0,
  }
}

function accidentalToText(accidental: number) {
  if (accidental === 0) {
    return ''
  }

  return accidental > 0 ? '#'.repeat(accidental) : 'b'.repeat(Math.abs(accidental))
}

function normalizeModulo(value: number, modulo: number) {
  return ((value % modulo) + modulo) % modulo
}

function findNearestAccidental(targetPitchClass: number, naturalPitchClass: number) {
  for (let accidental = -2; accidental <= 2; accidental += 1) {
    if (normalizeModulo(naturalPitchClass + accidental, 12) === targetPitchClass) {
      return accidental
    }
  }

  return 0
}

function resolvePitch(
  token: string,
  state: ScoreState,
  measureAccidentals: Map<number, number>,
) {
  const parsed = parsePitchToken(token)
  if (!parsed) {
    return null
  }

  if (parsed.explicitAccidental) {
    measureAccidentals.set(parsed.degree, parsed.accidental)
  }

  const carriedAccidental = parsed.explicitAccidental
    ? parsed.accidental
    : (measureAccidentals.get(parsed.degree) ?? 0)
  const keyInfo = parseKeyInfo(state.key)
  const tonicIndex = noteLetters.indexOf(keyInfo.letter as (typeof noteLetters)[number])
  const letter = noteLetters[(tonicIndex + parsed.degree - 1) % noteLetters.length]
  const targetPitchClass = normalizeModulo(
    keyInfo.pitchClass + scaleSemitones[parsed.degree - 1],
    12,
  )
  const keyAccidental = findNearestAccidental(
    targetPitchClass,
    naturalPitchClasses[letter],
  )
  const totalAccidental = keyAccidental + carriedAccidental
  const midi =
    tonicMidi(state.key) +
    scaleSemitones[parsed.degree - 1] +
    carriedAccidental +
    parsed.octaveShift * 12
  const pitchClass = naturalPitchClasses[letter] + totalAccidental
  const octave = Math.floor((midi - pitchClass) / 12) - 1

  return {
    key: `${letter.toLowerCase()}${accidentalToText(totalAccidental)}/${octave}`,
    midi,
  }
}

function durationToVex(state: ScoreState, depth: number, carets = 0, dots = 0) {
  const baseWhole = getBaseWholeDuration(state, depth, carets)
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

function addRenderedAccidentals(staveNote: StaveNote, keys: string[]) {
  keys.forEach((key, index) => {
    const match = /([a-g])(bb|b|##|#)?\/\d/.exec(key)
    const accidental = match?.[2]
    if (accidental) {
      staveNote.addModifier(new Accidental(accidental), index)
    }
  })
}

function createRestNote(state: ScoreState, depth: number, carets = 0, dots = 0) {
  const duration = durationToVex(state, depth, carets, dots)
  return new StaveNote({
    clef: 'treble',
    keys: ['b/4'],
    duration: `${duration.duration}r`,
    dots: duration.dots,
  })
}

function mapBarline(barline: 'single' | 'double-end' | 'repeat-start' | 'repeat-end' | 'repeat-both') {
  switch (barline) {
    case 'double-end':
      return { end: BarlineType.END, nextStart: BarlineType.SINGLE }
    case 'repeat-start':
      return { end: BarlineType.SINGLE, nextStart: BarlineType.REPEAT_BEGIN }
    case 'repeat-end':
      return { end: BarlineType.REPEAT_END, nextStart: BarlineType.SINGLE }
    case 'repeat-both':
      return { end: BarlineType.REPEAT_END, nextStart: BarlineType.REPEAT_BEGIN }
    default:
      return { end: BarlineType.SINGLE, nextStart: BarlineType.SINGLE }
  }
}

function parseMeasures(document: M3NDocument) {
  return document.lines
    .map((line) => {
      const measures: MeasureData[] = []
      let units: MeasureUnit[] = []
      let measureIndex = 0
      let currentState: ScoreState | null = null
      let pendingStartBarType = BarlineType.SINGLE

      const flush = (endBarType = BarlineType.SINGLE) => {
        if (!currentState || units.length === 0) {
          units = []
          return
        }

        measures.push({
          id: `${line.id}-measure-${measureIndex += 1}`,
          state: currentState,
          startBarType: pendingStartBarType,
          endBarType,
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
          const barTypes = mapBarline(event.barline)
          flush(barTypes.end)
          pendingStartBarType = barTypes.nextStart
        }
      })

      flush()

      return {
        id: line.id,
        measures,
      }
    })
    .filter((line) => line.measures.length > 0)
}

function buildPlaybackTimeline(lines: StaffLineData[]) {
  const timeline: PlaybackEvent[] = []
  let sequence = 0

  lines.forEach((line) => {
    line.measures.forEach((measure) => {
      const measureAccidentals = new Map<number, number>()

      measure.units.forEach((unit) => {
        if (unit.kind === 'note') {
          const id = `${unit.event.id}-0`
          const wholeDuration = getWholeDuration(
            unit.event.state,
            unit.event.depth,
            unit.event.carets,
            unit.event.dots,
          )
          const pitch = resolvePitch(unit.event.value, unit.event.state, measureAccidentals)
          timeline.push({
            id: `playback-${sequence += 1}`,
            noteIds: [id],
            durationSeconds: getQuarterDurationSeconds(unit.event.state, wholeDuration),
            frequencies: pitch ? [440 * 2 ** ((pitch.midi - 69) / 12)] : [],
          })
          return
        }

        if (unit.kind === 'chord') {
          const wholeDuration = getWholeDuration(unit.event.state, unit.event.depth)
          const pitches = unit.event.notes
            .map((note, noteIndex) => ({
              noteId: `${unit.event.id}-${noteIndex}`,
              pitch: resolvePitch(note, unit.event.state, measureAccidentals),
            }))
            .filter((item): item is { noteId: string; pitch: PitchInfo } => Boolean(item.pitch))

          timeline.push({
            id: `playback-${sequence += 1}`,
            noteIds: pitches.map((item) => item.noteId),
            durationSeconds: getQuarterDurationSeconds(unit.event.state, wholeDuration),
            frequencies: pitches.map((item) => 440 * 2 ** ((item.pitch.midi - 69) / 12)),
          })
          return
        }

        const occupied = Number(unit.event.value)
        const occupiedCount = Number.isFinite(occupied) && occupied > 0 ? occupied : unit.event.notes.length
        const totalWholeDuration = getBaseWholeDuration(unit.event.state, unit.event.depth) * occupiedCount
        const noteWholeDuration = totalWholeDuration / Math.max(unit.event.notes.length, 1)

        unit.event.notes.forEach((note, noteIndex) => {
          const pitch = resolvePitch(note, unit.event.state, measureAccidentals)
          timeline.push({
            id: `playback-${sequence += 1}`,
            noteIds: [`${unit.event.id}-${noteIndex}`],
            durationSeconds: getQuarterDurationSeconds(unit.event.state, noteWholeDuration),
            frequencies: pitch ? [440 * 2 ** ((pitch.midi - 69) / 12)] : [],
          })
        })
      })
    })
  })

  return timeline
}

type StaffRendererProps = {
  document: M3NDocument
  compact?: boolean
}

export function StaffRenderer({ document, compact = false }: StaffRendererProps) {
  const lines = useMemo(() => parseMeasures(document), [document])
  const playbackTimeline = useMemo(() => buildPlaybackTimeline(lines), [lines])
  const hostRef = useRef<HTMLDivElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const timerIdsRef = useRef<number[]>([])
  const cleanupNodesRef = useRef<Array<() => void>>([])
  const [width, setWidth] = useState(960)
  const [isPlaying, setIsPlaying] = useState(false)
  const [activeNoteIds, setActiveNoteIds] = useState<string[]>([])

  const stopPlayback = () => {
    timerIdsRef.current.forEach((timerId) => window.clearTimeout(timerId))
    timerIdsRef.current = []
    cleanupNodesRef.current.forEach((cleanup) => cleanup())
    cleanupNodesRef.current = []
    setIsPlaying(false)
    setActiveNoteIds([])
  }

  useEffect(() => stopPlayback, [document])

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

    const renderer = new Renderer(element, Renderer.Backends.SVG)
    const height = Math.max(220, lines.length * 180)
    renderer.resize(width, height)
    const context = renderer.getContext()
    context.setFillStyle('#1f2329')
    context.setStrokeStyle('#1f2329')
    context.setFont('Georgia', 10)

    const ties: StaveTie[] = []
    let previousState: ScoreState | null = null
    let pendingTie:
      | {
          note: StaveNote
          key: string
        }
      | null = null

    let y = 28

    lines.forEach((line, lineIndex) => {
      const measureWidth = Math.max(180, Math.floor((width - 24) / line.measures.length))
      let x = 12

      line.measures.forEach((measure, measureIndex) => {
        const stave = new Stave(x, y, measureWidth)
        stave.setBegBarType(measure.startBarType)
        stave.setEndBarType(measure.endBarType)

        const isFirstMeasure = lineIndex === 0 && measureIndex === 0
        const timeChanged =
          !previousState ||
          previousState.beats !== measure.state.beats ||
          previousState.beatValue !== measure.state.beatValue

        if (isFirstMeasure) {
          stave.addClef('treble')
        }

        if (isFirstMeasure || timeChanged) {
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
            const duration = durationToVex(
              unit.event.state,
              unit.event.depth,
              unit.event.carets,
              unit.event.dots,
            )

            if (unit.event.value === '0' || unit.event.value === 'X') {
              const rest = createRestNote(
                unit.event.state,
                unit.event.depth,
                unit.event.carets,
                unit.event.dots,
              )
              rest.setAttribute('id', `${unit.event.id}-0`)
              rest.addClass('playable-note')
              tickables.push(rest)
              pendingTie = null
              return
            }

            const pitch = resolvePitch(unit.event.value, unit.event.state, measureAccidentals)
            const key = pitch?.key ?? 'b/4'
            const note = new StaveNote({
              clef: 'treble',
              keys: [key],
              duration: duration.duration,
              dots: duration.dots,
            })
            note.setAttribute('id', `${unit.event.id}-0`)
            note.addClass('playable-note')
            addRenderedAccidentals(note, [key])
            tickables.push(note)

            if (pendingTie && pendingTie.key === key) {
              ties.push(
                new StaveTie({
                  firstNote: pendingTie.note,
                  lastNote: note,
                  firstIndexes: [0],
                  lastIndexes: [0],
                }),
              )
              pendingTie = null
            }

            if (unit.event.tied) {
              pendingTie = { note, key }
            } else {
              pendingTie = null
            }
            return
          }

          if (unit.kind === 'chord') {
            const duration = durationToVex(unit.event.state, unit.event.depth)
            const keys = unit.event.notes
              .map((token) => resolvePitch(token, unit.event.state, measureAccidentals)?.key)
              .filter((item): item is string => Boolean(item))

            const note = new StaveNote({
              clef: 'treble',
              keys: keys.length > 0 ? keys : ['b/4'],
              duration: duration.duration,
              dots: duration.dots,
            })
            note.setAttribute('id', `${unit.event.id}-0`)
            note.addClass('playable-note')
            addRenderedAccidentals(note, keys)
            tickables.push(note)
            pendingTie = null
            return
          }

          const duration = durationToVex(unit.event.state, unit.event.depth)
          const tupletNotes = unit.event.notes.map((token, noteIndex) => {
            const key = resolvePitch(token, unit.event.state, measureAccidentals)?.key ?? 'b/4'
            const note = new StaveNote({
              clef: 'treble',
              keys: [key],
              duration: duration.duration,
              dots: duration.dots,
            })
            note.setAttribute('id', `${unit.event.id}-${noteIndex}`)
            note.addClass('playable-note')
            addRenderedAccidentals(note, [key])
            return note
          })

          const occupied = Number(unit.event.value)
          tuplets.push(
            new Tuplet(tupletNotes, {
              numNotes: tupletNotes.length,
              notesOccupied:
                Number.isFinite(occupied) && occupied > 0 ? occupied : tupletNotes.length,
            }),
          )
          tickables.push(...tupletNotes)
          pendingTie = null
        })

        if (tickables.length > 0) {
          voice.addTickables(tickables)
          const beams = Beam.applyAndGetBeams(voice)
          new Formatter().joinVoices([voice]).format([voice], measureWidth - 30)
          voice.draw(context, stave)
          beams.forEach((beam) => beam.setContext(context).draw())
          tuplets.forEach((tuplet) => tuplet.setContext(context).draw())

          tickables.forEach((tickable) => {
            const svgElement = tickable.getSVGElement()
            if (svgElement) {
              svgElement.classList.add('vf-playable-note')
            }
          })
        }

        previousState = measure.state
        x += measureWidth
      })

      y += 168
    })

    ties.forEach((tie) => tie.setContext(context).draw())
  }, [lines, width])

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }

    host.querySelectorAll('.vf-playable-note.is-active').forEach((element) => {
      element.classList.remove('is-active')
    })

    activeNoteIds.forEach((noteId) => {
      const element = host.querySelector(`#${CSS.escape(noteId)}`)
      element?.classList.add('is-active')
    })
  }, [activeNoteIds])

  const handlePlay = async () => {
    if (playbackTimeline.length === 0) {
      return
    }

    stopPlayback()

    const AudioContextConstructor = window.AudioContext
    if (!AudioContextConstructor) {
      return
    }

    const context = audioContextRef.current ?? new AudioContextConstructor()
    audioContextRef.current = context
    await context.resume()

    const startTime = context.currentTime + 0.05
    let cursor = 0

    playbackTimeline.forEach((event) => {
      const eventStart = startTime + cursor
      const activationDelay = Math.max(0, (eventStart - context.currentTime) * 1000)

      timerIdsRef.current.push(
        window.setTimeout(() => {
          setActiveNoteIds(event.noteIds)
        }, activationDelay),
      )

      if (event.frequencies.length > 0) {
        const gain = context.createGain()
        gain.gain.setValueAtTime(0.0001, eventStart)
        gain.gain.exponentialRampToValueAtTime(0.08, eventStart + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, eventStart + Math.max(0.05, event.durationSeconds))
        gain.connect(context.destination)

        const oscillators = event.frequencies.map((frequency) => {
          const oscillator = context.createOscillator()
          oscillator.type = 'triangle'
          oscillator.frequency.setValueAtTime(frequency, eventStart)
          oscillator.connect(gain)
          oscillator.start(eventStart)
          oscillator.stop(eventStart + Math.max(0.08, event.durationSeconds))
          return oscillator
        })

        cleanupNodesRef.current.push(() => {
          oscillators.forEach((oscillator) => oscillator.disconnect())
          gain.disconnect()
        })
      }

      cursor += event.durationSeconds
    })

    timerIdsRef.current.push(
      window.setTimeout(() => {
        stopPlayback()
      }, cursor * 1000 + 160),
    )

    setIsPlaying(true)
  }

  return (
    <section className={`staff-shell${compact ? ' compact' : ''}`}>
      {compact ? null : <div className="pane-label">五线谱渲染</div>}
      <div className="staff-toolbar">
        <button type="button" className="ghost-button" onClick={isPlaying ? stopPlayback : handlePlay}>
          {isPlaying ? '停止播放' : '播放'}
        </button>
      </div>
      {lines.length === 0 ? (
        <div className="staff-empty">输入 M3N 代码后，这里会渲染为五线谱。</div>
      ) : null}
      <div ref={hostRef} className="staff-canvas" />
      {document.diagnostics.length > 0 ? (
        <div className="staff-warning">存在解析诊断时，乐谱仅保证已识别片段的渲染结果。</div>
      ) : null}
    </section>
  )
}
