export type HappiNote = {
  start: number
  end: number
  raw: string
  pitch: string
  depth: number
  dots: number
  duration: number
  tied: boolean
}

const NOTE_MODIFIER = /^[#bngd,'"_=/x.~-]$/

function dotMultiplier(dots: number) {
  let multiplier = 1
  let addition = 0.5
  for (let index = 0; index < dots; index += 1) {
    multiplier += addition
    addition /= 2
  }
  return multiplier
}

export function readHappiNote(source: string, start: number): HappiNote | null {
  let index = start
  let prefixAccidental = ''
  if (/[#bn]/.test(source[index] ?? '') && /[0-7]/.test(source[index + 1] ?? '')) {
    prefixAccidental = source[index]
    index += 1
  }

  const degree = source[index]
  if (!degree || !/[0-7]/.test(degree)) {
    return null
  }
  index += 1

  let modifiers = ''
  while (index < source.length && NOTE_MODIFIER.test(source[index])) {
    modifiers += source[index]
    index += 1
  }

  const accidentalRaw = [...`${prefixAccidental}${modifiers}`].filter((char) => /[#bn]/.test(char)).at(-1) ?? ''
  const accidental = accidentalRaw === 'n' ? '=' : accidentalRaw
  const octaveUp = [...modifiers].filter((char) => char === 'g' || char === "'").length
    + [...modifiers].filter((char) => char === '"').length * 2
  const octaveDown = [...modifiers].filter((char) => char === 'd' || char === ',').length
  const pitch = degree === '0'
    ? '0'
    : `${degree}${accidental}${'e'.repeat(octaveUp)}${'d'.repeat(octaveDown)}`
  const simpleShortDepth = [...modifiers].filter((char) => char === '_' || char === '/' || char === 'x').length
  const depth = Math.max(simpleShortDepth, modifiers.includes('=') ? 2 : 0)
  const dots = [...modifiers].filter((char) => char === '.').length
  const extensions = [...modifiers].filter((char) => char === '-').length
  const duration = 2 ** -depth * dotMultiplier(dots) + extensions

  return {
    start,
    end: index,
    raw: source.slice(start, index),
    pitch,
    depth,
    dots,
    duration,
    tied: modifiers.includes('~'),
  }
}

export function extractHappiNotes(source: string) {
  const notes: HappiNote[] = []
  let index = 0
  while (index < source.length) {
    const note = readHappiNote(source, index)
    if (note) {
      notes.push(note)
      index = note.end
    } else {
      index += 1
    }
  }
  return notes
}

function exactDurationSuffix(duration: number) {
  let best: { depth: number; carets: number; dots: number; cost: number } | null = null
  for (let depth = 0; depth <= 5; depth += 1) {
    for (let carets = 0; carets <= 5; carets += 1) {
      for (let dots = 0; dots <= 3; dots += 1) {
        const candidate = 2 ** (carets - depth) * dotMultiplier(dots)
        if (Math.abs(candidate - duration) < 1e-9) {
          const cost = depth * 2 + carets + dots
          if (!best || cost < best.cost) {
            best = { depth, carets, dots, cost }
          }
        }
      }
    }
  }
  return best
}

function renderDuration(pitch: string, duration: number, tied: boolean): string {
  const exact = exactDurationSuffix(duration)
  if (exact) {
    const value = `${pitch}${'^'.repeat(exact.carets)}${'.'.repeat(exact.dots)}${tied && pitch !== '0' ? '~' : ''}`
    return `${'('.repeat(exact.depth)}${value}${')'.repeat(exact.depth)}`
  }

  const segments: number[] = []
  let remaining = duration
  const candidates = [8, 7, 6, 4, 3, 2, 1.75, 1.5, 1, 0.75, 0.5, 0.375, 0.25, 0.125, 0.0625]
  while (remaining > 1e-9) {
    const candidate = candidates.find((value) => value <= remaining + 1e-9) ?? remaining
    segments.push(candidate)
    remaining -= candidate
  }

  return segments
    .map((segment, index) => renderDuration(pitch, segment, pitch !== '0' && (tied || index < segments.length - 1)))
    .join(' ')
}

export function convertHappiNote(note: HappiNote): string {
  return renderDuration(note.pitch, note.duration, note.tied)
}

export function addTiesToNotes(source: string) {
  const notes = extractHappiNotes(source)
  let value = source
  for (let index = notes.length - 2; index >= 0; index -= 1) {
    const note = notes[index]
    if (!note.tied && note.pitch !== '0') {
      value = `${value.slice(0, note.end)}~${value.slice(note.end)}`
    }
  }
  return value
}
