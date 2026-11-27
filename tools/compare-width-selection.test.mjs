import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareWidthSelection } from './compare-width-selection.mjs'

const entry = { file: 'score.m3n', sourceHash: 'source-a', width: 600, pages: 1, searchMs: 900, outside: [], overlaps: [] }
const report = item => ({ notation: 'numbered', complete: true, fontHashes: [{ file: 'font.ttf', sha256: 'font-a' }], entries: [item] })

test('accepts the inclusive 12px / 600ms boundary and separates quality from speed failures', () => {
  const baseline = report(entry)
  const accepted = compareWidthSelection(baseline, report({ ...entry, width: 612, searchMs: 600 }))
  assert.equal(accepted.qualityFailures.length, 0)
  assert.equal(accepted.performanceFailures.length, 0)
  const bad = compareWidthSelection(baseline, report({ ...entry, width: 618, searchMs: 601 }))
  assert.equal(bad.qualityFailures.length, 1)
  assert.equal(bad.performanceFailures.length, 1)
  assert.equal(compareWidthSelection(baseline, report({ ...entry, pages: 2, searchMs: 300 })).qualityFailures.length, 1)
})

test('rejects incomparable or incomplete runs instead of reporting a quality pass', () => {
  const baseline = report(entry), trial = report({ ...entry, searchMs: 300 })
  for (const changed of [
    { ...trial, complete: false }, { ...trial, notation: 'staff' }, { ...trial, fontHashes: [] },
    { ...trial, fontHashes: [{ file: 'font.ttf', sha256: 'font-b' }] },
    { ...trial, entries: [] }, report({ ...entry, sourceHash: 'source-b' }),
    report({ ...entry, overlaps: ['collision'] }), report({ ...entry, searchMs: NaN }),
    { ...trial, entries: [entry, entry] },
  ]) assert.throws(() => compareWidthSelection(baseline, changed))
})
