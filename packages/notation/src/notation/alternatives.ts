import type { ScoreDocument, ScoreLyricBlock, ScoreMeasure, ScoreEvent } from './score-document.js'
import { measurePlaybackPasses, playbackMeasureIndexes, orderedMeasureIndexes, parsePassRange } from './repeats.js'
import { scoreEventIds } from '../score-event-ids.js'
import { createScoreDiagnostic, type ScoreDiagnostic } from './diagnostics.js'
import type { M3NDocumentProjection } from './m3n-document.js'

export function alternativeMeasure(document: ScoreDocument, host: ScoreMeasure, pass: number) {
  return document.alternatives?.find(item => item.host === host && item.passes.includes(pass))?.measure ?? host
}

export function lyricMeasures(document: ScoreDocument, block: ScoreLyricBlock): ScoreMeasure[] {
  const pass = block.alternativePass ?? Number(block.range || 1)
  return [...document.parts.values()].flatMap(part => part.melody.filter(measure => measure.events.some(event =>
    (block.targetStart === undefined || block.targetStart <= event.sourceStart) && (block.targetEnd === undefined || event.sourceStart < block.targetEnd)))
    .map(host => {
      const selected=alternativeMeasure(document,host,pass)
      return selected!==host ? selected : {...host,events:host.events.filter(event=>(block.targetStart === undefined || block.targetStart <= event.sourceStart) && (block.targetEnd === undefined || event.sourceStart < block.targetEnd))}
    }))
}

export function alternativeLyricBlocks(document: ScoreDocument): ScoreLyricBlock[] {
  if (!document.alternatives?.length) return document.lyrics
  const passesByMeasure = measurePlaybackPasses(document.parts.get('score')?.melody ?? [])
  return document.lyrics.flatMap(block => {
    if (block.range) return [block]
    const passes = new Set([...document.parts.values()].flatMap(part => part.melody.filter(measure => measure.events.some(event => (block.targetStart === undefined || block.targetStart <= event.sourceStart) && (block.targetEnd === undefined || event.sourceStart < block.targetEnd))).flatMap(measure => [...(passesByMeasure.get(measure) ?? [1])])))
    return [...passes].map(pass=>({...block,sharedPasses:String(pass),alternativePass:pass}))
  })
}

export function validateAlternatives(document: ScoreDocument, projection: M3NDocumentProjection) {
  const diagnostics: ScoreDiagnostic[] = []
  const report = (start: number, end: number, message: string) => diagnostics.push(createScoreDiagnostic({code:'M3N_ALTERNATIVE', range:{start,end}, message}))
  const part = document.parts.get('score')
  if (!part) return diagnostics
  const passes = measurePlaybackPasses(part.melody)
  for (const phrase of projection.structure.sections.flatMap(section => section.phrases)) for (const row of phrase.alternatives ?? []) {
    const items = document.alternatives?.filter(item => item.sourceStart === row.start) ?? []
    if (row.passes.some(pass => !Number.isSafeInteger(pass) || pass > 256) || !Number.isSafeInteger(row.measure)) report(row.start,row.start+row.text.length,'替代旋律的遍次须为 1–256，小节号须为有效整数')
    const bars = row.tokens.filter(token => token.kind === 'bar')
    const writtenBars = bars.length + (row.tokens.some(token => token.start > (bars.at(-1)?.end ?? -1) && ['note','group'].includes(token.kind)) ? 1 : 0)
    if (!items.length || writtenBars > items.length) report(row.start,row.start+row.text.length,'替代旋律的小节号或范围超出当前 N: 乐句')
    if (!row.tokens.some(token => token.kind === 'note' || token.kind === 'group')) report(row.start,row.start+row.text.length,'替代旋律不能为空')
    if (row.tokens.some(token => token.kind === 'attribute' && !/^(?:lg|cresc(?:=text)?|decres(?:=text)?|dim(?:=text)?|8va|8vb|inst|\/(?:lg|cresc|decres|dim|8va|8vb|inst)?|p{1,3}|f{1,3}|mf|mp|tr|prall|arp|str|brk|tip|hold|fermata|breath|f[1-5]|sfz|(?:ac|ap)\([^}]*\))$/.test(token.content ?? '')) || items.some(item => item.measure.left || item.measure.right && !['single','dbl','end'].includes(item.measure.right) || item.measure.multiRest)) {
      report(row.start,row.start+row.text.length,'替代旋律不支持结构反复、导航、谱中设置或多小节休止')
    }
    for (const item of items) {
      const first = items[0]?.host.events[0], current = item.host.events[0]
      if (first && current && (first.key !== current.key || first.tempo !== current.tempo || first.meterCount !== current.meterCount || first.meterUnit !== current.meterUnit || first.octaveShift !== current.octaveShift)) report(row.start,row.start+row.text.length,'替代旋律跨越了设置变化，请拆成独立的替代行')
      const sum = (events: ScoreEvent[]) => events.reduce((total,event) => total+event.beats,0)
      if (Math.abs(sum(item.measure.events)-sum(item.host.events))>1e-8) report(row.start,row.start+row.text.length,'替代旋律与对应主旋律小节的总时值必须相同')
      if (row.passes.some(pass => !(passes.get(item.host)?.has(pass)))) report(row.start,row.start+row.text.length,'替代旋律的遍次超出该小节的实际演奏次数')
      if ((document.alternatives ?? []).some(other => other !== item && other.host === item.host && other.passes.some(pass => item.passes.includes(pass)))) report(row.start,row.start+row.text.length,'同一小节、同一遍次不能重复指定替代旋律')

    }
    const first = items[0], last = items.at(-1)
    if (first && last) {
      const index = part.melody.indexOf(first.host)
      if (part.melody[index-1]?.events.at(-1)?.tie || last.host.events.at(-1)?.tie || last.measure.events.at(-1)?.tie) report(row.start,row.start+row.text.length,'替代旋律边界暂不支持跨小节延音，请把完整延音写入同一替代范围')
      if (document.intervals.some(interval => interval.staff==='melody' && interval.start!==undefined && interval.end!==undefined &&
        interval.start <= (last.host.events.at(-1)?.sourceStart ?? -1) && interval.end >= (first.host.events[0]?.sourceStart ?? Infinity) &&
        (interval.start < (first.host.events[0]?.sourceStart ?? 0) || interval.end > (last.host.events.at(-1)?.sourceEnd ?? 0)))) report(row.start,row.start+row.text.length,'替代范围不能截断主旋律的跨小节区间，请在替代范围内分别书写完整乐句')
    }
  }
  return diagnostics
}

/** Unfold alternatives or section-local houses for playback; the printed document stays compact. */
export function alternativePerformance(document: ScoreDocument): ScoreDocument {
  const ids = scoreEventIds(document)

  const intervals: ScoreDocument['intervals'] = []
  const copies: Array<{source:ScoreEvent;event:ScoreEvent;staff:'melody'|'bass'}> = []
  const parts = new Map<string, {melody:ScoreMeasure[];bass:ScoreMeasure[]}>()
  const sourceStride = Math.max(1, ...[...ids.keys()].map(event => event.sourceEnd)) + 1
  let occurrence = 0
  for (const [name,part] of document.parts) {
    const indexes = document.order ? orderedMeasureIndexes(part.melody, document.order) : playbackMeasureIndexes(part.melody)
    const visits = new Map<ScoreMeasure,number>()
    const output = {melody:[] as ScoreMeasure[],bass:[] as ScoreMeasure[]}
    for (const index of indexes) {
      const host = part.melody[index]!
      const visit = (visits.get(host) ?? 0)+1; visits.set(host,visit)
      const pass = host.ending ? [...parsePassRange(host.ending)][visit-1] ?? visit : visit
      const selected = alternativeMeasure(document,host,pass)
      const offset = ++occurrence * sourceStride
      const clone = (measure:ScoreMeasure|undefined, staff:'melody'|'bass'):ScoreMeasure => ({events:(measure?.events ?? []).map((event,index)=>{
        const copy={...event,playbackId:`${ids.get(event)}${pass>1?`-rend${pass}`:''}`,sourceStart:event.sourceStart+offset,sourceEnd:event.sourceEnd+offset,navigation:[]}
        if (staff==='melody' && index===0 && selected!==host) copy.dynamic ??= host.events[0]?.dynamic
        copies.push({source:event,event:copy,staff});return copy
      }),...(measure?.multiRest?{multiRest:measure.multiRest}:{})})
      output.melody.push(clone(selected,'melody')); output.bass.push(clone(part.bass[index],'bass'))
    }
    parts.set(name,output)
  }
  const sourceIntervals=[...document.intervals,...new Set((document.alternatives ?? []).flatMap(item=>item.intervals))]
  for (const interval of sourceIntervals) {
    const records=copies.filter(copy=>copy.staff===interval.staff)
    for (const [index,first] of records.entries()) {
      if (first.source.sourceStart!==interval.start) continue
      let previous=-Infinity
      for (const last of records.slice(index)) {
        if (last.source.sourceStart<previous || last.source.sourceStart>(interval.endStart ?? -1)) break
        previous=last.source.sourceStart
        if (last.source.sourceStart!==interval.endStart) continue
        intervals.push({...interval,id:intervals.length,start:first.event.sourceStart,end:last.event.sourceEnd,endStart:last.event.sourceStart})
        break
      }
    }
  }
  // Copy metadata without evaluating lazy fields such as a source getter.
  // Performance compilation consumes the semantic model only.
  const performance = Object.defineProperties({}, Object.getOwnPropertyDescriptors(document)) as ScoreDocument
  return Object.assign(performance, {alternatives:undefined,order:undefined,sections:undefined,parts,intervals,lyrics:[]})
}
