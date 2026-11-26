import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { projectNativeScore } from './native-model.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { prepareNativeRelations } from './native-layout.js'
import { nativeHorizontalSpacing, NativeHorizontalMeasurementTask } from './native-horizontal.js'

it.each(['katyusha_01.m3n', 'flower_dance_01.m3n', 'valsentino_01.m3n'])(
  'cached overlapping constraint pieces preserve every span and exterior boundary: %s', file => {
    const score = parseM3NDocument(readFileSync(new URL('../../../src/scores/' + file, import.meta.url), 'utf8'))
    const projection = projectNativeScore(score, { textMeasurer: new DefaultTextMeasurer() })
    prepareNativeRelations(score, projection)
    const task = new NativeHorizontalMeasurementTask()
    for (let start = 0; start < projection.measures.length; start++) {
      for (let count = 1; count <= Math.min(8, projection.measures.length - start); count++) {
        const measures = projection.measures.slice(start, start + count)
        for (const minimumNoteGap of [9, 15, 12]) for (const equalMeasures of [false, true]) {
          const options = { minimumNoteGap, equalMeasures }
          expect(nativeHorizontalSpacing(measures, options, task)).toEqual(nativeHorizontalSpacing(measures, options))
        }
      }
    }
    const first = projection.measures[0]!
    for (const columns of [first.columns.slice(1), []]) {
      const fragment = { ...first, continuation: true, lastFragment: false, columns }
      const measures = [fragment, ...projection.measures.slice(1, 3)]
      for (const minimumNoteGap of [9, 12, 15]) {
        const options = { minimumNoteGap, minimumNoteGapFloor: 3 }
        expect(nativeHorizontalSpacing(measures, options, task)).toEqual(nativeHorizontalSpacing(measures, options))
      }
    }
    task.clear()
    const repeated = [first, first]
    expect(nativeHorizontalSpacing(repeated, {}, task)).toEqual(nativeHorizontalSpacing(repeated, {}))
    expect(nativeHorizontalSpacing(projection.measures, {}, task)).toEqual(nativeHorizontalSpacing(projection.measures, {}))
  }, 60000)
