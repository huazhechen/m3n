import { bravuraGlyph } from './bravura.js'
import { nativeStyle } from './native-style.js'
import { attrs, line, n } from './native-symbols.js'
import type { NativeSystem } from './native-layout.js'
import type { TextMeasurer } from './native-measure.js'
import { NativeMusicPainter } from './native-music.js'
import { nativeSvgInk } from './native-ink.js'

/** A bracket and a separate staff-joining rule, inside the reserved prefix.
 * The measured music envelopes supply the endpoints; lyrics do not extend it.
 * Hooks taper toward the music instead of forming a rectangular enclosure.
 */
export function nativeVoiceConnectorSvg(system: NativeSystem, margin: number, measurer: TextMeasurer): string {
  const melody = system.lanes.find(lane => lane.id === 'melody')
  const bass = system.lanes.find(lane => lane.id === 'bass')
  if (!melody || !bass) return ''
  const size = nativeStyle.music
  const painter = new NativeMusicPainter(measurer)
  const music = (id: string) => system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs))
    .filter(glyph => glyph.lane === id)
    .map(glyph => nativeSvgInk(painter.music({ ...glyph, x: 0, y: 0 }, undefined, true), measurer))
  // A remote grace or expression must not extend the connector at the left
  // edge. Read the sounding bodies, including octave dots and duration beams.
  const top = melody.y + Math.min(...music(melody.id).map(ink => ink.top))
  const bottom = bass.y + Math.max(...music(bass.id).map(ink => ink.bottom))
  const x = margin + size * .3, thickness = size * .17, reach = size * .56
  const rise = Math.min(size * .2, (bottom - top) / 4)
  const hook = (y: number, name: 'bracketTop' | 'bracketBottom') => {
    const glyph = bravuraGlyph(name,rise,false,measurer,reach)
    return `<g transform="translate(${n(x)} ${n(y)})">${glyph.svg}</g>`
  }
  return `<g data-m3n-role="voice-connector">`
    + `<rect${attrs({x,y:top+rise*.65,width:thickness,height:bottom-top-rise*1.3,fill:'#000'})}/>`
    + hook(top,'bracketTop') + hook(bottom-rise,'bracketBottom')
    + line(x+size*.32,top+rise*.4,x+size*.32,bottom-rise*.4,size*.055)
    + '</g>'
}
