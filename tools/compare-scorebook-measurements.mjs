import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { summarizeMeasurements } from './lib/scorebook-timing.mjs'

const argument = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const read = name => {
  assert(argument(name), `Missing --${name}=path`)
  return JSON.parse(readFileSync(resolve(argument(name)), 'utf8'))
}
const before = read('before'), after = read('after')
const semantic = report => report.entries.map(entry => ({ file: entry.file, sourceSha256: entry.sourceSha256,
  width: entry.width, systems: entry.systems, pageCount: entry.pageCount,
  candidates: entry.candidates.map(({ timings: _timings, ...candidate }) => candidate) }))
const compareAuditModes = process.argv.includes('--compare-audit-modes')
const diagnosticChanges = []
let comparedNaturalHeights = 0
if (!compareAuditModes) assert.deepEqual(semantic(after), semantic(before), 'Optimization must preserve every candidate result, not just winning widths')
else {
  assert.equal(after.entries.length, before.entries.length)
  for (const [index, prior] of before.entries.entries()) {
    const next = after.entries[index]
    const identity = entry => ({ file: entry.file, sourceSha256: entry.sourceSha256, width: entry.width, systems: entry.systems, pageCount: entry.pageCount })
    assert.deepEqual(identity(next), identity(prior), 'Changing audit mode must preserve winning widths and layout metadata')
    assert.equal(next.candidates.length, prior.candidates.length)
    for (const [at, a] of prior.candidates.entries()) {
      const b = next.candidates[at]
      const core = ({ timings: _timings, outside: _outside, overlaps: _overlaps, naturalHeight: _height, ...candidate }) => candidate
      assert.deepEqual(core(b), core(a), `${prior.file} at ${a.width}px: layout and quality must match`)
      const rejected = candidate => candidate.error || candidate.outside?.length || candidate.overlaps?.length
      if ((!rejected(a) && !rejected(b)) || a.naturalHeight !== undefined && b.naturalHeight !== undefined) {
        assert.equal(b.naturalHeight, a.naturalHeight, `${prior.file} at ${a.width}px: continuous height must match`)
        if (a.naturalHeight !== undefined) comparedNaturalHeights++
      }
      if (JSON.stringify([a.outside, a.overlaps]) !== JSON.stringify([b.outside, b.overlaps]))
        diagnosticChanges.push({ file: prior.file, width: a.width, before: { outside: a.outside?.length, overlaps: a.overlaps?.length }, after: { outside: b.outside?.length, overlaps: b.overlaps?.length } })
    }
  }
}
const beforeTiming = read('before-timings'), afterTiming = read('after-timings')
assert.equal(beforeTiming.reusedScores, 0, 'Baseline must measure every score')
assert.equal(afterTiming.reusedScores, 0, 'Optimized comparison must measure every score')
assert.equal(beforeTiming.measuredScores, before.entries.length)
assert.equal(afterTiming.measuredScores, after.entries.length)
assert.equal(beforeTiming.strategy, afterTiming.strategy)
if (compareAuditModes) assert.notEqual(beforeTiming.auditLayout ?? true, afterTiming.auditLayout ?? true, 'This option compares different audit modes')
if (beforeTiming.fontSha256 && afterTiming.fontSha256) assert.equal(beforeTiming.fontSha256, afterTiming.fontSha256, 'Keep the PDF font identical')
const summary = (widths, timing) => ({ totalMs: timing.totalMs, stages: timing.stages, auditLayout: timing.auditLayout ?? null, ...summarizeMeasurements(widths.entries) })
const beforeScoreWallMs = before.entries.reduce((sum, entry) => sum + entry.measurement.wallMs, 0)
const afterScoreWallMs = after.entries.reduce((sum, entry) => sum + entry.measurement.wallMs, 0)
const report = { timingScope: 'sum-of-score-wall-times', candidateResultsSha256: createHash('sha256').update(JSON.stringify(semantic(before))).digest('hex'),
  scoreCount: before.entries.length,
  candidateCount: before.entries.reduce((sum, entry) => sum + entry.candidates.length, 0),
  identicalCandidateResults: !compareAuditModes, identicalLayoutResults: true,
  ...(compareAuditModes ? { diagnosticChanges, comparedNaturalHeights } : {}), before: summary(before, beforeTiming), after: summary(after, afterTiming),
  widthSpeedup: beforeScoreWallMs / afterScoreWallMs,
  widthReductionPercent: (1 - afterScoreWallMs / beforeScoreWallMs) * 100 }
if (argument('output')) writeFileSync(resolve(argument('output')), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ scoreCount: report.scoreCount, candidateCount: report.candidateCount,
  identicalCandidateResults: !compareAuditModes, identicalLayoutResults: true, diagnosticChanges: diagnosticChanges.length, timingScope: report.timingScope, beforeMs: beforeScoreWallMs,
  afterMs: afterScoreWallMs, speedup: report.widthSpeedup, reductionPercent: report.widthReductionPercent }, null, 2))
