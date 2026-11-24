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
assert.deepEqual(semantic(after), semantic(before), 'Optimization must preserve every candidate result, not just winning widths')
const beforeTiming = read('before-timings'), afterTiming = read('after-timings')
assert.equal(beforeTiming.reusedScores, 0, 'Baseline must measure every score')
assert.equal(afterTiming.reusedScores, 0, 'Optimized comparison must measure every score')
assert.equal(beforeTiming.measuredScores, before.entries.length)
assert.equal(afterTiming.measuredScores, after.entries.length)
assert.equal(beforeTiming.strategy, afterTiming.strategy)
if (beforeTiming.fontSha256 && afterTiming.fontSha256) assert.equal(beforeTiming.fontSha256, afterTiming.fontSha256, 'Keep the PDF font identical')
const summary = (widths, timing) => ({ totalMs: timing.totalMs, stages: timing.stages, ...summarizeMeasurements(widths.entries) })
const beforeScoreWallMs = before.entries.reduce((sum, entry) => sum + entry.measurement.wallMs, 0)
const afterScoreWallMs = after.entries.reduce((sum, entry) => sum + entry.measurement.wallMs, 0)
const report = { timingScope: 'sum-of-score-wall-times', candidateResultsSha256: createHash('sha256').update(JSON.stringify(semantic(before))).digest('hex'),
  scoreCount: before.entries.length,
  candidateCount: before.entries.reduce((sum, entry) => sum + entry.candidates.length, 0),
  identicalCandidateResults: true, before: summary(before, beforeTiming), after: summary(after, afterTiming),
  widthSpeedup: beforeScoreWallMs / afterScoreWallMs,
  widthReductionPercent: (1 - afterScoreWallMs / beforeScoreWallMs) * 100 }
if (argument('output')) writeFileSync(resolve(argument('output')), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ scoreCount: report.scoreCount, candidateCount: report.candidateCount,
  identicalCandidateResults: true, timingScope: report.timingScope, beforeMs: beforeScoreWallMs,
  afterMs: afterScoreWallMs, speedup: report.widthSpeedup, reductionPercent: report.widthReductionPercent }, null, 2))
