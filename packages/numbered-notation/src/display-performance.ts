import { alternativePerformance, scoreEventIds, type ScoreDocument } from '@m3n/notation'
import { lyricsByEvent, type LyricsByEvent, type LyricRowData } from './lyrics.js'

/** Expand keyed visits for absolute-pitch display, retaining playback IDs and lyrics. */
export function keyedDisplayPerformance(document: ScoreDocument) {
  const originalLyrics = lyricsByEvent(document)
  const originals = new Map([...scoreEventIds(document)].map(([event,id])=>[id,event]))
  const performance = alternativePerformance(document), lyrics: LyricsByEvent = new Map()
  for (const part of performance.parts.values()) for (const event of part.melody.flatMap(measure=>measure.events)) {
    const id = event.playbackId!, pass = Number(/-rend(\d+)$/.exec(id)?.[1] ?? 1)
    const original = originals.get(id.replace(/-rend\d+$/,''))
    const slots = new Map<number,Map<number,LyricRowData>>()
    for (const [slot,rows] of originalLyrics.get(original!) ?? []) {
      const data = [...rows.values()].find(row=>!row.passes || row.passes.has(pass))
      if (data) slots.set(slot,new Map([[0,{...data,annotation:undefined,passes:new Set([pass])}]]))
    }
    if (slots.size) lyrics.set(event,slots)
  }
  return {document:performance,lyrics}
}
