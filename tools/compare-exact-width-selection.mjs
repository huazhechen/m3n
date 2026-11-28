import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const qualityFields = ['meanRhythmicGap', 'spacingUnevenCost', 'spacingMeanUnevenCost',
  'spacingCrampedCost', 'spacingExpandedCost', 'spacingCost', 'layoutCost', 'lineStretchCost', 'lineUniformityCost',
  'fontSizeCost', 'verticalCost', 'totalCost']

/** Lossless gate: timing may change, winners and shared exact candidates may
 * not. Certified pruning can remove losing candidates from either report. */
export function compareExactWidthSelection(before, after, { epsilon = 1e-8 } = {}) {
  assert(Number.isFinite(epsilon) && epsilon >= 0, 'Invalid numerical tolerance')
  assert(before.complete && after.complete, 'Both reports must be complete')
  for (const report of [before, after]) assert((!report.productionPolicy || report.entries.every(entry => entry.renderCache?.strategy?.includes('v80-exact'))) && !report.experimentalRowReuse
    && !report.experimentalGreedyCeiling && !(report.experimentalPageCostPasses > 0), 'Estimated reports cannot establish exact parity')
  assert.equal(after.notation, before.notation, 'Notation differs')
  assert(before.fontHashes?.length && after.fontHashes?.length, 'Font hashes are required')
  assert.deepEqual(after.fontHashes, before.fontHashes, 'Font inputs differ')
  const entries = new Map(before.entries.map(entry => [entry.file, entry]))
  assert.equal(entries.size, before.entries.length, 'Duplicate baseline scores')
  assert.equal(new Set(after.entries.map(entry => entry.file)).size, after.entries.length, 'Duplicate trial scores')
  assert.deepEqual(after.entries.map(entry => entry.file).sort(), [...entries.keys()].sort(), 'Score sets differ')
  let commonCandidates = 0
  const compare = (first, next, context, winner = false) => {
    assert.equal(next.width, first.width, `${context}: width differs`)
    assert.equal(next.pages ?? next.pageCount, first.pages ?? first.pageCount, `${context}: pages differ`)
    assert.equal(next.rows, first.rows, `${context}: rows differ`)
    assert.equal(next.error, first.error, `${context}: error differs`)
    for (const field of qualityFields) {
      assert.equal(typeof next[field], typeof first[field], `${context}: missing ${field}`)
      if (!first.error) assert.equal(typeof first[field], 'number', `${context}: missing ${field}`)
      if (typeof first[field] !== 'number') continue
      assert(Number.isFinite(first[field]) && Number.isFinite(next[field]) && Math.abs(next[field] - first[field]) <= epsilon,
        `${context}: ${field} differs (${first[field]} -> ${next[field]})`)
    }
    if (winner) for (const item of [first, next]) {
      assert(item.pages > 0 && item.rows > 0 && Number.isFinite(item.totalCost), `${context}: invalid winner`)
      assert(Number.isFinite(item.searchMs) && item.searchMs >= 0, `${context}: invalid timing`)
      assert(Array.isArray(item.outside) && Array.isArray(item.overlaps) && !item.outside.length && !item.overlaps.length,
        `${context}: unsafe winner`)
    }
  }
  for (const entry of after.entries) {
    const previous = entries.get(entry.file)
    for (const item of [previous, entry]) assert(!(item.renderCache?.estimatedSkippedWidths?.length), `Estimated omissions: ${entry.file}`)
    assert(entry.sourceHash && entry.sourceHash === previous.sourceHash, `Score input differs: ${entry.file}`)
    compare(previous, entry, entry.file, true)
    assert(Array.isArray(previous.candidates) && Array.isArray(entry.candidates), `Candidates missing: ${entry.file}`)
    for (const item of [previous, entry]) assert(item.candidates.some(candidate => candidate.width === item.width && !candidate.error),
      `Winner missing from candidates: ${entry.file}`)
    const candidates = new Map(previous.candidates.map(candidate => [candidate.width, candidate]))
    assert.equal(candidates.size, previous.candidates.length, `Duplicate baseline widths: ${entry.file}`)
    assert.equal(new Set(entry.candidates.map(candidate => candidate.width)).size, entry.candidates.length, `Duplicate trial widths: ${entry.file}`)
    for (const candidate of entry.candidates) {
      const old = candidates.get(candidate.width)
      if (!old) continue
      compare(old, candidate, `${entry.file}@${candidate.width}`)
      commonCandidates++
    }
  }
  return { notation: after.notation, scores: after.entries.length, commonCandidates, epsilon,
    beforeTotalMs: before.entries.reduce((sum, entry) => sum + entry.searchMs, 0),
    totalMs: after.entries.reduce((sum, entry) => sum + entry.searchMs, 0),
    over600: after.entries.filter(entry => entry.searchMs > 600).map(({ file, searchMs }) => ({ file, searchMs })) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [before, after] = process.argv.slice(2)
  assert(before && after, 'Usage: node tools/compare-exact-width-selection.mjs BEFORE.json AFTER.json')
  console.log(JSON.stringify(compareExactWidthSelection(JSON.parse(readFileSync(before, 'utf8')), JSON.parse(readFileSync(after, 'utf8'))), null, 2))
}
