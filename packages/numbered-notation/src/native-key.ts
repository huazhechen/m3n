import { nativeStyle } from './native-style.js'
import { nativeAccidentalGeometry, nativeAccidentalAdvance } from './native-accidentals.js'
import type { TextMeasurer } from './native-measure.js'

export type NativeKeyRow = { key: string; label?: string }

/** Key rows share measured positions between engraving and reservation. */
export function nativeKeyGeometry(rows: NativeKeyRow[], measurer: TextMeasurer) {
  const size = nativeStyle.text
  const style = { fontSize: size, fontFamily: 'M3N Numbers' }
  const prepared = rows.map(({key,label}) => {
    const match = /^([16]=)([A-G])([#b♯♭]*)(.*)$/.exec(key)
    const prefix = match ? `${label ? label + '. ' : ''}${match[1]}` : ''
    const name = match ? match[2]! + match[4]! : key
    const symbols = (match?.[3] ?? '').replaceAll('#','♯').replaceAll('b','♭')
    const a = measurer.measureText(prefix,style), b = measurer.measureText(name,style)
    const advance = nativeAccidentalAdvance(symbols,size,measurer)
    // Key accidentals have twice the note accidental trailing space.
    const extraGap = [...symbols].length * size * .01
    const accidental = nativeAccidentalGeometry(symbols,size,-advance,measurer)
    const nameX = a.w + advance + extraGap
    const bounds = accidental.glyphs.map(glyph => glyph.ink)
    const top = Math.min(-a.baseline,-b.baseline,...bounds.map(ink=>ink.top))
    const bottom = Math.max((a.inkBottom ?? a.h)-a.baseline,(b.inkBottom ?? b.h)-b.baseline,...bounds.map(ink=>ink.bottom))
    return {prefix,name,glyphs:accidental.glyphs,accidentalX:a.w,baseline:-top,
      width:nameX+b.w,nameX,height:bottom-top,x:0,y:0}
  })
  const width = Math.max(...prepared.map(row=>row.width))
  let height = 0
  for (const row of prepared) {
    row.x = (width-row.width)/2; row.y = height
    height += row.height + size*.2
  }
  height -= size*.2
  return {rows:prepared,width,height,anchor:rows.length>1 ? width/2 : measurer.measureText(rows[0]!.key[0]!,style).w/2}
}
