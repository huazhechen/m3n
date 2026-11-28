import assert from 'node:assert/strict'
import { test } from 'node:test'
import { densityRegressionFailures } from './lib/density-regression.mjs'

const limit = { staffHeight: 210, numberedHeight: 230, staffRows: 2, numberedRows: 2, heightRatio: 1.5, lineEnds: ['last'] }
function result() {
  const layout = { naturalHeight: 150, rows: 1, pages: 1, displayedEvents: 8, measureRows: [['first', 'last']] }
  return { staff: structuredClone(layout), numbered: structuredClone(layout),
    readability: { staffFrameMm: 7.846875, numberedFrameMm: 8.71875, lyricEmMm: 4.65 } }
}

test('allows automatic reflow while preserving explicit line ends', () => {
  const value = result()
  value.numbered.rows = 2
  value.numbered.measureRows = [['first'], ['last']]
  assert.deepEqual(densityRegressionFailures(value, limit, 640), [])
  value.staff.measureRows = [['first', 'last', 'next']]
  assert.deepEqual(densityRegressionFailures(value, limit, 640), ['staff explicit line end last'])
})

test('density checks reject nonfinite measurements, missing music and changed physical sizes', () => {
  for (const [section, key, invalid, failure] of [
    ['staff', 'naturalHeight', NaN, 'staff invalid naturalHeight'],
    ['numbered', 'rows', 0, 'numbered invalid rows'],
    ['staff', 'displayedEvents', 7, 'displayed events'],
    ['readability', 'staffFrameMm', NaN, 'staffFrameMm'],
    ['readability', 'lyricEmMm', 4, 'lyricEmMm'],
  ]) {
    const value = result()
    value[section][key] = invalid
    assert.ok(densityRegressionFailures(value, limit, 640).includes(failure), `${section}.${key}`)
  }
})

test('keeps the existing height, row count and height ratio ceilings', () => {
  for (const [section, key, invalid, failure] of [
    ['staff', 'naturalHeight', 211, 'staff continuous height'],
    ['numbered', 'naturalHeight', 231, 'numbered continuous height'],
    ['staff', 'rows', 3, 'staff row count'],
    ['numbered', 'rows', 3, 'numbered row count'],
    ['numbered', 'naturalHeight', 90, 'height ratio'],
  ]) {
    const value = result()
    value[section][key] = invalid
    assert.ok(densityRegressionFailures(value, limit, 640).includes(failure), `${section}.${key}`)
  }
})
