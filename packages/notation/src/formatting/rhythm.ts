import { parseM3NDocument } from '../m3n-direct.js'
import { parseM3NSyntaxTree } from '../notation/syntax-tree.js'
import type { ScoreEvent } from '../notation/score-document.js'
import { EPSILON, applyEdits, scoreMeasures, beatGroup, spellDuration, type FormatContext } from './shared.js'

function respectsMergeBoundary(offset: number, beats: number, event: ScoreEvent) {
  const beat = 4 / (event.meterUnit ?? 4)
  const measureBeats = (event.meterCount ?? 4) * beat
  const end = offset + beats
  if (end > measureBeats + EPSILON) return false
  if ((event.meterCount ?? 4) > 3 && (event.meterCount ?? 4) % 3 === 0) {
    const group = beatGroup(event)
    return Math.floor((offset + EPSILON) / group) === Math.floor((end - EPSILON) / group)
  }
  if ((event.meterCount ?? 4) % 2 === 0) return !(offset > EPSILON && offset < measureBeats / 2 - EPSILON && end > measureBeats / 2 + EPSILON)
  const beginsOnBeat = Math.abs(offset / beat - Math.round(offset / beat)) < EPSILON
  return beginsOnBeat || Math.floor((offset + EPSILON) / beat) === Math.floor((end - EPSILON) / beat)
}

function durationToken(pitch: string, beats: number, tied = false, depth = 0) {
  const spelling = spellDuration(pitch, beats, tied, depth)
  if (!spelling) return null
  const nested = spelling.depth - depth
  return '('.repeat(nested) + spelling.raw + ')'.repeat(nested)
}

function restRunReplacement(events: ScoreEvent[], source: string, offset: number, depthAt: (position: number) => number) {
  const first = events[0]
  const last = events.at(-1)
  if (!first || !last || events.length < 2 || events.some((event) => event.kind !== 'rest')) return null
  const beats = events.reduce((sum, event) => sum + event.beats, 0)
  if (!respectsMergeBoundary(offset, beats, first)) return null
  let start = first.sourceStart
  let end = last.sourceEnd
  const firstDepth = depthAt(start)
  const lastDepth = depthAt(last.sourceStart)
  // A plain run can be rewritten relative to its existing enclosing scope.
  if (firstDepth === lastDepth && /^[\s0^.]+$/.test(source.slice(start, end))) {
    const value = durationToken('0', beats, false, firstDepth)
    return value ? { start, end, value } : null
  }
  // Mixed depths are safe only when the run owns every scope removed with it.
  for (let level = 0; level < firstDepth; level += 1) {
    while (start > 0 && /\s/.test(source[start - 1] ?? '')) start -= 1
    if (source[start - 1] !== '(') return null
    start -= 1
  }
  for (let level = 0; level < lastDepth; level += 1) {
    while (end < source.length && /\s/.test(source[end] ?? '')) end += 1
    if (source[end] !== ')') return null
    end += 1
  }
  const value = durationToken('0', beats)
  return value && /^[\s()0^.]+$/.test(source.slice(start, end)) ? { start, end, value } : null
}

function rhythmContext(source: string, context?: FormatContext) {
  const document = context?.score ?? parseM3NDocument(source)
  const syntaxTree = context?.syntaxTree ?? parseM3NSyntaxTree(source)
  const parens = syntaxTree.tokens.filter((token) => token.kind === 'open-paren' || token.kind === 'close-paren')
  const parenDepthAt = (position: number) => parens.reduce((depth, token) =>
    token.start < position ? depth + (token.kind === 'open-paren' ? 1 : -1) : depth, 0)
  const intervals = [...document.intervals, ...(document.alternatives ?? []).flatMap((alternative) => alternative.intervals)]
  const endpoints = new Set(intervals.flatMap((interval) => [interval.start, interval.endStart]))
  const hasForcedTiedLyrics = document.lyrics.some((block) => block.syllables.some((syllable) => syllable.forceTiedTarget))
  return { document, parenDepthAt, endpoints, hasForcedTiedLyrics }
}

function eventOffsets(events: ScoreEvent[]) {
  let offset = 0
  return events.map((event) => { const start = offset; offset += event.beats; return start })
}

/** Expose a strong beat crossed by an offbeat sustained note, retaining enclosing depth. */
export function splitAtStrongBeats(source: string, context?: FormatContext) {
  const { document, parenDepthAt, hasForcedTiedLyrics } = rhythmContext(source, context)
  if (hasForcedTiedLyrics) return source
  const replacements: Array<{ start: number; end: number; value: string }> = []
  for (const measure of scoreMeasures(document)) {
    const offsets = eventOffsets(measure.events)
    for (const [index, event] of measure.events.entries()) {
      const offset = offsets[index] ?? 0
      const meterCount = event.meterCount ?? document.meterCount
      const meterUnit = event.meterUnit ?? document.meterUnit
      const group = beatGroup(event)
      const boundary = meterCount > 3 && meterCount % 3 === 0
        ? Math.abs(offset / group - Math.round(offset / group)) > EPSILON
          ? (Math.floor((offset + EPSILON) / group) + 1) * group : undefined
        : meterCount % 2 === 0 ? meterCount * 2 / meterUnit : undefined
      if (boundary && offset > EPSILON && offset < boundary - EPSILON && offset + event.beats > boundary + EPSILON && event.kind === 'note' && event.pitches.length === 1) {
        const pitch = event.pitches[0]
        const depth = parenDepthAt(event.sourceStart)
        const first = pitch && durationToken(pitch, boundary - offset, true, depth)
        const second = pitch && durationToken(pitch, event.beats - boundary + offset, event.tie, depth)
        if (first && second && /^[1-7#b=ed^.~]+$/.test(source.slice(event.sourceStart, event.sourceEnd))) {
          replacements.push({ start: event.sourceStart, end: event.sourceEnd, value: `${first} ${second}` })
        }
      }
    }
  }
  return applyEdits(source, replacements)
}

/** Remove representable rest/tie runs only when rhythm and explicit event targets survive. */
export function mergeRedundantDurations(source: string, context?: FormatContext) {
  const { document, parenDepthAt, endpoints, hasForcedTiedLyrics } = rhythmContext(source, context)
  const replacements: Array<{ start: number; end: number; value: string }> = []
  for (const measure of scoreMeasures(document)) {
    const offsets = eventOffsets(measure.events)
    let restRun: ScoreEvent[] = []
    let restOffset = 0
    const flushRestRun = () => {
      const first = restRun[0]
      const replacement = first && !restRun.some((event) => endpoints.has(event.sourceStart)) ? restRunReplacement(restRun, source, restOffset, parenDepthAt) : null
      if (replacement) replacements.push(replacement)
      restRun = []
    }
    for (const [index, event] of [...measure.events, null].entries()) {
      if (event?.kind === 'rest') {
        const currentBeats = restRun.reduce((sum, item) => sum + item.beats, 0)
        if (restRun.length > 0 && !respectsMergeBoundary(restOffset, currentBeats + event.beats, event)) flushRestRun()
        if (restRun.length === 0) restOffset = offsets[index] ?? 0
        restRun.push(event)
      } else if (restRun.length > 0) flushRestRun()
    }
    if (hasForcedTiedLyrics) continue
    for (let index = 0; index < measure.events.length - 1;) {
      const first = measure.events[index]
      if (!first || first.kind !== 'note' || !first.tie || first.pitches.length !== 1) { index += 1; continue }
      const run = [first]
      let endIndex = index
      while (run.at(-1)?.tie && endIndex + 1 < measure.events.length) {
        const next = measure.events[endIndex + 1]
        if (!next || next.kind !== 'note' || next.pitches.length !== 1 || next.pitches[0] !== first.pitches[0]) break
        run.push(next); endIndex += 1
      }
      const touchesEndpoint = run.some((event) => endpoints.has(event.sourceStart))
      if (!run.at(-1)?.tie && !touchesEndpoint) {
        const beats = run.reduce((sum, event) => sum + event.beats, 0)
        const value = first.pitches[0] && respectsMergeBoundary(offsets[index] ?? 0, beats, first) ? durationToken(first.pitches[0], beats, false, parenDepthAt(first.sourceStart)) : null
        const end = run.at(-1)?.sourceEnd
        if (value && end !== undefined && /^[\s1-7#b=ed^.~]+$/.test(source.slice(first.sourceStart, end))) replacements.push({ start: first.sourceStart, end, value })
      }
      index = Math.max(index + 1, endIndex + 1)
    }
  }
  return applyEdits(source, replacements)
}

