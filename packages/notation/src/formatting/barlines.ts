import { parseM3NDocument } from '../m3n-direct.js'
import { parseM3NSyntaxTree } from '../notation/syntax-tree.js'
import { applyEdits, type SourceEdit } from './shared.js'

/** Ordinary phrase separators do not by themselves require a double barline. */
export function normalizeSectionBarlines(source: string) {
  const tree = parseM3NSyntaxTree(source)
  const melody = tree.lines.flatMap((line, index) => line.row?.kind === 'melody' ? [{ line, index, row: line.row }] : [])
  const score = parseM3NDocument(source)
  const events = [...score.parts.values()].flatMap(part => part.melody.flatMap(measure => measure.events))
  const instrumental = (offset: number) => score.intervals.some(interval => interval.kind === 'inst' && interval.staff === 'melody' &&
    interval.start !== undefined && interval.end !== undefined && interval.start <= offset && offset < interval.end)
  const edits: SourceEdit[] = []
  for (let index = 0; index < melody.length - 1; index++) {
    const current = melody[index]!, next = melody[index + 1]!
    const tokens = current.row.tokens.filter(token => token.kind !== 'space' && token.kind !== 'comment')
    const bar = tokens.at(-1)
    if (bar?.kind !== 'bar' || bar.raw !== '||') continue
    const lastEvent = events.findLast(event => event.sourceStart >= current.row.contentStart && event.sourceEnd <= bar.start)
    const firstEvent = events.find(event => event.sourceStart >= next.row.contentStart && event.sourceEnd <= next.row.end)
    if (!lastEvent || !firstEvent || instrumental(lastEvent.sourceStart) !== instrumental(firstEvent.sourceStart)) continue
    const between = tree.lines.slice(current.index + 1, next.index)
    // A named section, house, explicit heading, navigation, instrumental boundary,
    // key/meter change or manual line break is evidence of an intentional boundary.
    if (between.some(line => line.kind === 'section' || line.kind === 'unknown' || line.kind === 'header' ||
      line.kind === 'phrase' && /^---\s*V/.test(line.raw.trim()))) continue
    const preceding = tree.lines.slice(0, current.index).findLast(line => line.kind === 'phrase' || line.kind === 'section')
    if (preceding?.kind === 'phrase' && /^---\s*V/.test(preceding.raw.trim())) continue
    if (current.row.directives.some(directive => ['inst', 'ds', 'dc', 'fine', 'segno', 'tocoda', 'coda', 'br'].includes(directive.name))) continue
    const nextOnset = next.row.tokens.find(token => token.kind === 'note' || token.kind === 'group')?.start ?? Infinity
    if (next.row.directives.some(directive => directive.start < nextOnset &&
      (['inst', 'text', 'key', 'br', 'ds', 'dc', 'fine', 'segno', 'tocoda', 'coda'].includes(directive.name) || /^\d+\/\d+$/.test(directive.name)))) continue
    if (next.row.tokens.some(token => token.kind === 'bar' && token.raw !== '|' && token.start < nextOnset)) continue
    edits.push({ start: bar.start, end: bar.end, value: '|' })
    // Bass and chord rows may explicitly mirror the melody's closing barline.
    for (const line of between) {
      if (!line.row || !['bass', 'harmony'].includes(line.row.kind)) continue
      const closing = line.row.tokens.filter(token => token.kind !== 'space' && token.kind !== 'comment').at(-1)
      if (closing?.kind === 'bar' && closing.raw === '||') edits.push({ start: closing.start, end: closing.end, value: '|' })
    }
  }
  return applyEdits(source, edits)
}
