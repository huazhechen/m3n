import { expect, it } from 'vitest'
import { scorePageCollision, type ScoreCollisionInk } from './page-collision.js'
import { scorePageGeometry } from './page-geometry.js'
import type { ScoreInk } from './geometry.js'

const separation = (a: readonly ScoreInk[], b: readonly ScoreInk[]) => {
  let value = -Infinity
  for (const first of a) for (const second of b)
    if (first.left < second.right && first.right > second.left) value = Math.max(value, first.bottom - second.top)
  return value
}
const exhaustive = (a: ScoreCollisionInk, b: ScoreCollisionInk) => ({
  collision: separation(a.ink, b.ink),
  edge: Math.max(
    separation([...a.ink, ...(a.boundaryInk ?? [])], (b.edgeInk ?? []).map(p => ({...p,top:p.top-p.gap}))),
    separation((a.edgeInk ?? []).map(p => ({...p,bottom:p.bottom+p.gap})), b.ink)),
})

it('matches exhaustive fixed-edge and point rules while reusing normalized ink against different neighbours', () => {
  let seed=8432
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)
  const pieces=(count:number)=>Array.from({length:count},(_,index)=>{
    const left=Math.floor(random()*100),top=Math.floor(random()*80)-40
    return {left,right:left+(index%11 ? random()*40 : index%2 ? 0 : -1),top,bottom:top+random()*30,gap:random()*15}
  })
  const shapes=Array.from({length:25},()=>{
    const shape=scorePageGeometry({height:100,baseline:random()*20,ink:pieces(80),boundaryInk:pieces(5),edgeInk:pieces(5)})
    shape.ink.sort((a,b)=>a.left-b.left)
    return shape
  })
  for (const upper of shapes) for (const lower of shapes) {
    const expected=exhaustive(upper,lower)
    expect(scorePageCollision(upper,lower)).toEqual(expected)
    expect(scorePageCollision(upper,lower)).toEqual(expected)
  }
})

it('does not cache mutable callers or lose infinite header spans',()=>{
  const upper={ink:[{left:-Infinity,right:Infinity,top:0,bottom:30}],edgeInk:[{left:0,right:20,top:0,bottom:30,gap:12}]}
  const lower={ink:[{left:10,right:20,top:-10,bottom:10}],edgeInk:[{left:15,right:25,top:-10,bottom:10,gap:5}]}
  expect(scorePageCollision(upper,lower)).toEqual(exhaustive(upper,lower))
  lower.ink[0]!.top=-100;lower.edgeInk[0]!.gap=150
  expect(scorePageCollision(upper,lower)).toEqual(exhaustive(upper,lower))
})

it('shares opted-in immutable geometry without exposing it through mutable queries', () => {
  const ink = [{ left: 20, right: 30, top: 5, bottom: 12 }, { left: 0, right: 10, top: -3, bottom: 4 }]
  const block = { height: 20, baseline: 7, core: { top: 0, bottom: 10 }, ink,
    edgeInk: [{ left: 1, right: 2, top: -5, bottom: 3, gap: 8 }] }
  const cached = scorePageGeometry(block, true)
  cached.ink.sort((a,b) => a.left-b.left); cached.sorted = true
  expect(scorePageGeometry(block, true)).toBe(cached)
  expect(ink[0]!.left).toBe(20)
  const fresh = scorePageGeometry(block)
  expect(fresh.ink).toEqual([cached.ink[1], cached.ink[0]])
  fresh.ink[0]!.top = -1000
  expect(scorePageGeometry(block).ink[0]!.top).toBe(-2)
  expect(cached.ink[1]!.top).toBe(-2)
  block.baseline = 9
  expect(scorePageGeometry(block).coreTop).toBe(-9)
  expect(scorePageGeometry(block).edgeInk[0]!.top).toBe(-14)
})

it('borrows immutable baseline primitives but keeps sortable arrays private', () => {
  const first = { left: 20, right: 30, top: -4, bottom: 12 }
  const second = { left: 0, right: 10, top: -2, bottom: 8 }
  const block = { height: 20, ink: [first, second], boundaryInk: [first, second] }
  const cached = scorePageGeometry(block, true)
  expect(cached.ink[0]).toBe(first)
  expect(cached.boundaryInk[0]).toBe(first)
  cached.ink.sort((a, b) => a.left - b.left)
  expect(block.ink).toEqual([first, second])
  const fresh = scorePageGeometry(block)
  expect(fresh.ink[0]).not.toBe(first)
  fresh.ink[0]!.top = -1000
  expect(first.top).toBe(-4)
  const lower = scorePageGeometry({ height: 20, ink: [second], edgeInk: [{ ...first, gap: 8 }] }, true)
  lower.ink.sort((a, b) => a.left - b.left)
  expect(scorePageCollision(cached, lower)).toEqual(exhaustive(cached, lower))
})
