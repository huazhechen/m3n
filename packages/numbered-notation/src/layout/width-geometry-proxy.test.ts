import { describe, expect, it } from 'vitest'
import { proxyScoreWidthInk, proxyScoreWidthPartition, proxyScoreWidthBounds, scoreWidthProxyKey } from './width-geometry-proxy.js'
import { sortedScoreInkSeparation } from './ink-separation.js'
import { scorePageGeometry } from './page-geometry.js'
import type { ScoreInk } from './geometry.js'

const brute = (a:readonly ScoreInk[],b:readonly ScoreInk[]) => {
  let distance=-Infinity
  for (const upper of a) for (const lower of b)
    if (upper.right>upper.left && lower.right>lower.left && upper.left<lower.right && upper.right>lower.left)
      distance=Math.max(distance,upper.bottom-lower.top)
  return distance
}

describe('experimental horizontal geometry proxies',()=>{
  it('transforms complete aggregate bounds without splitting them into bins',()=>{
    const globals=globalThis as {__m3nExperimentalInkBin?:number}
    const before=globals.__m3nExperimentalInkBin
    try {
      globals.__m3nExperimentalInkBin=12
      const original=Object.freeze({left:0,right:720,top:-4,bottom:8})
      expect(proxyScoreWidthBounds(original,0,720,2,530)).toEqual({left:2,right:530,top:-4,bottom:8})
      expect(original.right).toBe(720)
    } finally {globals.__m3nExperimentalInkBin=before}
  })
  it('shares only the tier dimension when explicitly enabled',()=>{
    const globals=globalThis as {__m3nExperimentalTierReuse?:boolean},before=globals.__m3nExperimentalTierReuse
    try {
      globals.__m3nExperimentalTierReuse=false
      expect(scoreWidthProxyKey(1,'row',true)).not.toBe(scoreWidthProxyKey(2.4,'row',true))
      globals.__m3nExperimentalTierReuse=true
      expect(scoreWidthProxyKey(1,'row',true)).toBe(scoreWidthProxyKey(2.4,'row',true))
      expect(scoreWidthProxyKey(1,'row',true)).not.toBe(scoreWidthProxyKey(1,'fragment',true))
      expect(scoreWidthProxyKey(1,'row',true)).not.toBe(scoreWidthProxyKey(1,'row',false))
    } finally {globals.__m3nExperimentalTierReuse=before}
  })
  it('preserves channel membership and shared primitive identity',()=>{
    const all=[{left:0,right:5,top:1,bottom:4},{left:7,right:9,top:0,bottom:2},{left:10,right:15,top:2,bottom:6}]
    const partition=proxyScoreWidthPartition(all,[all[0]!,all[2]!],0,15,2,32)
    expect(partition.pieces.map(p=>[p.left,p.right])).toEqual([[2,12],[16,20],[22,32]])
    expect(partition.included[0]).toBe(partition.pieces[0])
    expect(partition.included[1]).toBe(partition.pieces[2])
    expect(partition.excluded[0]).toBe(partition.pieces[1])
    expect(all[0]!.left).toBe(0)
  })
  it('matches direct overlap after normalization, including differing source baselines and transforms',()=>{
    const upper=Object.freeze(Array.from({length:41},(_,i)=>Object.freeze({left:i*3,right:i*3+7,top:-i%5,bottom:i%9})))
    const lower=Object.freeze(Array.from({length:37},(_,i)=>Object.freeze({left:i*4+1,right:i*4+6,top:-(i%7),bottom:2})))
    for (const scale of [.75,1,1.375]) for (const otherScale of [scale,scale+.125]) for (const baseline of [0,3.5]) {
      const a=scorePageGeometry({height:20,baseline,ink:proxyScoreWidthInk(upper,0,150,2,2+150*scale)},true).ink.sort((a,b)=>a.left-b.left)
      const b=scorePageGeometry({height:20,baseline:1,ink:proxyScoreWidthInk(lower,0,150,2,2+150*otherScale)},true).ink.sort((a,b)=>a.left-b.left)
      expect(sortedScoreInkSeparation(a,b)).toBeCloseTo(brute(a,b),10)
      expect(sortedScoreInkSeparation(a,b)).toBeCloseTo(brute(a,b),10)
    }
  })
  it('bounds every original primitive in binned mode without mixing channels', () => {
    const globals = globalThis as { __m3nExperimentalInkBin?: number }
    const previous = globals.__m3nExperimentalInkBin
    globals.__m3nExperimentalInkBin = 12
    try {
      const source = Array.from({length:100}, (_, index) => Object.freeze({left:index/10,right:index/10+1,top:-index,bottom:index}))
      const subset = source.slice(0, 50)
      const result = proxyScoreWidthPartition(source,subset,0,24,3,51)
      expect(result.pieces.length).toBeLessThan(source.length)
      for (const [originals, boxes] of [[subset,result.included],[source.slice(50),result.excluded]] as const) {
        for (const original of originals) {
          const left = 3 + original.left * 2, right = 3 + original.right * 2
          let covered = left
          for (const box of [...boxes].sort((a,b)=>a.left-b.left)) {
            if (box.left > covered || box.right <= covered || box.top > original.top || box.bottom < original.bottom) continue
            covered = box.right
          }
          expect(covered).toBeGreaterThanOrEqual(right)
        }
      }
      for (const piece of result.included) expect(result.pieces).toContain(piece)
      expect(source[0]).toEqual({left:0,right:1,top:-0,bottom:0})
    } finally { globals.__m3nExperimentalInkBin = previous }
  })

})
