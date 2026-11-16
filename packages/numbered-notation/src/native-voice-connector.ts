import { nativeStyle } from './native-style.js'
import { attrs, line, n } from './native-symbols.js'
import type { NativeSystem } from './native-layout.js'

/** A bracket and a separate staff-joining rule, inside the reserved prefix.
 * The measured music envelopes supply the endpoints; lyrics do not extend it.
 * Hooks taper toward the music instead of forming a rectangular enclosure.
 */
export function nativeVoiceConnectorSvg(system: NativeSystem, margin: number): string {
  const melody = system.lanes.find(lane => lane.id === 'melody')
  const bass = system.lanes.find(lane => lane.id === 'bass')
  if (!melody || !bass) return ''
  const size = nativeStyle.music
  const top = melody.y - melody.top, bottom = bass.y + (bass.bodyBottom ?? bass.bottom)
  const x = margin + size * .3, thickness = size * .17, reach = size * .56
  const rise = Math.min(size * .2, (bottom - top) / 4)
  const hook = (y: number, direction: number) => {
    const point = (dx: number, dy: number) => `${n(x + dx)} ${n(y + direction * dy)}`
    return `<path${attrs({
      d: `M${point(0,rise)} L${point(thickness,rise)} C${point(thickness,rise*.6)} ${point(reach*.65,rise*.35)} ${point(reach,0)} L${point(reach-size*.025,0)} C${point(reach*.5,rise*.12)} ${point(thickness*.5,rise*.4)} ${point(0,rise*.65)} Z`,
      fill: '#000',
    })}/>`
  }
  return `<g data-m3n-role="voice-connector">`
    + `<rect${attrs({x,y:top+rise*.65,width:thickness,height:bottom-top-rise*1.3,fill:'#000'})}/>`
    + hook(top,1) + hook(bottom,-1)
    + line(x+size*.32,top+rise*.4,x+size*.32,bottom-rise*.4,size*.055)
    + '</g>'
}
