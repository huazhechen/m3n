import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Compare complete, font-identical benchmark runs against an exact baseline.
 * Width tolerance is an observed regression boundary, not a search proof. */
export function compareWidthSelection(baseline, trial, { maximumWidthDelta = 12, maximumSearchMs = 600 } = {}) {
  assert(Number.isFinite(maximumWidthDelta) && maximumWidthDelta >= 0, 'Invalid width tolerance')
  assert(Number.isFinite(maximumSearchMs) && maximumSearchMs > 0, 'Invalid performance limit')
  assert(baseline.complete && trial.complete, 'Both reports must be complete')
  assert.equal(baseline.notation, trial.notation, 'Notation differs')
  assert(baseline.fontHashes?.length && trial.fontHashes?.length, 'Font hashes are required')
  assert.deepEqual(baseline.fontHashes, trial.fontHashes, 'Font inputs differ')
  const before = new Map(baseline.entries.map(entry => [entry.file, entry]))
  const after = new Map(trial.entries.map(entry => [entry.file, entry]))
  assert.equal(before.size, baseline.entries.length, 'Duplicate baseline entries')
  assert.equal(after.size, trial.entries.length, 'Duplicate trial entries')
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), 'Score sets differ')
  const entries = trial.entries.map(entry => {
    const previous = before.get(entry.file)
    assert.equal(entry.sourceHash, previous.sourceHash, `Score input differs: ${entry.file}`)
    assert(entry.sourceHash, `Source hash missing: ${entry.file}`)
    for (const item of [previous, entry]) {
      assert(Number.isFinite(item.width) && item.width > 0, `Invalid width: ${entry.file}`)
      assert(Number.isInteger(item.pages) && item.pages > 0, `Invalid pagination: ${entry.file}`)
      assert(Number.isFinite(item.searchMs) && item.searchMs >= 0, `Invalid timing: ${entry.file}`)
      assert(Array.isArray(item.outside) && Array.isArray(item.overlaps), `Safety metadata missing: ${entry.file}`)
      assert(!item.outside.length && !item.overlaps.length, `Unsafe candidate: ${entry.file}`)
    }
    const widthDelta = entry.width - previous.width
    return { file: entry.file, beforeWidth: previous.width, width: entry.width, widthDelta,
      beforePages: previous.pages, pages: entry.pages, beforeMs: previous.searchMs, searchMs: entry.searchMs,
      qualityAccepted: entry.pages <= previous.pages && Math.abs(widthDelta) <= maximumWidthDelta,
      performanceAccepted: entry.searchMs <= maximumSearchMs }
  })
  return { notation: trial.notation, maximumWidthDelta, maximumSearchMs, count: entries.length,
    qualityFailures: entries.filter(entry => !entry.qualityAccepted),
    performanceFailures: entries.filter(entry => !entry.performanceAccepted),
    beforeTotalMs: entries.reduce((sum, entry) => sum + entry.beforeMs, 0),
    totalMs: entries.reduce((sum, entry) => sum + entry.searchMs, 0), entries }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [baselinePath, trialPath] = process.argv.slice(2)
  assert(baselinePath && trialPath, 'Usage: node tools/compare-width-selection.mjs EXACT.json TRIAL.json')
  const report = compareWidthSelection(JSON.parse(readFileSync(baselinePath, 'utf8')), JSON.parse(readFileSync(trialPath, 'utf8')))
  const { entries: _entries, ...summary } = report
  console.log(JSON.stringify(summary, null, 2))
  process.exitCode = report.qualityFailures.length || report.performanceFailures.length ? 1 : 0
}
