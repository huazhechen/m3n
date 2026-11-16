import { DefaultTextMeasurer, type TextMeasurer } from '@m3n/jpfun'
import {
  resolveScorePitches, displayedTempo, parseM3NGrace, parseM3NGroupPitches, scoreCreditLines, scoreEventIds,
  measurePlaybackPasses, type ScoreDocument, type ScoreEvent, type ScoreMeasure, type ScoreAlternative,
} from '@m3n/notation'
import { lyricsByEvent, type LyricRowData } from './lyrics.js'
import { fixedDoPitch, fixedDoGrace, transposedKey } from './fixed-do.js'
import { sustainContinuations } from './sustains.js'

function tempoMark(qpm: number, count: number, unit: number) {
  const display = displayedTempo(qpm, count, unit)
  return `@tempo(${qpm},size=16px,font="M3N Numbers",unit=${display.unit},dots=${display.dots})`
}

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
  sustain: boolean
  passes?: number[]
}
export type ProjectedScore = { source: string; bindings: Map<string, EventBinding>; diagnostics: NumberedNotationDiagnostic[]; rows: number[] }
export type ProjectionOptions = { textMeasurer?: TextMeasurer; width: number; paged: boolean; includeBass?: boolean; measureNumbers?: boolean; fixedDo?: boolean; transpose?: number; tempoScale?: number; pageMargin?: number; systemGap?: number }
const quote = (value: string) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
const pitchName = (token: string, shift = 0) => {
  const match = /^([0-7])([#b=]*)([ed]*)$/.exec(token)
  if (!match) return '0'
  const octave = [...(match[3] ?? '')].reduce((n, value) => n + (value === 'e' ? 1 : -1), shift)
  return `${match[2]?.replaceAll('=', 'n') ?? ''}${match[1]}${octave > 0 ? "'".repeat(octave) : ','.repeat(-octave)}`
}

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
  const continuations = sustainContinuations(document, lyrics)
  const bindings = new Map<string, EventBinding>()
  const diagnostics: NumberedNotationDiagnostic[] = []
  const rowNumbers = [...new Set([...lyrics.values()].flatMap(slots => [...slots.values()].flatMap(rows => [...rows.keys()])))].sort((a, b) => a - b)
  const endpointLabels = new Map<ScoreEvent, { first: string; last: string; children: string[]; tieStart: string; legatoEnd: string }>()
  const relations: string[] = []
  const parentheses: string[] = []
  // Registered after musical relations, from inner to outer: harmony, directions, section names.
  const annotations: string[][] = [[], [], []]
  // Explicit sections and phrases are local height paragraphs. A named
  // training exercise also starts a paragraph; automatic wraps do not.
  const paragraphOf = (position: number) => document.paragraphs?.find(range => range.start <= position && position < range.end)?.id ?? '0'
  let serial = 0
  let measureNumber = 0
  const warn = (event: ScoreEvent, value: string) => diagnostics.push({ code: 'NUMBERED_UNSUPPORTED_MARK', message: `简谱尚不支持标记 ${value}`, severity: 'warning', sourceStart: event.sourceStart, sourceEnd: event.sourceEnd })

  const voicesForPart = (melody: ScoreMeasure[], bass: ScoreMeasure[], partIndex: number) => {
    const playbackPasses = document.alternatives?.length ? measurePlaybackPasses(melody) : new Map<ScoreMeasure, Set<number>>()
    const renderVoice = (measures: ScoreMeasure[], staff: 'melody' | 'bass', alternative?: ScoreAlternative, hostIndex = 0): string => {
      const resolvedPitches = options.fixedDo ? resolveScorePitches(measures) : undefined
      let pieces: string[] = []
      const paragraphs: string[] = []
      let paragraph: string | undefined
      const flushParagraph = () => {
        if (pieces.length) paragraphs.push(`@spacing({${pieces.join(' ')}},group=${quote(paragraph ?? '0')})`)
        pieces = []
      }
      const lyricTargets: EventBinding[] = []
      const firsts = new Map<number, string>(), lasts = new Map<number, string>()
      let activeKey = document.key, activeTempo = document.tempo
      let activeMeter = `${document.meterCount}/${document.meterUnit}`
      const precedingAlternative = alternative && document.alternatives?.find(item=>item.sourceStart===alternative.sourceStart && item.host===melody[hostIndex-1])
      const precedingEvent = precedingAlternative?.measure.events.at(-1)
      let previousTied: ScoreEvent | undefined = precedingEvent?.tie ? precedingEvent : undefined
      let previousMeasure: ScoreMeasure | undefined
      let dynamic = ''
      let pendingBarNumber: number | undefined
      const numberBar = (bar: string, number: number) => `@up({${bar}},@text(${quote(String(number))},size=10px))`
      const bind = (expression: string, event: ScoreEvent | undefined, measureId: string, slot: number, suffix = '', lyricTarget = false) => {
        const xmlId = event ? ids.get(event)! : `m3n-rest-${partIndex + 1}-${serial}`
        const label = `m${++serial}`
        const visualId = `${xmlId}${suffix}`
        const binding: EventBinding = { label, xmlId, visualId, measureId, staff, event, slot, passes: alternative?.passes ?? (staff==='melody' && document.alternatives?.length && event ? [...(playbackPasses.get(melody.find(measure=>measure.events.includes(event))!) ?? [1])].filter(pass=>!document.alternatives?.some(item=>item.host.events.includes(event)&&item.passes.includes(pass))) : undefined), lyrics: suffix.includes('sustain') ? new Map() : lyrics.get(event!)?.get(slot) ?? new Map(), sustain: suffix.includes('sustain') || continuations.has(event!) }
        bindings.set(label, binding)
        // Native dashes do not consume a lyric slot; their empty domain slots
        // stay in the binding without shifting lyrics on following notes.
        if (lyricTarget && staff === 'melody' && !continuations.has(event!)) lyricTargets.push(binding)
        return { expression: `${expression}@${label}`, label }
      }
      const visibleMeasures = [...measures]
      while (visibleMeasures.length && !visibleMeasures.at(-1)?.events.length && !visibleMeasures.at(-1)?.multiRest) visibleMeasures.pop()
      const breaksBefore = (index: number) => index > 0 && Boolean(
        visibleMeasures[index]?.breakBefore || visibleMeasures[index - 1]?.breakAfter
        || melody[index]?.breakBefore || melody[index - 1]?.breakAfter
        || (visibleMeasures[index]?.events.some(event => event.sectionLabel) || melody[index]?.events.some(event => event.sectionLabel)),
      )
      visibleMeasures.forEach((measure, measureIndex) => {
        // Explicit accidental reminders carry their full pitch into jpFun;
        // only redundant glyphs at the same degree/octave are hidden.
        const accidentals = new Map<string, string>()
        const noteExpression = (pitch: string, shift: number, absolute?: string) => {
          if (options.fixedDo && pitch !== '0' && absolute) {
            const native = fixedDoPitch(absolute, options.transpose)
            return `@note(${quote(native)}${native.startsWith('n') ? ',showacc=false' : ''})`
          }
          const native = pitchName(pitch, shift)
          const match = /^([#bn]+)([1-7][',]*)$/.exec(native)
          let repeated = false
          if (match) {
            const offset = [...match[1]!].reduce((sum, value) => value === 'n' ? 0 : sum + (value === '#' ? 1 : -1), 0)
            const value = String(offset)
            repeated = accidentals.get(match[2]!) === value
            accidentals.set(match[2]!, value)
          }
          return `@note(${quote(native)}${repeated ? ',showacc=false' : ''})`
        }
        const measureId = `m3n-measure-${partIndex + 1}-${hostIndex + measureIndex + 1}`
        const melodyMeasure = melody[measureIndex]
        const firstEvent = melodyMeasure?.events[0] ?? measure.events[0]
        const nextParagraph = firstEvent ? `${partIndex}:${paragraphOf(firstEvent.sourceStart)}` : paragraph
        if (paragraph !== nextParagraph) { flushParagraph(); paragraph = nextParagraph }
        // Parallel voices must share every bar anchor, including the opening repeat.
        // B: bars are alignment syntax; structural repetition belongs to N:.
        const structure = staff === 'bass' ? melodyMeasure ?? measure : measure
        if (breaksBefore(measureIndex)) pieces.push(measure.events.some(event => event.sectionLabel) || melody[measureIndex]?.events.some(event => event.sectionLabel) ? '@br(gap=12)' : '@br()')
        const sectionLabel = measure.events.find(event => event.sectionLabel)?.sectionLabel
        if (sectionLabel && !measure.events.find(event => event.sectionLabel)?.sectionLabelBreakAfter) pieces.push(`@text(${quote(sectionLabel)},size=14px,weight=700,frame=true)`)
        if (structure.left === 'rptstart' && (breaksBefore(measureIndex) || previousMeasure?.right !== 'rptend' && previousMeasure?.right !== 'rptboth')) {
          pieces.push(pendingBarNumber === undefined ? '@bar(3)' : numberBar('@bar(3)', pendingBarNumber))
          pendingBarNumber = undefined
        }
        // Navigation belongs to a measure, even when its directive follows a note.
        // Zero-time Segno stays on the music axis and wraps with the first event.
        if (measure.navigation?.includes('segno') || measure.events.some(event => event.navigation.includes('segno'))) pieces.push('@symbol(segno,size=16px)')
        if (measure.multiRest) {
          const item = bind(`@rest(${measure.multiRest})`, undefined, measureId, 0)
          pieces.push(item.expression)
          firsts.set(measureIndex, item.label); lasts.set(measureIndex, item.label)
        }
        const measureStart = pieces.length
        for (const event of measure.events) {
          const eventParagraph = `${partIndex}:${paragraphOf(staff === 'bass' ? firstEvent?.sourceStart ?? event.sourceStart : event.sourceStart)}`
          if (paragraph !== eventParagraph) { flushParagraph(); paragraph = eventParagraph }
          const controls: string[] = []
          if (!options.fixedDo && event.key !== activeKey) { accidentals.clear(); controls.push(`@key(${quote(transposedKey(event.key, options.transpose))},size=16px)`); activeKey = event.key }
          const meter = `${event.meterCount ?? document.meterCount}/${event.meterUnit ?? document.meterUnit}`
          if (meter !== activeMeter) { controls.push(`@meter(${event.meterCount},${event.meterUnit},size=18px)`); activeMeter = meter }
          if (event.tempo !== undefined && event.tempo !== activeTempo) { controls.push(tempoMark(event.tempo * (options.tempoScale ?? 1), event.meterCount ?? document.meterCount, event.meterUnit ?? document.meterUnit)); activeTempo = event.tempo }
          // Native up members stack from the note outwards. Keep articulations
          // inside ornaments/fingerings, with expression marks outside both.
          const articulations: string[] = [], decorations: string[] = [], expressionMarks: string[] = []
          if (event.dynamic && event.dynamic !== dynamic) { expressionMarks.push(`@symbol(${quote(event.dynamic)},size=12px)`); dynamic = event.dynamic }
          if (event.prefix) expressionMarks.push('@text("sfz",size=13px)')
          for (const name of event.postfixes) {
            if (parseM3NGrace(name)) continue
            if (name === 'arp') continue
            if (name === 'tr' || name === 'prall' || name === 'fermata') decorations.push(`@symbol(${name},size=12px)`)
            else if (name === 'str') articulations.push('@symbol(accent,size=12px)')
            else if (name === 'tip') articulations.push('@symbol(staccatissimo,size=7px)')
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
          const marks = [...articulations, ...decorations, ...expressionMarks]
          const decorate = (expression: string) => {
            let value = expression
            const grace = event.postfixes.flatMap(value => {
              const parsed = parseM3NGrace(value)
              if (!parsed) return []
              return (parseM3NGroupPitches(parsed.pitchSource) ?? []).map(pitch => {
                const native = options.fixedDo ? fixedDoGrace(pitch, event.key, event.octaveShift, options.transpose) : pitchName(pitch, event.octaveShift)
                return duration(`@note(${quote(native)}${options.fixedDo && native.startsWith('n') ? ',showacc=false' : ''})`, 4 / 2 ** (parsed.depth + 2))
              })
            })
            // Articulations belong to the main note. A leading grace block sits
            // beside it, so stacking these marks above the entire block adds
            // unnecessary height. Grace forwards the main note's shoulder port.
            if (grace.length && articulations.length) value = `@up({${value}},${articulations.join(',')})`
            if (grace.length) value = `@grace({${value}},{${grace.join(' ')}})`
            if (event.postfixes.includes('arp') && event.kind === 'chord') value = `@arp({${value}})`
            const outerMarks = grace.length ? [...decorations, ...expressionMarks] : marks
            return outerMarks.length ? `@up({${value}},${outerMarks.join(',')})` : value
          }
          const children: string[] = []
          const content: string[] = [...controls]
          if (event.kind === 'tuplet' && event.tuplet) {
            event.pitches.forEach((pitch, slot) => {
              const expr = duration(noteExpression(pitch, event.octaveShift, resolvedPitches?.get(event)?.[slot]), event.tuplet!.unitBeats)
              const item = bind(slot === 0 ? decorate(expr) : expr, event, measureId, slot, `-n${slot + 1}`, true)
              content.push(item.expression); children.push(item.label)
            })
            const noteContent = content.splice(controls.length)
            content.push(`@tuplet({${noteContent.join(' ')}},${event.tuplet.numbase})`)
          } else {
            const base = continuations.has(event) ? '@dash()' : event.kind === 'chord' ? `@up(${event.pitches.map((pitch, slot) => noteExpression(pitch, event.octaveShift, resolvedPitches?.get(event)?.[slot])).join(',')})` : noteExpression(event.pitches[0] ?? '0', event.octaveShift, resolvedPitches?.get(event)?.[0])
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
            for (const [level, text] of [event.chord, event.text].entries()) {
              if (text) annotations[level]!.push(`@text(${quote(text)},size=14px,above=${first}${level === 2 ? ',weight=700' : ''}${level > 0 ? ',local=true' : ''})`)
            }
            // A section heading followed by {br} stays above its first music
            // as a native local attachment, including page breaks and lyrics.
            if (event.sectionLabel && event.sectionLabelBreakAfter) annotations[2]!.push(`@text(${quote(event.sectionLabel)},size=14px,weight=700,frame=true,above=${first},local=true,linestart=true)`)
            const head = continuations.get(event)
            const tieStart = head ? endpointLabels.get(head)!.tieStart : event.tieFromTupletIndex === undefined ? first : children[event.tieFromTupletIndex]!
            // Legato ends on the last pitched glyph, even when its source
            // interval includes sustain dashes. Tuplets keep their last note.
            const legatoEnd = head ? endpointLabels.get(head)!.legatoEnd
              : event.kind === 'tuplet' ? children[event.pitches.findLastIndex(pitch => pitch !== '0')] ?? last : first
            endpointLabels.set(event, { first, last, children, tieStart, legatoEnd })
            if (!firsts.has(measureIndex)) firsts.set(measureIndex, first)
            lasts.set(measureIndex, last)
            if (previousTied && !head) {
              const endpoints = endpointLabels.get(previousTied)
              // A sustain dash extends the duration, but the tie starts on the
              // pitched glyph. Tuplets still select their last pitched child.
              const start = endpoints?.tieStart
              if (start) relations.push(`@tie(${start},${first})`)
            }
          }
          previousTied = event.tie ? event : undefined
          pieces.push(content.join(' '))
        }
        if (alternative) {
          const first = firsts.get(measureIndex), last = lasts.get(measureIndex)
          if (first && last) parentheses.push(`@paren(${first},${last})`)
          // The usual second-pass alternative needs no separate pass heading.
          // Distinguish other lanes inline without adding an annotation row.
          const siblings = document.alternatives?.filter(item => item.host === alternative.host) ?? []
          if (first && !precedingAlternative && (siblings.length > 1 || alternative.passes.join(',') !== '2')) {
            pieces.splice(measureStart, 0, `@text(${quote(alternative.passes.join('.')+'.')},size=12px)`)
          }
        } else if (staff==='melody') {
          const replacements = document.alternatives?.filter(item=>item.host===measure) ?? []
          if (replacements.length) {
            let main = pieces.splice(measureStart).join(' ')
            for (const replacement of [...replacements].reverse()) main = `@ossia({${main}},{${renderVoice([replacement.measure],'melody',replacement,measureIndex)}},lane=${quote(replacement.passes.join(','))})`
            pieces.push(main)
          }
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
        const sharedOpening = (type === 0 || type === 1) && next?.left === 'rptstart' && !nextLine && !navigation.length && (measure.repeatCount ?? 2) <= 2
        if (staff === 'melody' && !alternative) {
          const number = measureNumber + 1
          measureNumber += measure.multiRest ?? 1
          if (options.measureNumbers) {
            if (sharedOpening) pendingBarNumber = number
            else bar = numberBar(bar, number)
          }
        }
        if (!alternative && !sharedOpening) pieces.push(bar)
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
      flushParagraph()
      return `@voice({${paragraphs.join(' ')}},""${lyricArguments.length ? `,${lyricArguments.join(',')},compactlyrics=true` : ''}${underlines.length ? `,lyricunderlines=${quote(underlines.join(','))}` : ''}${prefixes.length ? `,lyricprefixes=${quote(JSON.stringify(Object.fromEntries(prefixes)))}` : ''})`
    }
    const voices = [renderVoice(melody, 'melody')]
    if (options.includeBass !== false && bass.some(measure => measure.events.length || measure.multiRest)) voices.push(renderVoice(bass, 'bass'))
    return voices.length > 1 ? `@voices(${voices.join(',')},connect="[-]",repeatconnect=true)` : voices[0]!
  }
  const headingText = (text: string, size: number, weight: number) => {
    const measurer=options.textMeasurer ?? new DefaultTextMeasurer()
    const available=options.width-2*(options.pageMargin ?? 32)-2
    const lines:string[]=[]
    let line=''
    for (const char of text) {
      if (line && measurer.measureText(line+char,{fontSize:size,fontFamily:'serif',fontWeight:weight}).w>available) {
        const boundary=Math.max(line.lastIndexOf(' '),line.lastIndexOf('('),line.lastIndexOf('（'))
        if (boundary>line.length/3) { lines.push(line.slice(0,boundary).trimEnd()); line=line.slice(boundary+(line[boundary]===' '?1:0))+char }
        else {lines.push(line.trimEnd());line=char.trimStart()}
      } else line+=char
    }
    if(line)lines.push(line.trimEnd())
    return lines.join('\n')
  }
  const headings = [
    document.title ? `@text(${quote(headingText(document.title,32,700))},size=32px,align=center,weight=700)` : '',
    document.subtitle ? `@text(${quote(headingText(document.subtitle,16,400))},size=16px,align=center)` : '',
  ].filter(Boolean).join(' ')
  const creditLines = scoreCreditLines(document).map(line => {
    const colon = line.indexOf('：')
    return { label: line.slice(0, colon + 1), name: line.slice(colon + 1) }
  })
  // Two native multiline text cells share their measured maximum widths.
  const credits = creditLines.length ? `{${[
    `@text(${quote(creditLines.map(credit => credit.label).join('\n'))},size=14px,lineheight=1.5,align=left)`,
    `@text(${quote(creditLines.map(credit => credit.name).join('\n'))},size=14px,lineheight=1.5,align=right)`,
  ].join(' ')}}` : ''
  const signatures = [
    `@key(${quote(options.fixedDo ? 'C4' : transposedKey(document.key, options.transpose))},size=16px)`,
    `@meter(${document.meterCount},${document.meterUnit},size=18px)`,
    document.hasExplicitTempo ? tempoMark(document.tempo * (options.tempoScale ?? 1), document.meterCount, document.meterUnit) : '',
  ].filter(Boolean).join(' ')
  const orderLines: string[][] = []
  if (document.order) {
    const available = options.width - 2 * (options.pageMargin ?? 32)
    const measure = (text: string) => [...text].reduce((sum, char) => sum + (char.codePointAt(0)! > 127 ? 16 : 12), 0)
    let line: string[] = [], used = 100
    for (const name of document.order.filter(Boolean)) {
      const addition = measure(name) + 11 + (line.length ? 24 : 0)
      if (used + addition > available && line.length) {
        orderLines.push(line)
        line = []; used = 24
      }
      line.push(name); used += addition
    }
    if (line.length) orderLines.push(line)
  }
  const header = [
    `@set(fontsize=22,lyricspacing="reserve",numberfont="M3N Numbers",font="serif")`,
    `@page(width=${options.width}px,height=${options.paged ? Math.floor(options.width * 277 / 190) : 0}px,top=${options.pageMargin ?? 32}px,bottom=${options.pageMargin ?? 32}px,left=${options.pageMargin ?? 32}px,right=${options.pageMargin ?? 32}px,gap=${options.systemGap ?? 24}px,fillRatio=0)`,
    `@head(center={${headings}},right={${credits}},left={{${signatures}}},sidebelow=true,itemgap=16px${options.width < 600 ? ',sidestacked=true' : ''}) @br()`,
    ...orderLines.map((line, index) => `@head(left={{@text(${quote(index ? '→' : '演奏顺序：')},size=16px) ${line.map((name, i) => `${i ? '@text("→",size=16px) ' : ''}@text(${quote(name)},size=16px,weight=700,frame=true)`).join(' ')} }},itemgap=4px) @br()`),
  ]
  const parts = [...document.parts.values()].map((part, index) => voicesForPart(part.melody, part.bass, index))
  for (const part of document.parts.values()) for (const staff of ['melody', 'bass'] as const) {
    const instrumental = document.intervals.filter(interval => interval.kind === 'inst' && interval.staff === staff)
    let start: string | undefined, end: string | undefined
    const flush = () => {
      if (start && end) parentheses.push(`@paren(${start},${end})`)
      start = end = undefined
    }
    for (const event of part[staff].flatMap(measure => measure.events)) {
      if (!instrumental.some(interval => interval.start !== undefined && interval.end !== undefined
        && event.sourceStart >= interval.start && event.sourceEnd <= interval.end)) { flush(); continue }
      const labels = endpointLabels.get(event)
      if (!labels) continue
      start ??= labels.first
      end = labels.last
    }
    flush()
  }
  // Explicit phrase boundaries remain distinct, including adjacent slurs.
  // Native arc clearance expects inner declarations before their outer slurs.
  const intervals = [...document.intervals, ...new Set((document.alternatives ?? []).flatMap(item=>item.intervals))].sort((a, b) => {
    if (a.kind !== 'lg' || b.kind !== 'lg') return Number(b.kind === 'lg') - Number(a.kind === 'lg')
    return ((a.endStart ?? 0) - (a.start ?? 0)) - ((b.endStart ?? 0) - (b.start ?? 0))
  })
  for (const interval of intervals) {
    if (interval.kind !== 'lg' && interval.kind !== 'cresc' && interval.kind !== 'decres') continue
    const events = [...document.parts.values()].flatMap(part => part[interval.staff].flatMap(measure => measure.events)).concat(interval.staff==='melody'?(document.alternatives ?? []).flatMap(item=>item.measure.events):[]).filter(event => interval.start !== undefined && interval.endStart !== undefined && event.sourceStart >= interval.start && event.sourceStart <= interval.endStart)
    const first = events[0], last = events.at(-1)
    if (!first || !last) continue
    const start = endpointLabels.get(first)?.first
    const end = interval.kind === 'lg' ? endpointLabels.get(last)?.legatoEnd : endpointLabels.get(last)?.last
    if (!start || !end || interval.display === 'text') continue
    relations.push(interval.kind === 'lg' ? `@tie(${start},${end})` : `@dyn(${start},${end},${interval.kind === 'cresc' ? 24 : -24}${start === end ? ',single=true' : ''})`)
  }
  return { source: [...header, parts.join(' @br() '), ...relations, ...parentheses, ...annotations.flat()].join('\n'), bindings, diagnostics, rows: rowNumbers }
}
