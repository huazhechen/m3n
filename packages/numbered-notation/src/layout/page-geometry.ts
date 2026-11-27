import { cacheScoreInkSeparation, inheritScoreHorizontalProxy } from './ink-separation.js'
import type { ScoreInk } from './geometry.js'
import type { ScorePageBlock } from './geometry.js'

export type ScorePageGeometry = {
  top: number; bottom: number; coreTop: number; coreBottom: number; music: boolean
  scale: number; gap?: number; edgeGap: number; before: number; resolved: boolean; sorted: boolean
  ink: ScoreInk[]; boundaryInk: ScoreInk[]; edgeInk: (ScoreInk & { gap: number })[]
}

const immutableGeometry = new WeakMap<ScorePageBlock, ScorePageGeometry>()
type GeometryVariant = { boundary:readonly ScoreInk[]; edges:readonly ScoreInk[]; key:string; value:ScorePageGeometry }
const sharedCandidateGeometry = new WeakMap<readonly ScoreInk[],GeometryVariant[]>()
const emptyInk:readonly ScoreInk[]=[]

/** Normalize once around the row baseline; identical page edges, cores and
 * primitive semantics are consumed by rendering and optimistic search. */
export function scorePageGeometry(block: ScorePageBlock, immutable = false): ScorePageGeometry {
  const saved = immutable ? immutableGeometry.get(block) : undefined
  if (saved) return saved
  const axis = block.baseline ?? 0
  const experiment=globalThis as {__m3nExperimentalRowReuse?:boolean;__m3nExperimentalWidthBin?:number}
  const share=immutable && experiment.__m3nExperimentalRowReuse && (experiment.__m3nExperimentalWidthBin ?? 0)>0 && Boolean(block.ink?.length)
  const boundary=block.boundaryInk ?? emptyInk,edges=block.edgeInk ?? emptyInk
  const key=share ? JSON.stringify([axis,Boolean(block.core),block.core?.top,block.core?.bottom,block.coreGapScale ?? 1,
    block.coreGapBefore,block.gapBefore ?? 0,Boolean(block.resolvedInk)].map(value=>typeof value==='number'
      ? Object.is(value,-0) ? '-0' : Number.isFinite(value) ? value : String(value) : value)) : undefined
  let variants=share ? sharedCandidateGeometry.get(block.ink!) : undefined
  const shared=key===undefined ? undefined : variants?.find(item=>item.key===key && item.boundary===boundary && item.edges===edges)
  if(shared){immutableGeometry.set(block,shared.value);return shared.value}
  // Immutable adapters already use baseline coordinates in the common case.
  // Keep their primitive identity (including shared boundary ink), while the
  // map below still gives the paginator private arrays for sorting.
  const borrow = immutable && axis === 0 && !Object.is(axis, -0)
  const shift = <T extends ScoreInk>(piece: T): T => borrow ? piece : ({ ...piece, top: piece.top - axis, bottom: piece.bottom - axis })
  const ink = (block.ink ?? []).map(shift), boundaryInk = (block.boundaryInk ?? []).map(shift), edgeInk = (block.edgeInk ?? []).map(shift)
  if (block.ink) inheritScoreHorizontalProxy(block.ink,ink,-axis)
  if (block.boundaryInk) inheritScoreHorizontalProxy(block.boundaryInk,boundaryInk,-axis)
  if (block.edgeInk) inheritScoreHorizontalProxy(block.edgeInk,edgeInk,-axis)
  for (const pieces of [ink, boundaryInk, edgeInk]) cacheScoreInkSeparation(pieces)
  let top = 0, bottom = 0
  for (const pieces of [ink, boundaryInk, edgeInk]) for (const piece of pieces) {
    top = Math.min(top, piece.top); bottom = Math.max(bottom, piece.bottom)
  }
  const value = { ink, boundaryInk, edgeInk, top, bottom, coreTop: block.core ? block.core.top - axis : top,
    coreBottom: block.core ? block.core.bottom - axis : bottom, music: Boolean(block.core),
    scale: block.coreGapScale ?? 1, gap: block.coreGapBefore, edgeGap: Math.max(0, ...edgeInk.map(piece => piece.gap)), before: block.gapBefore ?? 0,
    resolved: Boolean(block.resolvedInk), sorted: false }
  if (immutable) immutableGeometry.set(block, value)
  if(key!==undefined) {
    if(!variants){variants=[];sharedCandidateGeometry.set(block.ink!,variants)}
    variants.push({boundary,edges,key,value})
  }
  return value
}
