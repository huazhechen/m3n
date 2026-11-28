import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareExactWidthSelection } from './compare-exact-width-selection.mjs'

const quality = { meanRhythmicGap: 15, spacingUnevenCost: .1, spacingMeanUnevenCost: .1, verticalCost: 0,
  spacingCrampedCost: 0, spacingExpandedCost: 0, layoutCost: .2, lineStretchCost: .1, lineUniformityCost: .1, fontSizeCost: .2 }
const report = () => ({ complete: true, notation: 'numbered', fontHashes: [{ file: 'music.ttf', sha256: 'same-font' }],
  entries: [{ ...quality, file: 'score.m3n', sourceHash: 'same-score', width: 582, pages: 2, rows: 20, totalCost: .3, spacingCost: .1,
    searchMs: 700, outside: [], overlaps: [], candidates: [
      { ...quality, width: 582, pages: 2, rows: 20, totalCost: .3, spacingCost: .1 },
      { ...quality, width: 588, pages: 2, rows: 20, totalCost: .4, spacingCost: .2 },
    ] }] })

test('exact comparison accepts faster timing and certified omissions with identical shared candidates', () => {
  const before = report(), after = report()
  after.entries[0].searchMs = 500
  after.entries[0].candidates.pop()
  after.entries[0].spacingCost += 1e-10
  const result = compareExactWidthSelection(before, after)
  assert.equal(result.commonCandidates, 1)
  assert.equal(result.totalMs, 500)
  assert.deepEqual(result.over600, [])
})

test('exact comparison rejects equally incomplete reports rather than silently skipping scoring fields', () => {
  const before = report(), after = report()
  delete before.entries[0].spacingExpandedCost
  delete after.entries[0].spacingExpandedCost
  assert.throws(() => compareExactWidthSelection(before, after), /missing spacingExpandedCost/)
  assert.throws(() => compareExactWidthSelection(report(), { ...report(), entries: [] }), /Score sets differ/)
  const withoutWinner = report()
  withoutWinner.entries[0].candidates.shift()
  assert.throws(() => compareExactWidthSelection(report(), withoutWinner), /Winner missing from candidates/)
})

test('exact comparison rejects width changes even within the former 12px tolerance', () => {
  const before = report(), after = report()
  after.entries[0].width += 6
  assert.throws(() => compareExactWidthSelection(before, after), /width differs/)
})

test('exact comparison checks shared losing candidates and font/score identities', () => {
  for (const [mutate, reason] of [
    [value => { value.entries[0].candidates[1].spacingCost += 1e-7 }, /spacingCost differs/],
    [value => { value.fontHashes[0].sha256 = 'other-font' }, /Font inputs differ/],
    [value => { value.entries[0].sourceHash = 'other-score' }, /Score input differs/],
    [value => { value.entries[0].candidates[1].pages++ }, /pages differ/],
    [value => { value.entries[0].outside.push('clipped') }, /unsafe winner/],
    [value => { value.complete = false }, /must be complete/],
    [value => { value.productionPolicy = true }, /Estimated reports/],
    [value => { value.entries[0].verticalCost = .1 }, /verticalCost differs/],
  ]) {
    const after = report()
    mutate(after)
    assert.throws(() => compareExactWidthSelection(report(), after), reason)
  }
})
