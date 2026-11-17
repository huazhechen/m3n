import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { measureNativeControl, measureNativeTempo } from './native-controls.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import { NativeSymbols } from './native-symbols.js'
import { nativeSvgPieces } from './native-ink.js'
import { layoutNativeScore } from './native-layout.js'
import { nativeArcGeometry } from './native-arc.js'
import { nativeArcSlice } from './native-curve.js'
import { nativeTupletGeometry } from './native-tuplet.js'
import { placeNativeRelation } from './native-relations.js'

const measured: TextMeasurer = { measureText(text, style) {
  const size = style.fontSize, advance = text.length * size * .55
  return { w: advance, advance, inkLeft: -size * .08, inkRight: advance + size * .06,
    h: size * .72, baseline: size * .63, centerOffset: -size * .01 }
} }

describe('painted control footprints', () => {
  it.each([new DefaultTextMeasurer(), measured])('caches the final drawing for all control kinds', measurer => {
    const controls = [measureNativeControl('meter', '12/8', measurer),
      measureNativeControl('key', '1=F#', measurer), measureNativeControl('section', 'AB', measurer),
      measureNativeControl('passes', '2.3.', measurer), measureNativeControl('segno', '𝄋', measurer),
      ...[1, 2, 4, 8, 16].map(unit => measureNativeTempo({ unit, bpm: 96 }, measurer))]
    const painter = new NativeSymbols(measurer)
    for (const control of controls) {
      expect(control.ink).toEqual(nativeSvgPieces(painter.control(control), measurer))
      expect(control.ink.length).toBeGreaterThan(0)
    }
  })

  it('does not lift an arc for the empty upper corner of a meter column', () => {
    const measurer = new DefaultTextMeasurer()
    const layout = layoutNativeScore(parseM3NDocument('{2/4}\nN: {lg}1 2{/} |||'), { width: 800, paged: false, textMeasurer: measurer })
    const relation = layout.relations[0]!, system = layout.systems[0]!
    const plain = nativeArcGeometry(relation, system)
    const meter = measureNativeControl('meter', '3/4', measurer)
    // Only the fraction rule reaches this last pixel of the arc. Its digits
    // start farther right; the low rule is already below the entire ribbon.
    meter.x = plain.right - 1
    relation.last.controls.push(meter)
    expect(nativeArcGeometry(relation, system).commands).toEqual(plain.commands)
    // Move the actual numerator into the ribbon: it must now lift just enough.
    meter.x = plain.left + (plain.right - plain.left) / 4 - meter.width / 2
    const moved = nativeArcGeometry(relation, system)
    expect(moved.top).toBeGreaterThan(plain.top)
    let nearest = Infinity
    // Test unrounded geometry; SVG serialization separately rounds positions to four decimals.
    for (const local of meter.ink) {
      const piece = { ...local, left: local.left + meter.x, right: local.right + meter.x }
      const a = Math.max(moved.left, piece.left), b = Math.min(moved.right, piece.right)
      if (a > b) continue
      for (let i = 0; i <= 1000; i++) {
        const edge = nativeArcSlice(moved.commands, a + (b - a) * i / 1000)!
        const separation = Math.max(piece.top - edge.bottom, edge.top - piece.bottom)
        expect(separation).toBeGreaterThanOrEqual(-1e-7)
        nearest = Math.min(nearest, separation)
      }
    }
    expect(nearest).toBeCloseTo(0, 6)
  })

  it('keeps a tuplet clear of actual meter pieces without filling the empty corner', () => {
    const measurer = new DefaultTextMeasurer()
    const layout = layoutNativeScore(parseM3NDocument('{2/4}\nN: ([1 2 3:2]) |||'), { width: 800, paged: false, textMeasurer: measurer })
    const relation = layout.relations[0]!, system = layout.systems[0]!
    const plain = nativeTupletGeometry(relation, system, measurer)
    const ink = system.relationLayout!.get(relation)!.ink
    system.relationLayout!.delete(relation)
    const meter = measureNativeControl('meter', '3/4', measurer)
    meter.x = plain.right - 1
    relation.last.controls.push(meter)
    expect(nativeTupletGeometry(relation, system, measurer)).toEqual(plain)
    expect(placeNativeRelation(relation, system, measurer).ink).toEqual(ink)
    meter.x = plain.center - meter.width / 2
    const moved = nativeTupletGeometry(relation, system, measurer)
    expect(moved.baseline).toBeLessThan(plain.baseline)
  })
})
