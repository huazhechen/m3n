import { SCORE_NUMBER_FONT } from './font-family.js'
import { nativeNoteBody } from './native-note-body.js'
import type { TextMeasurer } from './native-measure.js'
import { nativeMusicAxis } from './native-axis.js'
import { nativeArpeggioGeometry } from './native-arpeggio.js'
import { nativeSvgInk, nativeSvgPieces, unionNativeInk, type NativeInk } from './native-ink.js'
import { nativeBodyPieces } from './native-music-ink.js'
import { nativeStyle } from './native-style.js'
import { NativeSymbols, attrs, n, line, circle } from './native-symbols.js'
import { nativeGraceGeometry } from './native-grace.js'
import { nativeMarkStack } from './native-marks.js'
import { nativeNoteMetrics, nativeBeamCount } from './native-note-metrics.js'
import type { NativeGlyph } from './native-model.js'

/** Claim complete continuous runs one level at a time. Call with one lane in
 * one measure/system; the beat predicate remains shared with spacing. Local
 * note footprints stay valid subsets of these runs for relation clearance. */
export function nativeBeamLayout(glyphs: readonly NativeGlyph[], measurer: TextMeasurer, paint = true) {
  const claimed = new Map<NativeGlyph, Set<number>>()
  const counts = glyphs.slice(1).map((glyph, i) => nativeBeamCount(glyphs[i]!, glyph))
  const body = nativeNoteBody(measurer)
  let svg = ''
  const pieces: NativeInk[] = []
  for (let level = 0; level < Math.max(0, ...counts); level++) {
    for (let i = 0; i < counts.length; i++) {
      if (counts[i]! <= level) continue
      const first = i
      while (i + 1 < counts.length && counts[i + 1]! > level) i++
      const a = glyphs[first]!, b = glyphs[i + 1]!
      // The outside of each round cap ends at the reserved numeric body edge.
      const left = a.x - body.width / 2 + body.beamStroke / 2, right = b.x + body.width / 2 - body.beamStroke / 2, y = a.y + body.beamY(level)
      if (paint) svg += line(left, y, right, y, body.beamStroke)
      const half = n(body.beamStroke)/2, x1 = n(left), x2 = n(right), baseline = n(y)
      pieces.push({left:Math.min(x1,x2)-half,right:Math.max(x1,x2)+half,top:baseline-half,bottom:baseline+half})
      for (let member = first; member <= i + 1; member++) {
        const glyph = glyphs[member]!, levels = claimed.get(glyph) ?? new Set<number>()
        levels.add(level)
        claimed.set(glyph, levels)
      }
    }
  }
  return { svg, claimed, pieces }
}

export class NativeMusicPainter extends NativeSymbols {
  bodyPieces(glyph: NativeGlyph, claimedBeams?: ReadonlySet<number>) {
    return nativeBodyPieces(glyph, this.measurer, claimedBeams)
  }

  musicPieces(glyph: NativeGlyph, claimedBeams?: ReadonlySet<number>, coreOnly = false) {
    if (!glyph.multiRest && (coreOnly || !glyph.graces.length && !(glyph.markLayout?.length ?? glyph.marks.length) && !glyph.event?.postfixes.includes('arp')))
      return this.bodyPieces(glyph, claimedBeams)
    return nativeSvgPieces(this.music(glyph, claimedBeams, coreOnly), this.measurer)
  }

  tieBodyInk(glyph: NativeGlyph) {
    if (!(glyph.markLayout?.length ?? glyph.marks.length))
      return unionNativeInk(this.bodyPieces({ ...glyph, pitches: glyph.pitches.map(pitch => ({ ...pitch, accidental: '' })) }))
    return nativeSvgInk(this.tieBody(glyph), this.measurer)
  }

  /** The connection belongs to the sounding head and its articulations. Side
   * components retain their own ink for local curve clearance. */
  tieBody(glyph: NativeGlyph): string {
    return this.body({ ...glyph, pitches: glyph.pitches.map(pitch => ({ ...pitch, accidental: '' })) }) + this.articulations(glyph)
  }

  private articulations(glyph: NativeGlyph): string {
    const markStack = glyph.markLayout ?? nativeMarkStack(glyph.marks, nativeNoteMetrics(glyph.pitches, glyph.writtenBeats, glyph.sustain, this.measurer).top, this.measurer).items
    return markStack.map(mark => `<g${attrs({ transform: `translate(${n(glyph.x + (mark.x ?? 0))} ${n(glyph.y + mark.y)})`, 'data-m3n-role': 'mark', 'data-m3n-mark': mark.name })}>${this.rawMark(mark.name)}</g>`).join('')
  }

  music(glyph: NativeGlyph, claimedBeams?: ReadonlySet<number>, coreOnly = false): string {
    if (glyph.multiRest) {
      const size = nativeStyle.music, text = glyph.interlude ? '' : String(glyph.multiRest)
      const font = SCORE_NUMBER_FONT
      const metrics = this.measurer.measureText(text, { fontSize: size, fontFamily: font })
      const width = Math.max(size * 3, metrics.w + size * 0.5), left = glyph.x - size * 0.4, right = left + width
      const axis = glyph.y + nativeMusicAxis(this.measurer), stroke = size * 0.12, halfCap = (size * 0.65 - stroke) / 2
      return `<g data-m3n-role="${glyph.interlude ? 'interlude' : 'multi-rest'}">`
        + line(left + stroke, axis, right - stroke, axis, stroke * 2)
        + line(left + stroke / 2, axis - halfCap, left + stroke / 2, axis + halfCap, stroke)
        + line(right - stroke / 2, axis - halfCap, right - stroke / 2, axis + halfCap, stroke)
        + (text ? this.text(text, left + width / 2, axis - (metrics.inkBottom ?? metrics.h) - size * 0.175 + metrics.baseline, size, font, { 'text-anchor': 'middle' }) : '') + '</g>'
    }
    let music = this.body(glyph, claimedBeams)
    if (coreOnly) return music
    if (glyph.graces.length) {
      const grace = glyph.graceLayout ?? nativeGraceGeometry(glyph.graces, glyph.musicLeft ?? glyph.left, this.measurer)
      music += `<g${attrs({ transform: `translate(${n(glyph.x)} ${n(glyph.y)})` })}>${grace.svg}</g>`
    }
    music += this.articulations(glyph)
    if (glyph.event?.postfixes.includes('arp') && glyph.pitches.length > 1 && !glyph.sustain) {
      const arpeggio = glyph.arpeggioLayout ?? nativeArpeggioGeometry(nativeSvgInk(this.body({ ...glyph, x: 0, y: 0 }), this.measurer), this.measurer)
      music += `<g transform="translate(${n(glyph.x)} ${n(glyph.y)})">${arpeggio.svg}</g>`
    }
    return music
  }

  /** Main music only, before grace notes, ornaments and arpeggio. */
  body(glyph: NativeGlyph, claimedBeams?: ReadonlySet<number>): string {
    let music = ''
    if (glyph.sustain) music += this.sustain(glyph.x, glyph.y)
    else {
      const body = nativeNoteBody(this.measurer)
      const beamCount = Math.max(0, -Math.floor(Math.log2(glyph.writtenBeats)))
      glyph.pitches.forEach((pitch, index) => { music += this.pitch(pitch, glyph.x, glyph.y + (glyph.pitchOffsets?.[index] ?? 0), nativeStyle.music, index === 0 ? beamCount : 0) })
      const base = 2 ** Math.floor(Math.log2(glyph.writtenBeats)), ratio = glyph.writtenBeats / base
      const dots = [1, 1.5, 1.75, 1.875].findIndex(value => Math.abs(ratio - value) < 1e-7)
      for (let index = 0; index < dots; index++) music += circle(glyph.x + body.width / 2 + (nativeStyle.music * .18) + index * (nativeStyle.music * .25), glyph.y + body.dotY, (nativeStyle.music * nativeStyle.durationDotRadiusEm), this.measurer)
      const beams = Math.max(0, Math.round(-Math.log2(base)))
      for (let index = 0; index < beams; index++) if (!claimedBeams?.has(index)) music += line(glyph.x - body.width / 2 + body.beamStroke / 2, glyph.y + body.beamY(index), glyph.x + body.width / 2 - body.beamStroke / 2, glyph.y + body.beamY(index), body.beamStroke)
    }
    return music
  }
}
