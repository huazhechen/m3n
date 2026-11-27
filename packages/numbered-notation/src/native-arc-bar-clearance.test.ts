import { readFileSync } from 'node:fs'
import { parseM3NDocument } from '@m3n/notation'
import { expect, it } from 'vitest'
import { layoutNativeScore } from './native-layout.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { nativeLaneBarPositions, nativeBarPieces } from './native-bars.js'
import { nativeRibbonRange } from './native-curve.js'
import { nativeStyle } from './native-style.js'

it.each(['scores/huan_le_song_01.m3n', 'examples/huan_le_song.m3n'].flatMap(file =>
  [528, 600, 648, 768].map(width => ({file,width}))))('keeps 欢乐颂 bows clear of painted bars: $file, $width', ({file,width}) => {
  const measurer = new DefaultTextMeasurer()
  const source = readFileSync(new URL(`../../../src/${file}`, import.meta.url), 'utf8')
  const layout = layoutNativeScore(parseM3NDocument(source), {width,paged:true,textMeasurer:measurer})
  let count = 0
  for (const system of layout.systems) for (const [relation, placed] of system.relationLayout ?? []) {
    if (!placed.arc) continue
    for (let index=0; index<system.measures.length; index++)
      for (const bar of nativeLaneBarPositions(system.measures,index,relation.first.lane))
        for (const piece of nativeBarPieces(bar.kind,bar.x,0,measurer)) {
          const range = nativeRibbonRange(placed.arc,piece.left,piece.right)
          if (!range) continue
          expect(piece.top - range.bottom).toBeGreaterThanOrEqual(nativeStyle.music / 12 - 1e-6)
          count++
        }
  }
  expect(count).toBeGreaterThan(0)
})
