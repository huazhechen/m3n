import type { ScoreInk } from './geometry.js'
import { cacheScoreHorizontalProxy } from './ink-separation.js'

const binnedSources = new WeakMap<readonly ScoreInk[], { size: number; ink: ScoreInk[] }>()
const complements = new WeakMap<readonly ScoreInk[], WeakMap<readonly ScoreInk[], ScoreInk[]>>()
const quantizedTransforms = new WeakMap<readonly ScoreInk[], Map<string, ScoreInk[]>>()
const emptyTransform:ScoreInk[]=[]

function candidateRight(left:number,right:number):number {
  const bin=(globalThis as {__m3nExperimentalWidthBin?:number}).__m3nExperimentalWidthBin ?? 0
  const width=right-left
  return bin>0 && Number.isFinite(width) && width>=bin ? left+Math.round(width/bin)*bin : right
}

/** Candidate-only templates may share vertical geometry across spacing tiers.
 * All musical identities and non-spacing context remain in the key. */
export function scoreWidthProxyKey(tier: string | number, ...context: unknown[]): string {
  const shared = (globalThis as {__m3nExperimentalTierReuse?:boolean}).__m3nExperimentalTierReuse
  return JSON.stringify([shared ? null : tier, ...context])
}

/** An aggregate bound is already one rectangle. Binning it would allocate an
 * entire row of boxes and taking its first bin would truncate the bound. */
export function proxyScoreWidthBounds<T extends ScoreInk>(piece: T, left: number, right: number, nextLeft: number, nextRight: number): T {
  nextRight=candidateRight(nextLeft,nextRight)
  const scale = right > left ? (nextRight - nextLeft) / (right - left) : 1
  return { ...piece, left: nextLeft + (piece.left - left) * scale,
    right: nextLeft + (piece.right - left) * scale }
}

/** Conservative horizontal bins for candidate geometry only. */
function candidateInk<T extends ScoreInk>(source: readonly T[]): readonly T[] {
  const size = (globalThis as { __m3nExperimentalInkBin?: number }).__m3nExperimentalInkBin ?? 0
  if (!(size > 0)) return source
  const saved = binnedSources.get(source)
  if (saved?.size === size) return saved.ink as T[]
  const bins = new Map<number, T>(), unbounded: T[] = []
  for (const piece of source) {
    if (!Number.isFinite(piece.left) || !Number.isFinite(piece.right) || piece.right <= piece.left) { unbounded.push(piece); continue }
    for (let bin = Math.floor(piece.left / size); bin < Math.ceil(piece.right / size); bin++) {
      const prior = bins.get(bin)
      if (prior) { prior.top = Math.min(prior.top, piece.top); prior.bottom = Math.max(prior.bottom, piece.bottom) }
      else bins.set(bin, { ...piece, left: bin * size, right: (bin + 1) * size })
    }
  }
  const ink = [...bins.values(), ...unbounded]
  binnedSources.set(source, { size, ink })
  return ink
}

/** Experimental candidate surrogate. Never used as final drawing geometry. */
export function proxyScoreWidthInk<T extends ScoreInk>(pieces: readonly T[], left: number, right: number, nextLeft: number, nextRight: number): T[] {
  pieces = candidateInk(pieces)
  const quantized=((globalThis as {__m3nExperimentalWidthBin?:number}).__m3nExperimentalWidthBin ?? 0)>0
  if(quantized && !pieces.length)return emptyTransform as T[]
  const key=quantized ? `${left}:${right}:${nextLeft}:${candidateRight(nextLeft,nextRight)}` : undefined
  let variants=quantized ? quantizedTransforms.get(pieces) : undefined
  const cached=key===undefined ? undefined : variants?.get(key)
  // Candidate pieces are immutable. Pagination takes private arrays before
  // sorting, so neighbouring widths can share one quantized transform.
  if(cached)return cached as T[]
  nextRight=candidateRight(nextLeft,nextRight)
  const scale = right > left ? (nextRight - nextLeft) / (right - left) : 1
  const result = pieces.map(piece => ({ ...piece, left: nextLeft + (piece.left - left) * scale,
    right: nextLeft + (piece.right - left) * scale }))
  cacheScoreHorizontalProxy(result,pieces,left,nextLeft,scale)
  if(key!==undefined) {
    if(!variants){variants=new Map();quantizedTransforms.set(pieces,variants)}
    variants.set(key,result)
  }
  return result
}

export function proxyScoreWidthPartition<T extends ScoreInk>(all: readonly T[], subset: readonly T[], left: number, right: number, nextLeft: number, nextRight: number) {
  nextRight=candidateRight(nextLeft,nextRight)
  if (((globalThis as {__m3nExperimentalInkBin?:number}).__m3nExperimentalInkBin ?? 0) > 0) {
    let peers = complements.get(all)
    let complement = peers?.get(subset)
    if (!complement) {
      const selected = new Set<ScoreInk>(subset)
      complement = all.filter(piece => !selected.has(piece))
      if (!peers) { peers = new WeakMap(); complements.set(all, peers) }
      peers.set(subset, complement)
    }
    const included = proxyScoreWidthInk(subset,left,right,nextLeft,nextRight)
    const excluded = proxyScoreWidthInk(complement as T[],left,right,nextLeft,nextRight)
    return {pieces:[...included,...excluded],included,excluded}
  }
  const pieces = proxyScoreWidthInk(all,left,right,nextLeft,nextRight), included:T[] = [], excluded:T[] = []
  let at = 0
  for (let index=0; index<all.length; index++) {
    if (all[index] === subset[at]) { included.push(pieces[index]!); at++ }
    else excluded.push(pieces[index]!)
  }
  const scale = right>left ? (nextRight-nextLeft)/(right-left) : 1
  cacheScoreHorizontalProxy(included,subset,left,nextLeft,scale)
  return {pieces,included,excluded}
}
