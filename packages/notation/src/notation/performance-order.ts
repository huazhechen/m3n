import type { ScoreDocument, ScoreMeasure, ScoreEvent } from './score-document.js'
import { playbackMeasureIndexes, orderedMeasureVisits, parsePassRange } from './repeats.js'
import { sectionEntryKey, sectionVisitKey } from './section-keys.js'
import { scoreEventIds } from '../score-event-ids.js'

/** Unfold repeats, section-local houses and keyed visits for playback; the printed document stays compact. */
export function unfoldScorePerformance(document: ScoreDocument): ScoreDocument {
  const ids = scoreEventIds(document)

  const intervals: ScoreDocument['intervals'] = []
  const copies: Array<{source:ScoreEvent;event:ScoreEvent;staff:'melody'|'bass'}> = []
  const parts = new Map<string, {melody:ScoreMeasure[];bass:ScoreMeasure[]}>()
  const sourceStride = Math.max(1, ...[...ids.keys()].map(event => event.sourceEnd)) + 1
  let occurrence = 0
  for (const [name,part] of document.parts) {
    const itinerary = document.order ? orderedMeasureVisits(part.melody, document.order)
      : playbackMeasureIndexes(part.melody).map(index => ({ index, orderIndex: -1 }))
    const measureVisits = new Map<ScoreMeasure,number>()
    const output = {melody:[] as ScoreMeasure[],bass:[] as ScoreMeasure[]}
    for (const { index, orderIndex } of itinerary) {
      const host = part.melody[index]!
      const targetKey = document.orderKeys?.[orderIndex]
      const octaveOffset = (document.orderKeyOctaves?.[orderIndex] ?? 4) - 4
      const entryKey = host.sectionName ? sectionEntryKey(document, host.sectionName) : document.key
      const visit = (measureVisits.get(host) ?? 0)+1; measureVisits.set(host,visit)
      const pass = host.ending ? [...parsePassRange(host.ending)][visit-1] ?? visit : visit
      const offset = ++occurrence * sourceStride
      const clone = (measure:ScoreMeasure|undefined, staff:'melody'|'bass'):ScoreMeasure => ({events:(measure?.events ?? []).map((event)=>{
        const copy={...event,octaveShift:event.octaveShift+octaveOffset,key:targetKey ? sectionVisitKey(event.key,entryKey,targetKey) : event.key,playbackId:`${ids.get(event)}${pass>1?`-rend${pass}`:''}`,sourceStart:event.sourceStart+offset,sourceEnd:event.sourceEnd+offset,navigation:[]}
        copies.push({source:event,event:copy,staff});return copy
      }),...(measure?.multiRest?{multiRest:measure.multiRest}:{}),...(measure?.multiRestState?{multiRestState:{...measure.multiRestState,
        key:targetKey ? sectionVisitKey(measure.multiRestState.key,entryKey,targetKey) : measure.multiRestState.key}}:{})})
      const melody = clone(host,'melody'), bass = clone(part.bass[index],'bass')
      if (orderIndex >= 0) { melody.orderIndex = orderIndex; bass.orderIndex = orderIndex }
      output.melody.push(melody); output.bass.push(bass)
    }
    parts.set(name,output)
  }
  const sourceIntervals = document.intervals
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
  return Object.assign(performance, {order:undefined,orderKeys:undefined,orderKeyOctaves:undefined,sections:undefined,parts,intervals,lyrics:[]})
}
