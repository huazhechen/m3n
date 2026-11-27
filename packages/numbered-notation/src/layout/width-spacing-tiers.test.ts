import { expect,it,vi,afterEach } from 'vitest'
import { scoreCandidateSpacingTiers } from './width-spacing-tiers.js'

afterEach(()=>vi.unstubAllGlobals())

it('limits only opted-in equal-measure surrogate trials and restores every exact tier',()=>{
  const tiers=Object.freeze([8,16])
  vi.stubGlobal('__m3nExperimentalEqualTier',true)
  expect(scoreCandidateSpacingTiers(tiers,true)).toBe(tiers)
  vi.stubGlobal('__m3nExperimentalRowReuse',true)
  expect(scoreCandidateSpacingTiers(tiers,true)).toEqual([8])
  expect(scoreCandidateSpacingTiers(tiers,false)).toBe(tiers)
  vi.stubGlobal('__m3nExperimentalRowReuse',false)
  expect(scoreCandidateSpacingTiers(tiers,true)).toBe(tiers)
  expect(tiers).toEqual([8,16])
})

it('single-tier candidates keep both exact tiers and never mutate their source',()=>{
  const tiers=Object.freeze([8,16])
  vi.stubGlobal('__m3nExperimentalSingleTier',true)
  expect(scoreCandidateSpacingTiers(tiers,false)).toBe(tiers)
  vi.stubGlobal('__m3nExperimentalRowReuse',true)
  expect(scoreCandidateSpacingTiers(tiers,false)).toEqual([8])
  vi.stubGlobal('__m3nExperimentalRowReuse',false)
  expect(scoreCandidateSpacingTiers(tiers,false)).toBe(tiers)
  expect(tiers).toEqual([8,16])
})
