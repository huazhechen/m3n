import { NUMBER_FONT_CSS } from './font-data.js'
let ready: Promise<void> | undefined

/** The same embedded font is used for measurement, SVG display and offline export. */
export function prepareNumberedNotationFonts(): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return Promise.resolve()
  ready ??= (async () => {
    const source = /src:(.*);font-weight/.exec(NUMBER_FONT_CSS)?.[1]
    if (!source) throw new Error('简谱数字字体资源无效。')
    const font = new FontFace('M3N Numbers', source)
    await font.load()
    document.fonts.add(font)
    await document.fonts.ready
  })().catch(error => { ready = undefined; throw error })
  return ready
}
