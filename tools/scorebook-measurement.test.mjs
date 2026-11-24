import assert from 'node:assert/strict'
import { test } from 'node:test'
import { summarizeMeasurements } from './lib/scorebook-timing.mjs'

test('timing aggregates exclude reused work and keep nested continuous stages separate', () => {
  const record = reused => ({ file: 'score', title: 'Score', measurement: { wallMs: 10, reused }, candidates: [{ timings: { totalMs: 8, layoutMs: 2, continuousMs: 3, continuous: { svgMountMs: 1 } } }] })
  const report = summarizeMeasurements([record(false), record(true)])
  assert.deepEqual(report.candidateTotals, { totalMs: 8, layoutMs: 2, continuousMs: 3 })
  assert.deepEqual(report.continuousTotals, { svgMountMs: 1 })
  assert.equal(report.scoreWallMs, 20)
  assert.equal(report.slowestScores.length, 1)
  assert.deepEqual(report.scores[1].stages, {})
})
