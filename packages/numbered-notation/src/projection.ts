import {
  parseM3NGrace, parseM3NGroupPitches, scoreEventIds,
  type ScoreDocument, type ScoreEvent, type ScoreMeasure,
} from '@m3n/notation'
import { lyricsByEvent, type LyricRowData } from './lyrics.js'

export type NumberedNotationDiagnostic = { code: string; message: string; severity: 'warning' | 'error'; sourceStart?: number; sourceEnd?: number }
export type EventBinding = {
  label: string
  xmlId: string
  visualId: string
  measureId: string
  staff: 'melody' | 'bass'
  event?: ScoreEvent
  slot: number
  lyrics: Map<number, LyricRowData>
}
export type ProjectedScore = { source: string; bindings: Map<string, EventBinding>; diagnostics: NumberedNotationDiagnostic[]; rows: number[] }
export type ProjectionOptions = { width: number; paged: boolean; includeBass?: boolean }
const quote = (value: string) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
const pitchName = (token: string, shift = 0) => {
  const match = /^([0-7])([#b=]*)([ed]*)$/.exec(token)
  if (!match) return '0'
  const octave = [...(match[3] ?? '')].reduce((n, value) => n + (value === 'e' ? 1 : -1), shift)
  return `${match[2]?.replaceAll('=', 'n') ?? ''}${match[1]}${octave > 0 ? "'".repeat(octave) : ','.repeat(-octave)}`
}
const keyName = (value: string) => `${/^([A-G][#b]?)/.exec(value)?.[1] ?? 'C'}4`

/** Exact dyadic durations, including 64th notes and multiple augmentation dots. */
function duration(expression: string, beats: number): string {
  const base = 2 ** Math.floor(Math.log2(beats))
  const ratio = beats / base
  const dots = [1, 1.5, 1.75, 1.875].findIndex(value => Math.abs(value - ratio) < 1e-7)
  if (base > 1 || dots < 0) throw new Error(`无法表达简谱时值 ${beats}`)
  let result = base < 1 ? `@div({${expression}},${Math.round(-Math.log2(base))})` : expression
  if (dots > 0) result = `@dot({${result}},${dots})`
  return result
}

export function projectNumberedScore(document: ScoreDocument, options: ProjectionOptions): ProjectedScore {
  const ids = scoreEventIds(document)
  const lyrics = lyricsByEvent(document)
  const bindings = new Map<string, EventBinding>()
  const diagnostics: NumberedNotationDiagnostic[] = []
  const rowNumbers = [...new Set([...lyrics.values()].flatMap(slots => [...slots.values()].flatMap(rows => [...rows.keys()])))].sort((a, b) => a - b)
  const endpointLabels = new Map<ScoreEvent, { first: string; last: string; children: string[] }>()
  const relations: string[] = []
  // Registered after musical relations, from inner to outer: harmony, directions, section names.
  const annotations: string[][] = [[], [], []]
  let serial = 0
  const warn = (event: ScoreEvent, value: string) => diagnostics.push({ code: 'NUMBERED_UNSUPPORTED_MARK', message: `简谱尚不支持标记 ${value}`, severity: 'warning', sourceStart: event.sourceStart, sourceEnd: event.sourceEnd })

  const voicesForPart = (melody: ScoreMeasure[], bass: ScoreMeasure[], partIndex: number) => {
    const renderVoice = (measures: ScoreMeasure[], staff: 'melody' | 'bass') => {
      const pieces: string[] = []
      const lyricTargets: EventBinding[] = []
      const firsts = new Map<number, string>(), lasts = new Map<number, string>()
      let activeKey = document.key, activeTempo = document.tempo
      let activeMeter = `${document.meterCount}/${document.meterUnit}`
      let previousTied: ScoreEvent | undefined
      let previousMeasure: ScoreMeasure | undefined
      let dynamic = ''
      const bind = (expression: string, event: ScoreEvent | undefined, measureId: string, slot: number, suffix = '', lyricTarget = false) => {
        const xmlId = event ? ids.get(event)! : `m3n-rest-${partIndex + 1}-${serial}`
        const label = `m${++serial}`
        const visualId = `${xmlId}${suffix}`
        const binding: EventBinding = { label, xmlId, visualId, measureId, staff, event, slot, lyrics: suffix.includes('sustain') ? new Map() : lyrics.get(event!)?.get(slot) ?? new Map() }
        bindings.set(label, binding)
        if (lyricTarget && staff === 'melody') lyricTargets.push(binding)
        return { expression: `${expression}@${label}`, label }
      }
      const visibleMeasures = [...measures]
      while (visibleMeasures.length && !visibleMeasures.at(-1)?.events.length && !visibleMeasures.at(-1)?.multiRest) visibleMeasures.pop()
      const breaksBefore = (index: number) => index > 0 && Boolean(
        visibleMeasures[index]?.breakBefore || visibleMeasures[index - 1]?.breakAfter
        || melody[index]?.breakBefore || melody[index - 1]?.breakAfter,
      )
      visibleMeasures.forEach((measure, measureIndex) => {
        const measureId = `m3n-measure-${partIndex + 1}-${measureIndex + 1}`
        const melodyMeasure = melody[measureIndex]
        // Parallel voices must share every bar anchor, including the opening repeat.
        // B: bars are alignment syntax; structural repetition belongs to N:.
        const structure = staff === 'bass' ? melodyMeasure ?? measure : measure
        if (breaksBefore(measureIndex)) pieces.push('@br()')
        else if (measureIndex && (measure.events.some(event => event.sectionLabel) || melodyMeasure?.events.some(event => event.sectionLabel))) pieces.push('@br(soft=true)')
        if (structure.left === 'rptstart' && (breaksBefore(measureIndex) || previousMeasure?.right !== 'rptend' && previousMeasure?.right !== 'rptboth')) pieces.push('@bar(3)')
        if (measure.multiRest) {
          const item = bind(`@rest(${measure.multiRest})`, undefined, measureId, 0)
          pieces.push(item.expression)
          firsts.set(measureIndex, item.label); lasts.set(measureIndex, item.label)
        }
        for (const event of measure.events) {
          const controls: string[] = []
          if (event.key !== activeKey) { controls.push(`@key(${quote(keyName(event.key))},size=16px)`); activeKey = event.key }
          const meter = `${event.meterCount ?? document.meterCount}/${event.meterUnit ?? document.meterUnit}`
          if (meter !== activeMeter) { controls.push(`@meter(${event.meterCount},${event.meterUnit},size=18px)`); activeMeter = meter }
          if (event.tempo !== undefined && event.tempo !== activeTempo) { controls.push(`@tempo(${event.tempo},size=16px,font="M3N Numbers")`); activeTempo = event.tempo }
          // Native up members stack from the note outwards. Keep articulations
          // inside ornaments/fingerings, with expression marks outside both.
          const articulations: string[] = [], decorations: string[] = [], expressionMarks: string[] = []
          if (event.dynamic && event.dynamic !== dynamic) { expressionMarks.push(`@symbol(${quote(event.dynamic)},size=12px)`); dynamic = event.dynamic }
          if (event.prefix) expressionMarks.push('@text("sfz",size=13px)')
          for (const name of event.postfixes) {
            if (parseM3NGrace(name)) continue
            if (name === 'arp') continue
            if (name === 'tr' || name === 'fermata') decorations.push(`@symbol(${name},size=12px)`)
            else if (name === 'str') articulations.push('@symbol(accent,size=12px)')
            else if (name === 'tip') articulations.push('@symbol(staccato,size=4px)')
            else if (name === 'hold') articulations.push('@symbol(tenuto,size=7px)')
            else if (name === 'brk') articulations.push('@symbol(staccatissimo,size=7px)')
            else if (name === 'breath') decorations.push('@symbol(breath,size=10px)')
            else if (/^f[1-5]$/.test(name)) decorations.push(`@text(${quote(name.slice(1))},size=11px)`)
            else if (name === 'sfz') expressionMarks.push('@text("sfz",size=13px)')
            else warn(event, name)
          }
          for (const interval of document.intervals.filter(interval => interval.staff === staff && interval.start === event.sourceStart)) {
            if ((interval.kind === 'cresc' || interval.kind === 'decres') && interval.display === 'text') expressionMarks.push(`@text(${quote(interval.kind === 'cresc' ? 'cresc.' : 'dim.')},size=13px)`)
            if (interval.kind === 'accel' || interval.kind === 'rit') expressionMarks.push(`@text(${quote(`${interval.kind}. → ${interval.tempoTarget}`)},size=13px)`)
          }
          if (event.navigation.includes('segno')) expressionMarks.push('@symbol(segno,size=16px)')
          const marks = [...articulations, ...decorations, ...expressionMarks]
          const decorate = (expression: string) => {
            let value = expression
            const grace = event.postfixes.flatMap(value => {
              const parsed = parseM3NGrace(value)
              return parsed ? (parseM3NGroupPitches(parsed.pitchSource) ?? []).map(pitch => duration(`@note(${quote(pitchName(pitch, event.octaveShift))})`, 4 / 2 ** (parsed.depth + 2))) : []
            })
            if (grace.length) value = `@grace({${value}},{${grace.join(' ')}})`
            if (event.postfixes.includes('arp') && event.kind === 'chord') value = `@arp({${value}})`
            return marks.length ? `@up({${value}},${marks.join(',')})` : value
          }
          const children: string[] = []
          const content: string[] = [...controls]
          if (event.kind === 'tuplet' && event.tuplet) {
            event.pitches.forEach((pitch, slot) => {
              const expr = duration(`@note(${quote(pitchName(pitch, event.octaveShift))})`, event.tuplet!.unitBeats)
              const item = bind(slot === 0 ? decorate(expr) : expr, event, measureId, slot, `-n${slot + 1}`, true)
              content.push(item.expression); children.push(item.label)
            })
            const noteContent = content.splice(controls.length)
            content.push(`@tuplet({${noteContent.join(' ')}},${event.tuplet.numbase})`)
          } else {
            const base = event.kind === 'chord' ? `@up(${event.pitches.map(pitch => `@note(${quote(pitchName(pitch, event.octaveShift))})`).join(',')})` : `@note(${quote(pitchName(event.pitches[0] ?? '0', event.octaveShift))})`
            let remaining = event.beats
            let index = 0
            while (remaining > 1e-7) {
              let beats = remaining < 1 ? remaining : 1
              const fraction = remaining % 1
              if (index === 0 && remaining >= 1 && event.kind !== 'rest' && [0.5, 0.75, 0.875].some(value => Math.abs(value - fraction) < 1e-7)) beats = 1 + fraction
              const expr = duration(index === 0 || event.kind === 'rest' ? base : '@dash()', beats)
              const suffix = index === 0 ? '' : event.kind === 'rest' ? `-rest${index + 1}` : `-sustain${index + 1}`
              const item = bind(index === 0 ? decorate(expr) : expr, event, measureId, 0, suffix, index === 0 || event.kind === 'rest')
              content.push(item.expression); children.push(item.label)
              remaining -= beats; index += 1
            }
          }
          const first = children[0], last = children.at(-1)
          if (first && last) {
            for (const [level, text] of [event.chord, event.text, event.sectionLabel].entries()) {
              if (text) annotations[level]!.push(`@text(${quote(text)},size=14px,above=${first}${level === 2 ? ',weight=700' : ''})`)
            }
            endpointLabels.set(event, { first, last, children })
            if (!firsts.has(measureIndex)) firsts.set(measureIndex, first)
            lasts.set(measureIndex, last)
            if (previousTied) {
              const endpoints = endpointLabels.get(previousTied)
              const start = previousTied.tieFromTupletIndex === undefined
                ? previousTied.kind === 'chord' ? endpoints?.first : endpoints?.last
                : endpoints?.children[previousTied.tieFromTupletIndex]
              if (start) relations.push(`@tie(${start},${first})`)
            }
          }
          previousTied = event.tie ? event : undefined
          pieces.push(content.join(' '))
        }
        const next = staff === 'bass' ? melody[measureIndex + 1] : visibleMeasures[measureIndex + 1]
        const nextLine = breaksBefore(measureIndex + 1)
        const closesRepeat = structure.right === 'rptboth' || structure.right === 'rptend'
        const opensRepeat = structure.right === 'rptboth' || next?.left === 'rptstart'
        const type = closesRepeat ? opensRepeat && !nextLine ? 5 : 4 : structure.right === 'end' ? 2 : structure.right === 'dbl' ? 1 : 0
        const navigation = [...new Set([...(measure.navigation ?? []), ...measure.events.flatMap(event => event.navigation)].filter(name => name !== 'segno'))]
        const beforeBar = navigation.map(name => `@symbol(${name},size=${name === 'fine' ? 12 : 16}px)`).join(' ')
        let bar = `@bar(${type}${beforeBar ? `,before={${beforeBar}}` : ''})`
        if ((measure.repeatCount ?? 2) > 2) bar = `@up({${bar}},@text("×${measure.repeatCount}",size=13px))`
        // Within a system the opening repeat supplies the shared boundary.
        // Across an explicit break both systems need their own boundary mark.
        if (!((type === 0 || type === 1) && next?.left === 'rptstart' && !nextLine && !navigation.length && (measure.repeatCount ?? 2) <= 2)) pieces.push(bar)
        previousMeasure = structure
      })
      let endingStart = 0
      while (endingStart < visibleMeasures.length) {
        const ending = visibleMeasures[endingStart]?.ending
        if (!ending) { endingStart += 1; continue }
        let end = endingStart
        while (visibleMeasures[end + 1]?.ending === ending) end += 1
        const startLabel = firsts.get(endingStart), endLabel = lasts.get(end)
        const passes = [...ending.matchAll(/\d+/g)].map(match => Number(match[0]))
        if (startLabel && endLabel && passes.length) relations.push(`@volta(${startLabel},${endLabel},${passes.join(',')})`)
        endingStart = end + 1
      }
      const lyricArguments = staff === 'melody' ? rowNumbers.map(row => {
        const tokens = lyricTargets.map(target => {
          const data = target.lyrics.get(row)
          if (!data) return '@'
          const text = data.texts.join('') || '\u200B'
          return `{${text.replace(/[\\{}@-]/g, '\\$&')}}`
        }).join(' ')
        return quote(tokens)
      }) : []
      const underlines = rowNumbers.flatMap((row, rowIndex) => lyricTargets.flatMap((target, slot) => target.lyrics.get(row)?.underlined ? [`${rowIndex}:${slot}`] : []))
      const prefixes = rowNumbers.flatMap((row, rowIndex) => lyricTargets.flatMap((target, slot) => {
        const annotation = target.lyrics.get(row)?.annotation
        return annotation ? [[`${rowIndex}:${slot}`, annotation]] : []
      }))
      return `@voice({${pieces.join(' ')}},""${lyricArguments.length ? `,${lyricArguments.join(',')}` : ''}${underlines.length ? `,lyricunderlines=${quote(underlines.join(','))}` : ''}${prefixes.length ? `,lyricprefixes=${quote(JSON.stringify(Object.fromEntries(prefixes)))}` : ''})`
    }
    const voices = [renderVoice(melody, 'melody')]
    if (options.includeBass !== false && bass.some(measure => measure.events.length || measure.multiRest)) voices.push(renderVoice(bass, 'bass'))
    return voices.length > 1 ? `@voices(${voices.join(',')},connect="[-]",repeatconnect=true)` : voices[0]!
  }
  const header = [
    `@set(fontsize=22,lyricspacing="reserve",numberfont="M3N Numbers",font="serif")`,
    `@page(width=${options.width}px,height=${options.paged ? Math.floor(options.width * 277 / 190) : 0}px,top=32px,bottom=32px,left=32px,right=32px,gap=24px,fillRatio=0)`,
    `@head(center={${[document.title ? `@text(${quote(document.title)},size=32px,align=center)` : '', document.subtitle ? `@text(${quote(document.subtitle)},size=16px,align=center)` : ''].filter(Boolean).join(' ')}},right={${document.singer || document.composer ? `@text(${quote(document.singer || document.composer)},size=14px)` : ''}},left={{@key(${quote(keyName(document.key))},size=16px) @meter(${document.meterCount},${document.meterUnit},size=18px) ${document.hasExplicitTempo ? `@tempo(${document.tempo},size=16px,font="M3N Numbers")` : ''}}}${document.subtitle ? ',sidebelow=true' : ''}) @br()`,
  ]
  const parts = [...document.parts.values()].map((part, index) => voicesForPart(part.melody, part.bass, index))
  const intervals = document.intervals.map(interval => ({ ...interval }))
  for (const part of document.parts.values()) for (const staff of ['melody', 'bass'] as const) {
    const events = part[staff].flatMap(measure => measure.events)
    const legato = intervals.filter(interval => interval.kind === 'lg' && interval.staff === staff && events.some(event => event.sourceStart === interval.start)).sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
    for (let i = 1; i < legato.length; i++) {
      const before = legato[i - 1]!, after = legato[i]!
      const end = events.findIndex(event => event.sourceStart === before.endStart)
      if (end >= 0 && events[end + 1]?.sourceStart === after.start) {
        after.start = before.start
        before.kind = 'inst' // consumed by the next merged interval
      }
    }
  }
  for (const interval of intervals) {
    if (interval.kind !== 'lg' && interval.kind !== 'cresc' && interval.kind !== 'decres') continue
    const events = [...document.parts.values()].flatMap(part => part[interval.staff].flatMap(measure => measure.events)).filter(event => interval.start !== undefined && interval.endStart !== undefined && event.sourceStart >= interval.start && event.sourceStart <= interval.endStart)
    const first = events[0], last = events.at(-1)
    if (!first || !last) continue
    const start = endpointLabels.get(first)?.first
    const end = interval.kind === 'lg' && last.kind === 'chord' ? endpointLabels.get(last)?.first : endpointLabels.get(last)?.last
    if (!start || !end || interval.display === 'text') continue
    relations.push(interval.kind === 'lg' ? `@tie(${start},${end})` : `@dyn(${start},${end},${interval.kind === 'cresc' ? 24 : -24}${start === end ? ',single=true' : ''})`)
  }
  return { source: [...header, parts.join(' @br() '), ...relations, ...annotations.flat()].join('\n'), bindings, diagnostics, rows: rowNumbers }
}
