import { scoreInkBounds } from './score-ink-bounds'
import type { AccessibleScore } from './score-accessibility'
import type { ScoreDocument } from '@m3n/notation'

const svgNamespace = 'http://www.w3.org/2000/svg'
type ReadingPosition = { measureId: string; eventId?: string; sourceId?: string }
type ReadingState = { score?: ScoreDocument; position?: ReadingPosition; measure?: Element; restoring?: boolean }
const readingStates = new WeakMap<HTMLElement, ReadingState>()
const readingState = (paper: HTMLElement) => {
  let state = readingStates.get(paper)
  if (!state) { state = {}; readingStates.set(paper, state) }
  return state
}

function resolvePosition(paper: HTMLElement, position?: ReadingPosition) {
  if (!position) return null
  const notes = [...paper.querySelectorAll<SVGGElement>('[data-reading-event]')]
  return notes.find(note => note.dataset.readingEvent === position.eventId)
    ?? notes.find(note => position.sourceId && note.dataset.readingSource === position.sourceId)
    ?? [...paper.querySelectorAll<SVGGElement>('[data-reading-measure]')].find(measure => measure.dataset.readingMeasure === position.measureId)
    ?? null
}

function markReadingPosition(paper: HTMLElement, target: Element) {
  const state = readingState(paper)
  const measure = target.closest<SVGGElement>('[data-reading-measure]')
  if (!measure) return
  if (state.measure !== measure) state.measure?.removeAttribute('data-reading-current')
  measure.setAttribute('data-reading-current', 'true')
  state.measure = measure
  paper.dispatchEvent(new Event('score-reading-change'))
}

export function rememberScorePosition(paper: HTMLElement, target: Element) {
  const state = readingState(paper)
  if (state.restoring) return
  const measure = target.closest<SVGGElement>('[data-reading-measure]')
  if (!measure) return
  const note = target.closest<SVGGElement>('[data-reading-event]')
  state.position = { measureId: measure.dataset.readingMeasure!, eventId: note?.dataset.readingEvent, sourceId: note?.dataset.readingSource }
  markReadingPosition(paper, target)
}

export function currentReadingMeasure(paper: HTMLElement) {
  return resolvePosition(paper, readingState(paper).position)?.closest<SVGGElement>('[data-reading-measure]')?.dataset.readingMeasure
}

/** Capture focus at the actual DOM replacement, never at the start of async layout. */
export function preserveScoreReading(paper: HTMLElement, score: ScoreDocument) {
  const state = readingState(paper)
  const sameScore = state.score === score
  const focused = paper.contains(document.activeElement)
  if (!sameScore) {
    state.position = undefined
    state.measure = undefined
  } else if (focused) rememberScorePosition(paper, document.activeElement!)
  state.score = score
  return () => {
    const target = resolvePosition(paper, state.position)
    if (target) {
      markReadingPosition(paper, target)
      if (sameScore && focused) {
        state.restoring = true
        try { target.focus({ preventScroll: true }) } finally { state.restoring = false }
      }
    } else paper.dispatchEvent(new Event('score-reading-change'))
  }
}

/** Native SVG titles name the actual music geometry, without painting text. */
export function attachScoreReading(paper: HTMLElement, text: AccessibleScore) {
  const measures = new Map(text.measures.map(measure => [measure.id, measure]))
  for (const [page, svg] of [...paper.querySelectorAll('svg')].entries()) {
    const exposed = new Set<Element>([svg])
    const expose = (element: Element) => {
      for (let node: Element | null = element; node && node !== svg; node = node.parentElement) exposed.add(node)
    }
    const name = (element: Element, label: string, role: string) => {
      const title = element.querySelector(':scope > title[data-score-reading]') ?? document.createElementNS(svgNamespace, 'title')
      title.setAttribute('data-score-reading', '')
      title.textContent = label
      element.prepend(title)
      // aria-label also supports browsers that do not use a nested SVG title.
      element.setAttribute('aria-label', label)
      element.setAttribute('data-reading-label', label)
      element.setAttribute('role', role)
      expose(element)
      exposed.add(title)
    }
    name(svg, `谱面第${page + 1}页`, 'group')
    for (const group of svg.querySelectorAll<SVGGElement>('g.measure')) {
      const id = group.getAttribute('data-m3n-measure-id') ?? group.id.replace(/(?:-s\d+|-fragment-\d+)$/, '')
      const measure = measures.get(id)
      if (!measure) continue
      // A small measure may have empty space between its notes. Give the whole
      // native group a hit area while keeping the painted notes above it.
      const painted = scoreInkBounds(group)
      if ((painted || typeof group.getBBox === 'function') && !group.querySelector(':scope > [data-score-reading-hitarea]')) {
        const bounds = painted ?? group.getBBox()
        const area = document.createElementNS(svgNamespace, 'rect')
        area.setAttribute('data-score-reading-hitarea', '')
        for (const attribute of ['x', 'y', 'width', 'height'] as const) area.setAttribute(attribute, String(bounds[attribute]))
        area.setAttribute('fill', 'transparent')
        area.setAttribute('pointer-events', 'all')
        group.prepend(area)
      }
      name(group, measure.label, 'group')
      group.dataset.readingMeasure = id
      group.removeAttribute('tabindex')
      const events = new Map(measure.voices.flatMap(voice => voice.eventIds.map((id, index) => [id, `${measure.voices.length > 1 ? `${voice.name}，` : ''}${voice.events[index]!}`] as const)))
      const claimed = new Set<string>()
      for (const note of group.querySelectorAll<SVGGElement>('g.note[id], g.chord[id], g.rest[id], g.tuplet[id]')) {
        // Engraving may split one event into tuplet notes or sustain glyphs.
        // Read its complete semantic description once per measure fragment.
        const eventId = note.id.replace(/-(?:n|sustain|rest)\d+$/, '')
        const description = events.get(eventId)
        if (!description || claimed.has(eventId)) continue
        name(note, description, 'img')
        note.dataset.readingEvent = eventId
        note.dataset.readingSource = eventId.replace(/-rend\d+$/, '')
        note.removeAttribute('tabindex')
        claimed.add(eventId)
      }
      if (!events.size) {
        const description = measure.voices.flatMap(voice => voice.events).join(' ')
        name(group, `${measure.label}。${description}`, 'img')
      }
    }
    // Only semantic groups and their ancestor paths are exposed. Glyph text,
    // lyrics, staff lines and annotations cannot produce duplicate readings.
    for (const element of exposed) {
      element.removeAttribute('aria-hidden')
      for (const child of element.children) {
        if (!exposed.has(child)) child.setAttribute('aria-hidden', 'true')
      }
    }
  }
}

export function focusScoreMeasure(paper: HTMLElement | null, id: string) {
  const measure = [...paper?.querySelectorAll<SVGGElement>('[data-reading-measure]') ?? []]
    .find(element => element.dataset.readingMeasure === id)
  if (!measure) return
  rememberScorePosition(paper!, measure)
  measure.scrollIntoView({ block: 'center', inline: 'nearest' })
  measure.focus({ preventScroll: true })
}

export function resumeScoreReading(paper: HTMLElement | null, fallbackId: string) {
  const target = paper && resolvePosition(paper, readingState(paper).position)
  if (!target) return focusScoreMeasure(paper, fallbackId)
  target.scrollIntoView({ block: 'center', inline: 'nearest' })
  readingState(paper!).restoring = true
  try { target.focus({ preventScroll: true }) } finally { readingState(paper!).restoring = false }
}
