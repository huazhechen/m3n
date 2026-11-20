import { SCORE_TEXT_FONT } from './font-family.js'
import { nativeMusicAxis } from './native-axis.js'
import { numberedHeaderContent } from './header-content.js'
import { nativeStyle, nativeEm as em } from './native-style.js'
import { NativeSymbols, attrs, n } from './native-symbols.js'
import { nativeSvgInk, nativeSvgPieces } from './native-ink.js'
import { measureNativeControl, measureNativeTempo } from './native-controls.js'
import { nativeDisplayPitch } from './native-model.js'
import { numberedPitchRange } from './pitch-range.js'
import { transposedNumberedKeyLabel } from './fixed-do.js'
import { displayedTempo, sectionOrderLabels, type ScoreDocument } from '@m3n/notation'
import type { TextMeasurer } from './native-measure.js'
import { numberedOrderLines } from './order-lines.js'
import { numberedHeadingLines as wrapNativeText } from './header-text.js'

export type NativeOrderItem = { text: string; framed: boolean; x: number; y: number; width: number; height: number; baseline: number; textInset: number }
export { wrapNativeText }

/** Shared measured geometry for header painting and the first system's position. */
export function nativeHeaderGeometry(document: ScoreDocument, width: number, margin: number, measurer: TextMeasurer, minimumCoreGap = nativeStyle.headerGap, options: {fixedDo?:boolean;transpose?:number;tempoScale?:number;minimumNoteGapEm?:number} = {}) {
  const available = width - 2 * margin
  const title = wrapNativeText(document.title, available - em(2), nativeStyle.title, measurer, 700)
  const headerContent = numberedHeaderContent(document)
  const subtitleBlocks = headerContent.subtitles.map(text => wrapNativeText(text, available - em(2), nativeStyle.subtitle, measurer))
  const subtitle = subtitleBlocks.flat()
  const painter = new NativeSymbols(measurer)
  const textBlock = (lines: string[], size: number, weight = 400) => {
    if (!lines.length) return { rows: [], height: 0 }
    const metrics = lines.map(text => measurer.measureText(text, { fontSize: size, fontFamily: SCORE_TEXT_FONT, fontWeight: weight }))
    const advance = size * 1.25
    const top = Math.min(...metrics.map((m, index) => index * advance - m.baseline))
    const bottom = Math.max(...metrics.map((m, index) => index * advance - m.baseline + m.h))
    return { rows: lines.map((text, index) => ({ text, baseline: index * advance - top })), height: bottom - top }
  }
  const titleBlock = textBlock(title, nativeStyle.title, 700), titleRows = titleBlock.rows
  let subtitleHeight = 0
  const subtitleRows = subtitleBlocks.flatMap((lines, index) => {
    const block = textBlock(lines, nativeStyle.subtitle)
    const top = subtitleHeight + (index ? em(5) : 0)
    subtitleHeight = top + block.height
    return block.rows.map(row => ({ ...row, baseline: top + row.baseline }))
  })
  const titleHeight = titleBlock.height
  const creditBounds: { left: number; right: number; top: number; bottom: number }[] = []
  let creditBottom = 0
  const creditSvg = headerContent.credits.map((text, index) => {
    const raw = painter.text(text, width - margin, 0, nativeStyle.annotation, SCORE_TEXT_FONT, { 'text-anchor': 'end' })
    const ink = nativeSvgInk(raw, measurer), y = creditBottom + (index ? em(5) : 0) - ink.top
    creditBounds.push({ left: ink.left, right: ink.right, top: y + ink.top, bottom: y + ink.bottom })
    creditBottom = y + ink.bottom
    return `<g transform="translate(0 ${n(y)})">${raw}</g>`
  }).join('')
  const creditsHeight = creditBottom
  const signatures = [measureNativeControl('key', options.fixedDo ? '1=C' : transposedNumberedKeyLabel(document.key,options.transpose), measurer), measureNativeControl('meter', `${document.meterCount}/${document.meterUnit}`, measurer)]
  if (document.hasExplicitTempo) {
    const tempo = displayedTempo(document.tempo * (options.tempoScale ?? 1), document.meterCount, document.meterUnit)
    signatures.push(measureNativeTempo(tempo, measurer))
  }
  let signatureX = margin
  const signaturePieces = signatures.map(control => { const raw = painter.control(control, signatureX); signatureX += control.width + nativeStyle.text; return raw })
  const range = numberedPitchRange(document,options)
  if (range) {
    const size = nativeStyle.text
    const axis = nativeMusicAxis(measurer)
    const pitchBaseline = axis - nativeMusicAxis(measurer, size)
    const rawPitch = (value:string) => painter.pitch(nativeDisplayPitch(value),0,pitchBaseline,size)
    const low = rawPitch(range[0]), high = rawPitch(range[1])
    const lowInk = nativeSvgInk(low,measurer), highInk = nativeSvgInk(high,measurer)
    const separatorMetrics = measurer.measureText('~', { fontSize: size, fontFamily: 'M3N Numbers' })
    // Display-only notes reserve the measured numeral body, including its
    // advance bearings; zero-duration cells use the minimum clearance.
    const zero = measurer.measureText('0', { fontSize: size, fontFamily: 'M3N Numbers' })
    const gap = nativeStyle.music * (options.minimumNoteGapEm ?? 0.4) * 0.1
    const separator = painter.text('~',0,axis + separatorMetrics.baseline - separatorMetrics.h / 2,size,'M3N Numbers')
    const place = (svg:string,x:number,role?:string) => `<g${role ? ` data-m3n-role="pitch-range-${role}"` : ''} transform="translate(${n(x)} 0)">${svg}</g>`
    const label = '音域：'
    const labelMetrics = measurer.measureText(label, { fontSize: size, fontFamily: SCORE_TEXT_FONT })
    let rangeSvg = painter.text(label,0,axis + labelMetrics.baseline - labelMetrics.h / 2,size,SCORE_TEXT_FONT, { 'data-m3n-role': 'pitch-range-label' })
    let x = Math.max(labelMetrics.w, labelMetrics.advance ?? 0)+gap-Math.min(lowInk.left, -zero.w / 2)
    rangeSvg += place(low,x,'low')
    x += Math.max(lowInk.right, zero.w / 2)+gap
    rangeSvg += place(separator,x)
    x += (separatorMetrics.advance ?? separatorMetrics.w)+gap-Math.min(highInk.left, -zero.w / 2)
    rangeSvg += place(high,x,'high')
    const rangeInk = nativeSvgInk(rangeSvg, measurer)
    const wrap = signatureX + rangeInk.right > width - margin
    const rangeX = wrap ? margin : signatureX
    const rangeY = wrap ? nativeSvgInk(signaturePieces.join(''), measurer).bottom + em(5) - rangeInk.top : 0
    signaturePieces.push(`<g data-m3n-role="pitch-range" transform="translate(${n(rangeX)} ${n(rangeY)})">${rangeSvg}</g>`)
  }
  const signatureSvg = signaturePieces.join('')
  const signatureInk = nativeSvgInk(signatureSvg, measurer)
  const signaturesHeight = signatureInk.bottom - signatureInk.top
  const sideTop = margin + titleHeight + (titleHeight ? em(5) : 0)
  const subtitleTop = sideTop
  const subtitleSvg = subtitleRows.map(row => painter.text(row.text, width / 2, subtitleTop + row.baseline, nativeStyle.text, SCORE_TEXT_FONT, { 'text-anchor': 'middle' })).join('')
  const centerBounds = nativeSvgPieces(subtitleSvg, measurer).filter(ink => ink.right > ink.left && ink.bottom > ink.top).map(ink => ({ ...ink, top: ink.top - sideTop, bottom: ink.bottom - sideTop }))
  const signatureBounds = signaturePieces.flatMap(piece => nativeSvgPieces(piece, measurer)).map(ink => ({
    ...ink, top: ink.top - signatureInk.top, bottom: ink.bottom - signatureInk.top,
  }))
  type Bounds = { left: number; right: number; top: number; bottom: number }
  const forbidden = (moving: Bounds[], obstacles: Bounds[], centered = false) => moving.flatMap(ink => obstacles.flatMap(other =>
    ink.right + nativeStyle.text > other.left + 1e-6 && other.right + (centered ? nativeStyle.text : 0) > ink.left + 1e-6
      ? [{ start: other.top - ink.bottom - (centered ? em(5) : 0), end: other.bottom + em(5) - ink.top }] : []))
  const minimumOffset = (intervals: { start: number; end: number }[]) => {
    let offset = 0
    for (const interval of intervals.sort((a, b) => a.start - b.start)) {
      if (offset > interval.start + 1e-6 && offset < interval.end - 1e-6) offset = interval.end
    }
    return offset
  }
  const creditOffset = minimumOffset(forbidden(creditBounds, centerBounds, true))
  const signatureOffset = minimumOffset([...forbidden(signatureBounds, centerBounds, true),
    ...forbidden(signatureBounds, creditBounds.map(ink => ({ ...ink, top: ink.top + creditOffset, bottom: ink.bottom + creditOffset })))])
  const sidesHeight = Math.max(subtitleHeight, creditOffset + creditsHeight, signatureOffset + signaturesHeight)
  const signaturesTop = sideTop + signatureOffset
  const creditsTop = sideTop + creditOffset
  const orderRows: { top: number; height: number; items: NativeOrderItem[] }[] = []
  let orderBottom = sideTop + sidesHeight
  for (const [index, names] of numberedOrderLines(sectionOrderLabels(document,key=>transposedNumberedKeyLabel(key,options.transpose).replaceAll('#','♯').replaceAll('b','♭')), available, measurer, nativeStyle.text).entries()) {
    const labels = [{ text: index ? '→' : '演奏顺序：', framed: false }, ...names.flatMap((name, index) => [
      ...(index ? [{ text: '→', framed: false }] : []), { text: name, framed: true },
    ])]
    const measured = labels.map(item => ({ ...item, metrics: measurer.measureText(item.text, { fontSize: nativeStyle.text, fontFamily: SCORE_TEXT_FONT, fontWeight: item.framed ? 700 : 400 }) }))
    const height = Math.max(...measured.map(item => item.metrics.h + (item.framed ? nativeStyle.text * (7 / 16) : 0)))
    const top = orderBottom + minimumCoreGap
    let x = margin
    const items = measured.map(item => {
      const padding = item.framed ? nativeStyle.text * (3.5 / 16) : 0, itemHeight = item.metrics.h + padding * 2
      const y = top + (height - itemHeight) / 2
      const left = item.framed ? Math.min(0, item.metrics.inkLeft ?? 0) : 0
      const contentWidth = item.framed ? Math.max(item.metrics.w, item.metrics.inkRight ?? item.metrics.w) - left : item.metrics.w
      const placed = { text: item.text, framed: item.framed, x, y, width: contentWidth + padding * 2, height: itemHeight, baseline: y + padding + item.metrics.baseline, textInset: padding - left }
      x += placed.width + nativeStyle.text * 0.25
      return placed
    })
    orderRows.push({ top, height, items }); orderBottom = top + height
  }
  const orderHeight = orderBottom - (sideTop + sidesHeight)
  let svg = titleRows.map(row => painter.text(row.text, width / 2, margin + row.baseline, nativeStyle.title, SCORE_TEXT_FONT, { 'text-anchor': 'middle', 'font-weight': 700 })).join('')
    + subtitleSvg
    + `<g transform="translate(0 ${n(creditsTop)})">${creditSvg}</g>`
    + `<g transform="translate(0 ${n(signaturesTop - signatureInk.top)})">${signatureSvg}</g>`
  const blocks = [{height:sideTop+sidesHeight-margin,svg:`<g transform="translate(0 ${n(-margin)})">${svg}</g>`}]
  let orderIndex = 0
  for (const row of orderRows) {
    let rowSvg = ''
    for (const item of row.items) {
      if (item.framed) rowSvg += `<g data-m3n-order-index="${orderIndex++}">`
      if (item.framed) rowSvg += `<rect${attrs({ x: item.x + em(0.5), y: item.y + em(0.5), width: item.width - em(1), height: item.height - em(1), fill: 'none', stroke: '#000', 'stroke-width': em(1) })}/>`
      if (!item.framed && item.text === '→') {
        const left = item.x, right = item.x + item.width, middle = item.y + item.height / 2
        const head = Math.min(item.width * 0.35, nativeStyle.text * 0.25)
        rowSvg += `<path${attrs({ d: `M${n(left)} ${n(middle)} H${n(right)} M${n(right - head)} ${n(middle - head)} L${n(right)} ${n(middle)} L${n(right - head)} ${n(middle + head)}`, fill: 'none', stroke: '#000', 'stroke-width': em(1), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'data-m3n-role': 'order-arrow' })}/>`
      } else rowSvg += painter.text(item.text, item.x + item.textInset, item.baseline, nativeStyle.text, SCORE_TEXT_FONT, { 'font-weight': item.framed ? 700 : 400, 'data-m3n-role': item.framed ? 'order' : 'order-prefix' })
      if (item.framed) rowSvg += '</g>'
    }
    svg += rowSvg
    blocks.push({height:row.height,svg:`<g transform="translate(0 ${n(-row.top)})">${rowSvg}</g>`})
  }
  return { svg, blocks, title, subtitle, titleTop: margin, subtitleTop, signaturesTop, creditsTop, sidesBottom: sideTop + sidesHeight,
    orderRows, height: sideTop - margin + sidesHeight + minimumCoreGap + orderHeight }
}
