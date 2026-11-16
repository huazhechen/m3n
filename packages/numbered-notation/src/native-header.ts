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

export type NativeOrderItem = { text: string; framed: boolean; x: number; y: number; width: number; height: number; baseline: number }

export function wrapNativeText(text: string, width: number, size: number, measurer: TextMeasurer, weight = 400): string[] {
  const lines: string[] = []
  let line = ''
  for (const character of text) {
    if (character === '\n') { lines.push(line); line = ''; continue }
    if (line && measurer.measureText(line + character, { fontSize: size, fontFamily: 'serif', fontWeight: weight }).w > width) {
      const boundary = Math.max(line.lastIndexOf(' '), line.lastIndexOf('('), line.lastIndexOf('（'))
      if (boundary > 0) { lines.push(line.slice(0, boundary).trimEnd()); line = line.slice(boundary).trimStart() + character }
      else { lines.push(line); line = character.trimStart() }
    } else line += character
  }
  if (line) lines.push(line)
  return lines
}

/** Shared measured geometry for header painting and the first system's position. */
export function nativeHeaderGeometry(document: ScoreDocument, width: number, margin: number, measurer: TextMeasurer, systemGap = nativeStyle.systemGap, options: {fixedDo?:boolean;transpose?:number;tempoScale?:number;noteGapEm?:number} = {}) {
  const available = width - 2 * margin
  const title = wrapNativeText(document.title, available - em(2), nativeStyle.title, measurer, 700)
  const headerContent = numberedHeaderContent(document)
  const subtitle = headerContent.subtitles.flatMap(text => wrapNativeText(text, available - em(2), nativeStyle.subtitle, measurer))
  const painter = new NativeSymbols(measurer)
  const textRows = (lines: string[], size: number, weight = 400) => {
    let bottom = 0
    return lines.map((text, index) => {
      const m = measurer.measureText(text, { fontSize: size, fontFamily: 'serif', fontWeight: weight })
      const top = bottom + (index ? size * 0.25 : 0), baseline = top + m.baseline
      bottom = top + m.h
      return { text, baseline, bottom }
    })
  }
  const titleRows = textRows(title, nativeStyle.title, 700), subtitleRows = textRows(subtitle, nativeStyle.subtitle)
  const titleHeight = titleRows.at(-1)?.bottom ?? 0, subtitleHeight = subtitleRows.at(-1)?.bottom ?? 0
  const centerHeight = titleHeight + subtitleHeight + (titleHeight && subtitleHeight ? em(5) : 0)
  const creditBounds: { left: number; right: number; top: number; bottom: number }[] = []
  let creditBottom = 0
  const creditSvg = headerContent.credits.map((text, index) => {
    const raw = painter.text(text, width - margin, 0, nativeStyle.annotation, 'serif', { 'text-anchor': 'end' })
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
    // advance bearings; zero-duration cells use the natural spring clearance.
    const zero = measurer.measureText('0', { fontSize: size, fontFamily: 'M3N Numbers' })
    const gap = nativeStyle.music * (options.noteGapEm ?? 0.6) * 0.1
    const separator = painter.text('~',0,axis + separatorMetrics.baseline - separatorMetrics.h / 2,size,'M3N Numbers')
    const place = (svg:string,x:number) => `<g transform="translate(${n(x)} 0)">${svg}</g>`
    let rangeSvg = ''
    let x = signatureX-Math.min(lowInk.left, -zero.w / 2)
    rangeSvg += place(low,x)
    x += Math.max(lowInk.right, zero.w / 2)+gap
    rangeSvg += place(separator,x)
    x += (separatorMetrics.advance ?? separatorMetrics.w)+gap-Math.min(highInk.left, -zero.w / 2)
    rangeSvg += place(high,x)
    signaturePieces.push(`<g data-m3n-role="pitch-range">${rangeSvg}</g>`)
  }
  const signatureSvg = signaturePieces.join('')
  const signatureInk = nativeSvgInk(signatureSvg, measurer)
  const signaturesHeight = signatureInk.bottom - signatureInk.top
  const intervals = signaturePieces.flatMap(piece => nativeSvgPieces(piece, measurer)).flatMap(ink => {
    const top = ink.top - signatureInk.top, bottom = ink.bottom - signatureInk.top
    return creditBounds.flatMap(credit => ink.right + nativeStyle.text > credit.left + 1e-6 && credit.right > ink.left
      ? [{ start: credit.top - bottom, end: credit.bottom + em(5) - top }] : [])
  }).sort((a, b) => a.start - b.start)
  let signatureOffset = 0
  for (const interval of intervals) {
    if (signatureOffset > interval.start + 1e-6 && signatureOffset < interval.end - 1e-6) signatureOffset = interval.end
  }

  const sideTop = margin + centerHeight + (centerHeight ? em(5) : 0)
  const sidesHeight = Math.max(creditsHeight, signatureOffset + signaturesHeight)
  const signaturesTop = sideTop + signatureOffset
  const creditsTop = sideTop
  const orderRows: { top: number; height: number; items: NativeOrderItem[] }[] = []
  let orderBottom = sideTop + sidesHeight
  for (const [index, names] of numberedOrderLines(sectionOrderLabels(document,key=>transposedNumberedKeyLabel(key,options.transpose).replaceAll('#','♯').replaceAll('b','♭')), available, measurer, nativeStyle.text).entries()) {
    const labels = [{ text: index ? '→' : '演奏顺序：', framed: false }, ...names.flatMap((name, index) => [
      ...(index ? [{ text: '→', framed: false }] : []), { text: name, framed: true },
    ])]
    const measured = labels.map(item => ({ ...item, metrics: measurer.measureText(item.text, { fontSize: nativeStyle.text, fontFamily: 'serif', fontWeight: item.framed ? 700 : 400 }) }))
    const height = Math.max(...measured.map(item => item.metrics.h + (item.framed ? nativeStyle.text * (7 / 16) : 0)))
    const top = orderBottom + systemGap
    let x = margin
    const items = measured.map(item => {
      const padding = item.framed ? nativeStyle.text * (3.5 / 16) : 0, itemHeight = item.metrics.h + padding * 2
      const y = top + (height - itemHeight) / 2
      const placed = { text: item.text, framed: item.framed, x, y, width: item.metrics.w + padding * 2, height: itemHeight, baseline: y + padding + item.metrics.baseline }
      x += placed.width + nativeStyle.text * 0.25
      return placed
    })
    orderRows.push({ top, height, items }); orderBottom = top + height
  }
  const orderHeight = orderBottom - (sideTop + sidesHeight)
  const subtitleTop = margin + titleHeight + (titleHeight ? em(5) : 0)
  let svg = titleRows.map(row => painter.text(row.text, width / 2, margin + row.baseline, nativeStyle.title, 'serif', { 'text-anchor': 'middle', 'font-weight': 700 })).join('')
    + subtitleRows.map(row => painter.text(row.text, width / 2, subtitleTop + row.baseline, nativeStyle.text, 'serif', { 'text-anchor': 'middle' })).join('')
    + `<g transform="translate(0 ${n(creditsTop)})">${creditSvg}</g>`
    + `<g transform="translate(0 ${n(signaturesTop - signatureInk.top)})">${signatureSvg}</g>`
  const blocks = [{height:sideTop+sidesHeight-margin,svg:`<g transform="translate(0 ${n(-margin)})">${svg}</g>`}]
  for (const row of orderRows) {
    let rowSvg = ''
    for (const item of row.items) {
      if (item.framed) rowSvg += `<rect${attrs({ x: item.x + em(0.5), y: item.y + em(0.5), width: item.width - em(1), height: item.height - em(1), fill: 'none', stroke: '#000', 'stroke-width': em(1) })}/>`
      rowSvg += painter.text(item.text, item.x + (item.framed ? nativeStyle.text * (3.5 / 16) : 0), item.baseline, nativeStyle.text, 'serif', { 'font-weight': item.framed ? 700 : 400, 'data-m3n-role': item.framed ? 'order' : 'order-prefix' })
    }
    svg += rowSvg
    blocks.push({height:row.height,svg:`<g transform="translate(0 ${n(-row.top)})">${rowSvg}</g>`})
  }
  return { svg, blocks, title, subtitle, titleTop: margin, subtitleTop: margin + titleHeight + (titleHeight ? em(5) : 0), signaturesTop, creditsTop, sidesBottom: sideTop + sidesHeight,
    orderRows, height: centerHeight + (centerHeight ? em(5) : 0) + sidesHeight + systemGap + orderHeight }
}
