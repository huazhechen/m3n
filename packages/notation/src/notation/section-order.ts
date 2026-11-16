import { orderedMeasureIndexes, hasVisitEndings, parsePassRange } from './repeats.js'
import type { ScoreDocument } from './score-document.js'
import type { M3NDocumentProjection } from './m3n-document.js'
import { createScoreDiagnostic, type ScoreDiagnostic } from './diagnostics.js'

/** Explicit section order has one unambiguous source of playback navigation. */
export function validateSectionOrder(document: ScoreDocument, projection: M3NDocumentProjection) {
  const directives = projection.syntaxTree.directives.filter(directive => directive.name === 'order')
  if (!directives.length) return []
  const diagnostics: ScoreDiagnostic[] = []
  const report = (message: string, start = directives[0]!.start, end = directives[0]!.end) => {
    diagnostics.push(createScoreDiagnostic({ code: 'M3N_SECTION_ORDER', message, range: { start, end } }))
  }
  for (const directive of directives) {
    if (directive.closing || !projection.syntaxTree.lines.some(line => line.line === directive.line && line.kind === 'header')) {
      report('order 只能在文档首部声明一次', directive.start, directive.end)
    }
    const names = (directive.value ?? '').split(',').map(name => name.trim())
    if (names.some(name => !name || /[{}=]/.test(name))) report('order 必须是逗号分隔的非空乐段名称', directive.start, directive.end)
    if (names.length > 256) report('order 最多允许256次乐段访问', directive.start, directive.end)
  }
  if (directives.length > 1) report('order 不能重复声明')
  const names = new Set<string>()
  for (const section of document.sections ?? []) {
    if (!section.name) report('使用 order 时，每个乐段都必须有名称，弱起须写在所属乐段开头')
    if (names.has(section.name)) report(`乐段名称重复：${section.name}`)
    names.add(section.name)
    if (!document.order?.includes(section.name)) report(`order 未引用乐段：${section.name}`)
  }
  for (const name of document.order ?? []) if (!names.has(name)) report(`order 引用了未定义的乐段：${name}`)
  for (const part of document.parts.values()) for (const measures of [part.melody, part.bass]) {
    for (const measure of measures) {
      if (measure.navigation?.length || measure.events.some(event => event.navigation.length)) {
        report('order 模式不与 D.S./D.C./Fine 混用；段内可使用成对反复线和跳房子')
        return diagnostics
      }
      const section = document.sections?.find(section => section.name === measure.sectionName)
      if (measure.events.length && (!section || measure.events.some(event => event.sourceStart < section.start || event.sourceEnd > section.end))) {
        report('order 的乐段边界必须位于完整小节之间')
      }
    }
    const ordered = orderedMeasureIndexes(measures, document.order ?? []).map(index => measures[index]!)
    const duration = (measure: typeof measures[number] | undefined) => measure?.events.reduce((sum, event) => sum + event.beats, 0) ?? 0
    const expected = (measure: typeof measures[number] | undefined) => {
      const first = measure?.events[0]
      return (first?.meterCount ?? document.meterCount) * 4 / (first?.meterUnit ?? document.meterUnit)
    }
    const complements = (left: typeof measures[number] | undefined, right: typeof measures[number] | undefined) => Boolean(left && right
      && duration(left) > 0 && duration(right) > 0
      && duration(left) < expected(left) && duration(right) < expected(right)
      && expected(left) === expected(right)
      && Math.abs(duration(left) + duration(right) - expected(left)) < 1e-9)
    // Validate every visit: partial bars may join across a named boundary,
    // including the global pickup/coda pair, without changing their duration.
    const validBoundary = (measure: typeof measures[number]) => ordered.every((entry, index) => entry !== measure
      || complements(ordered[index - 1], entry) || complements(entry, ordered[index + 1])
      || entry === ordered[0] && complements(entry, ordered.at(-1))
      || index === ordered.length - 1 && complements(ordered[0], entry))
    for (const section of document.sections ?? []) {
      const segment = measures.filter(measure => measure.sectionName === section.name && (measure.events.length || measure.multiRest))
      // Section labels still require a visible source event at entry.
      if (segment[0]?.multiRest) report('order 乐段须以普通音符或休止符开头；多小节休止可放在乐段内部')
      const visitEndings = hasVisitEndings(segment)
      if (visitEndings) {
        const count = document.order!.filter(name => name === section.name).length
        const groups = segment.filter((measure, index) => measure.ending && segment[index - 1]?.ending !== measure.ending)
        for (let pass = 1; pass <= count; pass++) {
          if (groups.filter(measure => parsePassRange(measure.ending!).has(pass)).length !== 1) report('order 的遍次房子须恰好覆盖该乐段的每次访问，不能缺漏或重叠')
        }
        if (groups.some(measure => [...parsePassRange(measure.ending!)].some(pass => pass > count))) report('order 的房子遍次超出乐段访问次数')
        const firstHouse = segment.findIndex(measure => measure.ending)
        if (segment.slice(firstHouse).some(measure => !measure.ending)) report('order 的遍次房子只能放在乐段结尾')
      }
      const boundary = visitEndings ? [segment[0], ...segment.filter((measure, index) => measure.ending && segment[index + 1]?.ending !== measure.ending)] : [segment[0], segment.at(-1)]
      const partial = boundary.filter(measure => measure?.events.length && Math.abs(duration(measure) - expected(measure)) > 1e-9)
      const complementaryPickup = !visitEndings && segment.length > 1 && partial.length === 2
        && Math.abs(duration(boundary[0]) + duration(boundary[1]) - expected(boundary[0])) < 1e-9
      if (partial.length && !complementaryPickup && !partial.every(measure => measure && validBoundary(measure))) report('order 的乐段边界必须位于完整小节之间，弱起须在每次访问中与相邻小节或全曲首尾互补')
      let repeatOpen = false
      let hasLocalRepeat = false
      for (const measure of segment) {
        if (measure.left === 'rptstart') {
          if (repeatOpen) report('order 段内不支持嵌套反复线')
          repeatOpen = true
          hasLocalRepeat = true
        }
        if (measure.ending && !hasLocalRepeat && !visitEndings) report('order 段内跳房子须属于同一乐段的反复线')
        if (measure.right === 'rptend') {
          if (!repeatOpen) report('order 段内反复线须在同一乐段内成对出现')
          repeatOpen = false
        }
      }
      if (repeatOpen) report('order 段内反复线须在同一乐段内成对出现')
      if (boundary.slice(1).some(measure => measure?.events.at(-1)?.tie)) report('order 的乐段末尾不能延音到另一个乐段')
    }
  }
  for (const interval of document.intervals) {
    const section = document.sections?.find(section => interval.start !== undefined && section.start <= interval.start && interval.start < section.end)
    if (section && interval.end !== undefined && interval.end > section.end) report('order 的区间记号不能跨越乐段边界')
  }
  return diagnostics
}
