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

test('cross-audit comparison permits only audit diagnostics, preserving metrics, heights and selected widths', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join, resolve } = await import('node:path')
  const { spawnSync } = await import('node:child_process')
  const temp = mkdtempSync(join(tmpdir(), 'm3n-width-compare-'))
  const candidate = width => ({ width, pageCount: 1, rows: 2, qualityScore: 1, outside: [], overlaps: [], naturalHeight: 400 })
  const before = { entries: [{ file: 'score', sourceSha256: 'source', width: 540, systems: 2, pageCount: 1,
    measurement: { wallMs: 10, reused: false }, candidates: [candidate(540), { ...candidate(560), naturalHeight: undefined, outside: ['ink'] }] }] }
  const after = structuredClone(before)
  after.entries[0].candidates[1] = candidate(560)
  const timings = auditLayout => ({ auditLayout, measuredScores: 1, reusedScores: 0, strategy: 'same-grid', totalMs: 10, stages: {} })
  const write = (name, value) => writeFileSync(join(temp, name), JSON.stringify(value))
  const run = flags => spawnSync(process.execPath, [resolve('tools/compare-scorebook-measurements.mjs'),
    `--before=${join(temp, 'before.json')}`, `--after=${join(temp, 'after.json')}`,
    `--before-timings=${join(temp, 'before-timing.json')}`, `--after-timings=${join(temp, 'after-timing.json')}`, ...flags], { encoding: 'utf8' })
  try {
    write('before.json', before); write('after.json', after)
    write('before-timing.json', timings(true)); write('after-timing.json', timings(false))
    assert.notEqual(run([]).status, 0)
    const valid = run(['--compare-audit-modes'])
    assert.equal(valid.status, 0, valid.stderr)
    assert.equal(JSON.parse(valid.stdout).identicalLayoutResults, true)
    assert.equal(JSON.parse(valid.stdout).diagnosticChanges, 1)
    for (const alter of [
      report => { report.entries[0].width = 560 },
      report => { report.entries[0].candidates[0].rows++ },
      report => { report.entries[0].candidates[0].naturalHeight++ },
    ]) {
      const changed = structuredClone(after); alter(changed); write('after.json', changed)
      assert.notEqual(run(['--compare-audit-modes']).status, 0)
    }
    write('after.json', after); write('after-timing.json', timings(true))
    assert.notEqual(run(['--compare-audit-modes']).status, 0)
  } finally { rmSync(temp, { recursive: true, force: true }) }
})


test('timing summaries include new shared probes even when solo probes were reused', () => {
  const report = summarizeMeasurements([{ file: 'score', title: 'Score', measurement: { wallMs: 5, reused: true },
    candidates: [{ width: 600, timings: { totalMs: 100 } }],
    sharedCandidates: [{ width: 590, timings: { totalMs: 5, layoutMs: 4 } }] }])
  assert.equal(report.candidateTotals.totalMs, 5)
  assert.equal(report.candidateTotals.layoutMs, 4)
  assert.deepEqual(report.scores[0].candidates.map(candidate => candidate.width), [590])
})
