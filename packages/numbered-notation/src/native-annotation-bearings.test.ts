import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeAnnotationSvg } from './native-annotations.js'
import { nativeSvgInk } from './native-ink.js'
import { NativeSymbols } from './native-symbols.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'

for (const kind of ['text', 'chord']) for (const host of [0, 1, 3]) {
  it(`places ${kind} at note ${host + 1} independently of trailing blank advance`, () => {
    const render = (advance: number) => {
      const fallback = new DefaultTextMeasurer()
      const textMeasurer: TextMeasurer = { measureText(text, style) {
        return text === 'PAD' ? { w: advance, advance, inkLeft: 0, inkRight: 20, h: 12, baseline: 10 }
          : fallback.measureText(text, style)
      } }
      const music = ['1', '2', '3eee', '4'].map((note, index) => `${index === host ? `{${kind}=PAD}` : ''}${note}`).join(' ')
      const layout = layoutNativeScore(parseM3NDocument(`{4/4}\nN: ${music} |||`), { width: 320, paged: false, textMeasurer })
      const glyph = layout.projection.glyphs[host]!, annotation = glyph.annotationLayout![0]!
      return { notes: layout.projection.glyphs.map(glyph => glyph.x),
        ink: nativeSvgInk(nativeAnnotationSvg(annotation, 0, new NativeSymbols(textMeasurer)), textMeasurer) }
    }
    const narrow = render(20), wide = render(160)
    expect(wide.notes).toEqual(narrow.notes)
    expect(wide.ink).toEqual(narrow.ink)
  })
}
