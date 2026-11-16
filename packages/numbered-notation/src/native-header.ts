import { nativeStyle, nativeEm as em } from './native-style.js'
import { NativeSymbols, attrs, n } from './native-symbols.js'
import { nativeSvgInk } from './native-ink.js'
import { measureNativeControl } from './native-controls.js'
import { scientificPitchRange } from './pitch-range.js'
import { transposedNumberedKeyLabel } from './fixed-do.js'
import { displayedTempo, scoreCreditLines, sectionOrderLabels, type ScoreDocument } from '@m3n/notation'
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
export function nativeHeaderGeometry(document: ScoreDocument, width: number, margin: number, measurer: TextMeasurer, systemGap = nativeStyle.systemGap, options: {fixedDo?:boolean;transpose?:number;tempoScale?:number} = {}) {
  const available = width - 2 * margin
  const title = wrapNativeText(document.title, available - em(2), nativeStyle.title, measurer, 700)
  const subtitle = wrapNativeText(document.subtitle, available - em(2), nativeStyle.subtitle, measurer)
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
  const credits = scoreCreditLines(document)
  const creditRows = credits.map(text => { const colon = text.match(/^(?:作词|作曲|编曲|演唱)：/) ? 2 : -1; return { label: text.slice(0, colon + 1), name: text.slice(colon + 1) } })
  const nameWidth = Math.max(0, ...creditRows.map(row => measurer.measureText(row.name, { fontSize: nativeStyle.annotation, fontFamily: 'serif' }).w))
  const labelWidth = Math.max(0, ...creditRows.map(row => measurer.measureText(row.label, { fontSize: nativeStyle.annotation, fontFamily: 'serif' }).w))
  let creditBottom = 0
  const creditSvg = creditRows.map((row, index) => {
    const raw = painter.text(row.label, width - margin - nameWidth - labelWidth - nativeStyle.text, 0, nativeStyle.credit) + painter.text(row.name, width - margin, 0, nativeStyle.annotation, 'serif', { 'text-anchor': 'end' })
    const ink = nativeSvgInk(raw, measurer), y = creditBottom + (index ? nativeStyle.credit * 0.5 : 0) - ink.top
    creditBottom = y + ink.bottom
    return `<g transform="translate(0 ${n(y)})">${raw}</g>`
  }).join('')
  const creditsHeight = creditBottom
  const signatures = [measureNativeControl('key', options.fixedDo ? '1=C' : transposedNumberedKeyLabel(document.key,options.transpose), measurer), measureNativeControl('meter', `${document.meterCount}/${document.meterUnit}`, measurer)]
  if (document.hasExplicitTempo) {
    const tempo = displayedTempo(document.tempo * (options.tempoScale ?? 1), document.meterCount, document.meterUnit)
    signatures.push(measureNativeControl('tempo', `${tempo.unit === 8 ? '♪' : '♩'} = ${Number(tempo.bpm.toFixed(2))}`, measurer))
  }
  let signatureX = margin
  let signatureSvg = signatures.map(control => { const raw = painter.control(control, signatureX); signatureX += control.width + nativeStyle.text; return raw }).join('')
  const range = scientificPitchRange(document,options)
  if (range) {
    signatureSvg += `<g data-m3n-role="pitch-range">${painter.text(range.join('~'), signatureX, 0, nativeStyle.text, 'serif')}</g>`
  }
  const signatureInk = nativeSvgInk(signatureSvg, measurer)
  const signaturesHeight = signatureInk.bottom - signatureInk.top
  const creditInk = nativeSvgInk(creditSvg, measurer)
  const stacked = creditsHeight > 0 && signatureInk.right + nativeStyle.text > creditInk.left

  const sideTop = margin + centerHeight + (centerHeight ? em(5) : 0)
  const sidesHeight = stacked ? creditsHeight + em(5) + signaturesHeight : Math.max(creditsHeight, signaturesHeight)
  const signaturesTop = sideTop + (stacked ? creditsHeight + em(5) : 0)
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
