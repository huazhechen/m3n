import { afterEach,expect,it,vi } from 'vitest'
import { optimizedScoreWidthPolicy,exactScoreWidthPolicy,withScoreWidthCandidatePolicy } from './width-candidate-policy.js'
import { scoreCandidateSpacingTiers } from './width-spacing-tiers.js'

afterEach(()=>vi.unstubAllGlobals())
it('isolates nested estimates and exact geometry and restores state after errors',()=>{
  const tiers=Object.freeze([8,16])
  vi.stubGlobal('__m3nExperimentalRowReuse',false)
  const before=new Map(Object.keys(globalThis).filter(key=>key.startsWith('__m3nExperimental')).map(key=>[key,Reflect.get(globalThis,key)]))
  expect(()=>withScoreWidthCandidatePolicy(optimizedScoreWidthPolicy,()=>{
    expect(scoreCandidateSpacingTiers(tiers,false)).toEqual([8])
    withScoreWidthCandidatePolicy(exactScoreWidthPolicy,()=>{
      expect(scoreCandidateSpacingTiers(tiers,false)).toBe(tiers)
    })
    expect(scoreCandidateSpacingTiers(tiers,false)).toEqual([8])
    throw new Error('failed numeric measurement')
  })).toThrow('failed numeric measurement')
  const after=new Map(Object.keys(globalThis).filter(key=>key.startsWith('__m3nExperimental')).map(key=>[key,Reflect.get(globalThis,key)]))
  expect(after).toEqual(before)
  expect(scoreCandidateSpacingTiers(tiers,false)).toBe(tiers)
})
it('rejects holding an engraving policy across asynchronous work',()=>{
  expect(()=>withScoreWidthCandidatePolicy(optimizedScoreWidthPolicy,()=>Promise.resolve(1))).toThrow('must be synchronous')
  expect(scoreCandidateSpacingTiers([8,16],false)).toEqual([8,16])
})
