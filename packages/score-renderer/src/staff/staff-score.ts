import createVerovioModule from '../../vendor/verovio/verovio-module.mjs'
import { VerovioToolkit } from 'verovio/esm'
import { scoreCreditLines, sectionOrderLabels, sectionVisitKey, keyLabel, DEFAULT_PREFERRED_WIDTH, type ScoreDocument } from '@m3n/notation'
import { a4SourcePageHeight } from '../score-export.js'
import { needsStaffExpansion } from './display-score.js'
import { resolveStaffText } from './svg-text.js'
import { scoreToMei } from './score-mei.js'

let engine: ReturnType<typeof createVerovioModule> | undefined
const ns = 'http://www.w3.org/2000/svg'
export type StaffSettings = { width?: number; transpose?: number; tempoScale?: number; measureNumbers?: boolean; includeBass?: boolean }

/** Staff engraving is optional. Playback and numbered engraving never load this module. */
export async function prepareStaffScore(score: ScoreDocument, settings: StaffSettings, signal?: AbortSignal) {
  engine ??= createVerovioModule().catch(error => { engine = undefined; throw error })
  const module = await engine
  signal?.throwIfAborted()
  const width = settings.width ?? score.preferredWidth ?? DEFAULT_PREFERRED_WIDTH
  const tempoScale = settings.tempoScale ?? 1
  const displayScore = { ...score, tempo: score.tempo * tempoScale, parts: new Map([...score.parts].map(([name, part]) => {
    const copy = (measures: typeof part.melody) => measures.map(measure => ({ ...measure,
      multiRestState: measure.multiRestState ? { ...measure.multiRestState, tempo: measure.multiRestState.tempo * tempoScale } : undefined,
      events: measure.events.map(event => ({ ...event, tempo: event.tempo === undefined ? undefined : event.tempo * tempoScale })),
    }))
    return [name, { melody: copy(part.melody), bass: settings.includeBass === false ? [] : copy(part.bass) }]
  })) }
  const mei = scoreToMei(displayScore)
  const transpose = settings.transpose ?? 0
  const target = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][((transpose % 12) + 12) % 12]!
  const order = sectionOrderLabels(score, key => keyLabel(transpose ? sectionVisitKey(key, 'C', target) : key))
  const heading = [score.title, score.subtitle, ...(order?.length ? [`演奏顺序：${order.join(' → ')}`] : []), ...scoreCreditLines(score)].filter(Boolean)
  const headerHeight = heading.length ? 30 + (heading.length - 1) * 17 : 0
  const cache = new Map<boolean, string[]>()
  return (paged: boolean): SVGSVGElement[] => {
    signal?.throwIfAborted()
    let markup = cache.get(paged)
    if (!markup) {
      // No toolkit survives this synchronous operation; concurrent previews cannot overwrite it.
      const toolkit = new VerovioToolkit(module)
      try {
        const scale = 38
        toolkit.setOptions({
          font: 'Leipzig', fontFallback: 'Leipzig', header: 'none', footer: 'none',
          svgViewBox: true, scale,
          pageWidth: Math.round(width * 100 / scale),
          pageHeight: paged ? Math.round((a4SourcePageHeight(width) - headerHeight) * 100 / scale) : 60000,
          pageMarginTop: 0, pageMarginBottom: 0, pageMarginLeft: 0, pageMarginRight: 0,
          adjustPageHeight: true, breaks: 'smart',
          mnumInterval: settings.measureNumbers ? 1 : 0,
          transpose: String(settings.transpose ?? 0),
        })
        if (!toolkit.loadData(mei)) throw new Error(toolkit.getLog() || '五线谱排版失败。')
        markup = Array.from({ length: toolkit.getPageCount() }, (_, index) => toolkit.renderToSVG(index + 1))
        cache.set(paged, markup)
      } finally { toolkit.destroy() }
    }
    return markup.map((text, page) => {
      const host = document.createElement('div')
      host.innerHTML = text
      const svg = host.querySelector('svg')!
      // Resolve glyph references inside each page. Both PNG and the existing vector PDF
      // writer then consume ordinary paths without another graphics dependency.
      for (const use of svg.querySelectorAll('use')) {
        const id = use.getAttribute('href') ?? use.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
        const glyph = id?.startsWith('#') ? svg.querySelector(`[id="${id.slice(1)}"]`) : null
        if (!glyph) throw new Error('五线谱字形缺失。')
        const group = document.createElementNS(ns, 'g')
        for (const attr of use.attributes) if (!['href', 'xlink:href', 'x', 'y', 'transform'].includes(attr.name)) group.setAttribute(attr.name, attr.value)
        group.setAttribute('transform', `translate(${use.getAttribute('x') ?? 0} ${use.getAttribute('y') ?? 0}) ${use.getAttribute('transform') ?? ''}`)
        const copy = glyph.cloneNode(true) as Element
        copy.removeAttribute('id'); group.append(copy); use.replaceWith(group)
      }
      // Keep the optional renderer within the existing PDF primitive contract.
      for (const shape of svg.querySelectorAll('polygon, polyline, ellipse')) {
        const replacement = document.createElementNS(ns, shape.localName === 'ellipse' ? 'circle' : 'path')
        for (const attr of shape.attributes) if (!['points', 'cx', 'cy', 'rx', 'ry', 'transform'].includes(attr.name)) replacement.setAttribute(attr.name, attr.value)
        const transform = shape.getAttribute('transform') ?? ''
        if (shape.localName === 'ellipse') {
          replacement.setAttribute('r', '1')
          replacement.setAttribute('transform', `${transform} translate(${shape.getAttribute('cx') ?? 0} ${shape.getAttribute('cy') ?? 0}) scale(${shape.getAttribute('rx') ?? 0} ${shape.getAttribute('ry') ?? 0})`)
        } else {
          const points = (shape.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number)
          replacement.setAttribute('d', points.reduce((path, value, index) => path + (index % 2 ? ` ${value}` : `${index ? ' L' : 'M'}${value}`), '') + (shape.localName === 'polygon' ? ' Z' : ''))
          if (transform) replacement.setAttribute('transform', transform)
        }
        shape.replaceWith(replacement)
      }
      if (!settings.measureNumbers) svg.querySelectorAll('g.mNum').forEach(number => number.remove())
      // Flatten Verovio's inner viewport so application SVG sizing rules cannot
      // resize or absolutely position it as a second sheet.
      for (const definition of svg.querySelectorAll<SVGSVGElement>('svg.definition-scale')) {
        const content = document.createElementNS(ns, 'g')
        for (const attr of definition.attributes) if (!['viewBox', 'x', 'y', 'width', 'height'].includes(attr.name)) content.setAttribute(attr.name, attr.value)
        const scale = Math.min(svg.viewBox.baseVal.width / definition.viewBox.baseVal.width, svg.viewBox.baseVal.height / definition.viewBox.baseVal.height)
        content.setAttribute('transform', `scale(${scale})`)
        content.append(...definition.childNodes)
        definition.replaceWith(content)
      }
      svg.setAttribute('preserveAspectRatio', 'xMinYMin meet')
      resolveStaffText(svg)
      svg.dataset.notation = 'staff'
      if (needsStaffExpansion(score)) for (const event of svg.querySelectorAll<SVGGElement>('g.note[id], g.chord[id], g.tuplet[id], g.rest[id]')) {
        if (!/^m3n-e-\d+(?:-rend\d+)?$/.test(event.id)) continue
        event.dataset.m3nId = event.id.replace(/-rend\d+$/, '')
        event.dataset.m3nPasses = /-rend(\d+)$/.exec(event.id)?.[1] ?? '1'
      }

      // Put the heading above the engraving, using the same logical page width.
      if (page === 0 && headerHeight) {
        const box = svg.viewBox.baseVal
        const ratio = box.width / width
        const offset = headerHeight * ratio
        const group = document.createElementNS(ns, 'g')
        group.setAttribute('transform', `translate(0 ${offset})`)
        group.append(...svg.childNodes); svg.append(group)
        heading.forEach((line, index) => {
          const label = document.createElementNS(ns, 'text')
          label.setAttribute('x', String(box.width / 2))
          label.setAttribute('y', String((index === 0 ? 23 : 23 + index * 17) * ratio))
          label.setAttribute('text-anchor', 'middle')
          label.setAttribute('font-size', String((index === 0 ? 20 : 13) * ratio))
          label.setAttribute('font-family', 'serif')
          if (index === 0) label.setAttribute('font-weight', 'bold')
          label.textContent = line; svg.append(label)
        })
        svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height + offset}`)
      }
      svg.setAttribute('width', String(width))
      svg.setAttribute('height', String(width * svg.viewBox.baseVal.height / svg.viewBox.baseVal.width))
      return svg
    })
  }
}
