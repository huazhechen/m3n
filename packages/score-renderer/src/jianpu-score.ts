import { JianpuSVGRender, mapMidiToJianpu, type JianpuInfo } from 'jianpurender'
import type {
  JianpuScoreData,
  JianpuScoreMeasure,
  JianpuScoreStaff,
} from '@m3n/notation'
import { a4SourcePageHeight } from './score-export.js'
import { addScoreHeaderToSvg, scoreHeaderHeight } from './score-header-svg.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const DEFAULT_NOTE_HEIGHT = 24
const COMPACT_NOTE_HEIGHT = 18
const ROW_GAP = 46
const LYRIC_GAP = 10
const LYRIC_LINE_HEIGHT = 26
const TOP_PADDING = 6
const BOTTOM_PADDING = 10

const PITCH_CLASS_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const NAVIGATION_LABELS: Record<string, string> = {
  segno: '\u{1D11B}',
  ds: 'D.S.',
  dc: 'D.C.',
  fine: 'Fine',
}

export type JianpuScoreOptions = {
  /** Render width in CSS pixels. */
  width: number
  paged: boolean
  compact?: boolean
  headerMetadata: ReadonlyArray<{ side: 'left' | 'center' | 'right'; value: string; priority: number }>
  fontFamily?: string
}

type RenderedRow = {
  staff: JianpuScoreStaff
  nodes: Element[]
  blockXs: Map<number, number>
  blockWidths: Map<number, number>
  y0: number
  y1: number
  maxX: number
}

type PageRange = {
  fromMeasure: number
  toMeasure: number
  startX: number
  endX: number
}

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number | undefined> = {}) {
  const element = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== undefined) element.setAttribute(name, String(value))
  }
  return element
}

function rowJianpuInfo(data: JianpuScoreData, staff: JianpuScoreStaff): JianpuInfo {
  return {
    notes: data.notes
      .filter((note) => note.staff === staff)
      .map((note) => ({ start: note.start, length: note.length, pitch: note.pitch, intensity: 100 })),
    keySignatures: data.keySignatures.map((entry) => ({ start: entry.start, key: entry.key })),
    timeSignatures: data.layoutTimeSignatures.map((entry) => ({
      start: entry.start,
      numerator: entry.numerator,
      denominator: entry.denominator,
    })),
    tempos: data.tempos.map((entry) => ({ start: entry.start, qpm: entry.qpm })),
  }
}

function renderJianpuRow(
  data: JianpuScoreData,
  staff: JianpuScoreStaff,
  noteHeight: number,
  fontFamily: string,
): RenderedRow {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-100000px;top:0;width:10px;height:10px;overflow:hidden;pointer-events:none;'
  document.body.append(host)
  try {
    new JianpuSVGRender(
      rowJianpuInfo(data, staff),
      { noteHeight, fontFamily, noteColor: '#20242b', activeNoteColor: '#c0392b' },
      host,
    )
    const musicG = host.querySelector<SVGGElement>('g[data-id="music"]')
    if (!musicG) {
      return { staff, nodes: [], blockXs: new Map(), blockWidths: new Map(), y0: 0, y1: noteHeight, maxX: 0 }
    }
    const blockXs = new Map<number, number>()
    const blockWidths = new Map<number, number>()
    let maxX = 0
    for (const block of musicG.querySelectorAll<SVGGElement>('g[data-block-start]')) {
      const start = Number(block.getAttribute('data-block-start'))
      const box = block.getBBox()
      blockXs.set(start, box.x)
      blockWidths.set(start, box.width)
      maxX = Math.max(maxX, box.x + box.width)
    }
    const box = musicG.getBBox()
    const nodes = [...musicG.children].map((child) => child.cloneNode(true) as Element)
    return { staff, nodes, blockXs, blockWidths, y0: box.y, y1: box.y + box.height, maxX }
  } finally {
    host.remove()
  }
}

function blockXAtOrBefore(blockXs: ReadonlyMap<number, number>, start: number) {
  let found: number | undefined
  for (const key of blockXs.keys()) {
    if (key <= start + 1e-6 && (found === undefined || key > found)) found = key
  }
  return found
}

function rounded(value: number) {
  return Math.round(value * 100) / 100
}

function barPathX(element: Element) {
  const match = /translate\(([-\d.]+),/.exec(element.getAttribute('transform') ?? '')
  return match ? Number(match[1]) : undefined
}

function measureIndexAt(data: JianpuScoreData, quarter: number) {
  for (let index = data.measures.length - 1; index >= 0; index -= 1) {
    const measure = data.measures[index]
    if (measure && quarter >= measure.start - 1e-6) return index
  }
  return 0
}

export class JianpuScore {
  private readonly options: JianpuScoreOptions
  private readonly pages: SVGSVGElement[]

  private constructor(
    options: JianpuScoreOptions,
    pages: SVGSVGElement[],
  ) {
    this.options = options
    this.pages = pages
  }

  static create(data: JianpuScoreData, options: JianpuScoreOptions) {
    const noteHeight = options.compact ? COMPACT_NOTE_HEIGHT : DEFAULT_NOTE_HEIGHT
    const fontFamily = options.fontFamily ?? 'system-ui, sans-serif'
    const staffs: JianpuScoreStaff[] = data.hasBass ? ['melody', 'bass'] : ['melody']
    const rows = staffs.map((staff) => renderJianpuRow(data, staff, noteHeight, fontFamily))
    const hasVisibleLyrics = data.lyrics.some((lyric) => lyric.kind !== 'placeholder')
    const rowTop = new Map<JianpuScoreStaff, number>()
    let nextTop = TOP_PADDING
    for (const row of rows) {
      rowTop.set(row.staff, nextTop)
      nextTop += (row.y1 - row.y0) + ROW_GAP
      if (row.staff === 'melody' && hasVisibleLyrics) nextTop += LYRIC_GAP + LYRIC_LINE_HEIGHT
    }
    const contentHeight = Math.max(1, nextTop - ROW_GAP + BOTTOM_PADDING)
    const measureStartX = new Map<JianpuScoreStaff, Map<number, number>>()
    const measureEndX = new Map<JianpuScoreStaff, Map<number, number>>()
    for (const row of rows) {
      const starts = new Map<number, number>()
      const ends = new Map<number, number>()
      const measures = data.measures
      let previousEnd = 0
      for (let index = 0; index < measures.length; index += 1) {
        const measure = measures[index]
        if (!measure) continue
        let startX: number | undefined
        let endX = 0
        for (const [blockStart, x] of row.blockXs) {
          if (blockStart >= measure.start - 1e-6 && blockStart < measure.start + measure.length - 1e-6) {
            startX = startX === undefined ? x : Math.min(startX, x)
            endX = Math.max(endX, x + (row.blockWidths.get(blockStart) ?? 0))
          }
        }
        if (startX === undefined) {
          if (row.staff !== 'melody') continue
          startX = index === 0 ? 0 : previousEnd + 40
          endX = startX + 40
        }
        previousEnd = endX
        starts.set(measure.start, startX)
        ends.set(measure.start, endX)
      }
      measureStartX.set(row.staff, starts)
      measureEndX.set(row.staff, ends)
    }

    const rowMeasureGroups = new Map<JianpuScoreStaff, Map<number, SVGGElement>>()
    for (const row of rows) {
      const groups = new Map<number, SVGGElement>()
      const blockByStart = new Map<number, Element>()
      for (const node of row.nodes) {
        const blockStart = node.getAttribute('data-block-start')
        if (blockStart !== null) blockByStart.set(Number(blockStart), node)
      }
      for (let index = 0; index < data.measures.length; index += 1) {
        const measure = data.measures[index]
        if (!measure) continue
        const group = svgElement('g', {
          class: 'measure',
          id: row.staff === 'melody' ? measure.xmlId : `${measure.xmlId}-bass`,
          'data-measure-number': measure.number,
        })
        group.setAttribute('data-m3n-measure-start', String(measure.start))
        groups.set(index, group)
      }
      for (const node of row.nodes) {
        const blockStart = node.getAttribute('data-block-start')
        const index = blockStart !== null
          ? measureIndexAt(data, Number(blockStart))
          : nearestMeasureIndex(data, node, measureStartX.get(row.staff)!)
        groups.get(index)?.append(node)
      }
      decorateRow(data, row, groups, measureStartX.get(row.staff)!, measureEndX.get(row.staff)!, noteHeight, fontFamily)
      rowMeasureGroups.set(row.staff, groups)
    }

    const ranges = computePageRanges(data, rows, measureStartX, measureEndX, options.width)
    const pageHeight = options.paged
      ? Math.max(a4SourcePageHeight(options.width) - scoreHeaderHeight(options.headerMetadata), contentHeight)
      : contentHeight
    const pages = ranges.map((range, index) => buildPage(
      options,
      rows,
      rowTop,
      rowMeasureGroups,
      range,
      index === 0,
      options.width,
      pageHeight,
      contentHeight,
    ))
    return new JianpuScore(options, pages)
  }

  /** Renders the score into a paper container. */
  attach(paper: HTMLElement) {
    paper.innerHTML = ''
    for (const page of this.pages) paper.append(page.cloneNode(true) as SVGSVGElement)
    if (this.options.paged) {
      paper.querySelectorAll<SVGSVGElement>(':scope > svg').forEach((svg) => {
        const sheet = document.createElement('div')
        sheet.className = 'score-page-sheet'
        svg.replaceWith(sheet)
        sheet.append(svg)
      })
    }
  }

  /** Returns deep clones of the rendered pages for export. */
  pagesClone() {
    return this.pages.map((page) => page.cloneNode(true) as SVGSVGElement)
  }

  destroy() {
    this.pages.length = 0
  }
}

function nearestMeasureIndex(
  data: JianpuScoreData,
  node: Element,
  starts: ReadonlyMap<number, number>,
) {
  const x = barPathX(node)
  if (x === undefined) return data.measures.length - 1
  let bestIndex = data.measures.length - 1
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < data.measures.length; index += 1) {
    const measure = data.measures[index]
    if (!measure) continue
    const startX = starts.get(measure.start) ?? 0
    const distance = Math.abs(startX - x)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  }
  return bestIndex
}

function computePageRanges(
  data: JianpuScoreData,
  rows: RenderedRow[],
  starts: ReadonlyMap<JianpuScoreStaff, ReadonlyMap<number, number>>,
  ends: ReadonlyMap<JianpuScoreStaff, ReadonlyMap<number, number>>,
  width: number,
) {
  const ranges: PageRange[] = []
  let current: PageRange | null = null
  for (let index = 0; index < data.measures.length; index += 1) {
    const measure = data.measures[index]
    if (!measure) continue
    const startXs = rows
      .map((row) => starts.get(row.staff)?.get(measure.start))
      .filter((value): value is number => value !== undefined)
    const endXs = rows
      .map((row) => ends.get(row.staff)?.get(measure.start))
      .filter((value): value is number => value !== undefined)
    const startX = startXs.length > 0 ? Math.min(...startXs) : (ranges.at(-1)?.endX ?? 0)
    const endX = endXs.length > 0 ? Math.max(...endXs) : startX + 40
    if (!current) {
      current = { fromMeasure: index, toMeasure: index, startX, endX }
      continue
    }
    if (endX - current.startX <= width) {
      current.toMeasure = index
      current.endX = Math.max(current.endX, endX)
    } else {
      ranges.push(current)
      current = { fromMeasure: index, toMeasure: index, startX, endX }
    }
  }
  if (current) ranges.push(current)
  if (ranges.length === 0) ranges.push({ fromMeasure: 0, toMeasure: 0, startX: 0, endX: width })
  return ranges
}

function buildPage(
  options: JianpuScoreOptions,
  rows: RenderedRow[],
  rowTop: ReadonlyMap<JianpuScoreStaff, number>,
  rowMeasureGroups: ReadonlyMap<JianpuScoreStaff, ReadonlyMap<number, SVGGElement>>,
  range: PageRange,
  isFirst: boolean,
  width: number,
  height: number,
  contentHeight: number,
) {
  const viewWidth = Math.max(1, width)
  const viewHeight = options.paged ? Math.max(1, height) : Math.max(1, contentHeight)
  const svg = svgElement('svg', {
    xmlns: SVG_NS,
    viewBox: `0 0 ${viewWidth} ${viewHeight}`,
    width: viewWidth,
    height: viewHeight,
    class: 'jianpu-page',
    'data-render-page': '1',
  })
  const clip = svgElement('g', { transform: `translate(${-range.startX}, 0)` })
  for (const row of rows) {
    const rowEl = svgElement('g', { transform: `translate(0, ${rounded((rowTop.get(row.staff) ?? 0) - row.y0)})` })
    const groups = rowMeasureGroups.get(row.staff)
    for (let index = range.fromMeasure; index <= range.toMeasure; index += 1) {
      const group = groups?.get(index)
      if (group) rowEl.append(group.cloneNode(true))
    }
    clip.append(rowEl)
  }
  svg.append(clip)
  if (isFirst) addScoreHeaderToSvg(svg, options.headerMetadata, viewWidth, viewHeight)
  return svg
}

function decorateRow(
  data: JianpuScoreData,
  row: RenderedRow,
  groups: ReadonlyMap<number, SVGGElement>,
  starts: ReadonlyMap<number, number>,
  ends: ReadonlyMap<number, number>,
  noteHeight: number,
  fontFamily: string,
) {
  const melody = row.staff === 'melody'
  const labelsY = row.y0 - 12
  const lyricBase = (row.y1 - row.y0) + LYRIC_GAP
  const numberFont = Math.round(noteHeight * 1.2)
  const smallFont = Math.round(noteHeight * 0.9)
  const keyAt = (start: number) => [...data.keySignatures].reverse().find((entry) => entry.start <= start + 1e-6)
  const meterAt = (start: number) => [...data.timeSignatures].reverse().find((entry) => entry.start <= start + 1e-6)

  const decorateMeasure = (measure: JianpuScoreMeasure, index: number) => {
    const group = groups.get(index)
    if (!group) return
    const startX = starts.get(measure.start) ?? 0
    const endX = ends.get(measure.start) ?? startX + 40
    const centerX = (startX + endX) / 2

    if (melody) {
      const key = keyAt(measure.start)
      const meter = meterAt(measure.start)
      const keyChanged = data.keySignatures.some((entry) => Math.abs(entry.start - measure.start) < 1e-6)
      const meterChanged = data.timeSignatures.some((entry) => Math.abs(entry.start - measure.start) < 1e-6)
      if (index === 0 || keyChanged || meterChanged) {
        const label = [
          key ? `1=${PITCH_CLASS_LABELS[key.key % 12] ?? 'C'}` : '',
          meter ? `${meter.numerator}/${meter.denominator}` : '',
        ].filter(Boolean).join(' ')
        if (label) {
          const text = svgElement('text', {
            x: startX,
            y: labelsY,
            class: 'm3n-jianpu-signature',
            'font-size': smallFont,
            'font-family': fontFamily,
            fill: '#20242b',
          })
          text.textContent = label
          group.append(text)
        }
      }
      if (index === 0 && data.tempos.length > 0) {
        const tempo = data.tempos[0]
        if (tempo) {
          const text = svgElement('text', {
            x: startX,
            y: labelsY - smallFont - 6,
            class: 'm3n-jianpu-tempo',
            'font-size': smallFont,
            'font-family': fontFamily,
            fill: '#30363e',
          })
          text.textContent = `♩ = ${tempo.qpm}`
          group.append(text)
        }
      }
      if (measure.ending) {
        const text = svgElement('text', {
          x: startX,
          y: labelsY,
          class: 'm3n-jianpu-ending',
          'font-size': smallFont,
          'font-weight': '700',
          'font-family': fontFamily,
          fill: '#20242b',
        })
        text.textContent = `${measure.ending}.`
        group.append(text)
      }
      for (const nav of measure.navigation) {
        const label = NAVIGATION_LABELS[nav]
        if (!label) continue
        const text = svgElement('text', {
          x: startX,
          y: labelsY,
          class: 'm3n-jianpu-navigation',
          'font-size': smallFont,
          'font-family': fontFamily,
          fill: '#b33939',
        })
        text.textContent = label
        group.append(text)
      }
      if (measure.sectionLabel) {
        const text = svgElement('text', {
          x: startX,
          y: labelsY,
          class: 'm3n-jianpu-section',
          'font-size': smallFont,
          'font-style': 'italic',
          'font-family': fontFamily,
          fill: '#59616d',
        })
        text.textContent = measure.sectionLabel
        group.append(text)
      }
      if (measure.multiRest) {
        const text = svgElement('text', {
          x: centerX,
          y: labelsY,
          class: 'm3n-jianpu-multirest',
          'font-size': smallFont,
          'font-family': fontFamily,
          fill: '#20242b',
          'text-anchor': 'middle',
        })
        text.textContent = `×${measure.multiRest}`
        group.append(text)
      }
      if (measure.repeatStart) {
        group.append(repeatBar(startX, row.y1, row.y0, true))
      }
      if (measure.repeatEnd) {
        group.append(repeatBar(endX, row.y1, row.y0, false))
      }
      drawLyrics(data, row, group, measure, lyricBase, smallFont, fontFamily, starts)
    }

    for (const tuplet of data.tuplets) {
      if (tuplet.staff !== row.staff) continue
      if (tuplet.start < measure.start - 1e-6 || tuplet.start >= measure.start + measure.length - 1e-6) continue
      const xs = tuplet.children
        .map((child) => row.blockXs.get(child.start))
        .filter((x): x is number => x !== undefined)
      if (xs.length === 0) continue
      const text = svgElement('text', {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: row.y0 - 10,
        class: 'm3n-jianpu-tuplet',
        'font-size': smallFont,
        'font-family': fontFamily,
        fill: '#20242b',
        'text-anchor': 'middle',
      })
      text.textContent = String(tuplet.num)
      group.append(text)
    }

    for (const grace of data.graces) {
      if (grace.staff !== row.staff) continue
      if (grace.start < measure.start - 1e-6 || grace.start >= measure.start + measure.length - 1e-6) continue
      const blockX = row.blockXs.get(grace.start)
      if (blockX === undefined) continue
      const key = keyAt(grace.start)?.key ?? data.keySignatures[0]?.key ?? 0
      const { jianpuNumber, octaveDot, accidental } = mapMidiToJianpu(grace.pitch, key)
      const graceGroup = svgElement('g', { class: 'm3n-jianpu-grace', transform: `translate(${rounded(blockX - numberFont)}, 0)` })
      const numberText = svgElement('text', {
        'font-size': smallFont,
        'font-family': fontFamily,
        fill: '#20242b',
      })
      numberText.textContent = `${accidental ? (accidental === 1 ? '#' : 'b') : ''}${jianpuNumber}${octaveDot > 0 ? '^'.repeat(octaveDot) : octaveDot < 0 ? 'v'.repeat(-octaveDot) : ''}`
      graceGroup.append(numberText)
      if (grace.kind === 'ap') {
        graceGroup.append(svgElement('path', {
          d: 'M 2 -6 L 12 6',
          stroke: '#20242b',
          'stroke-width': 1,
          fill: 'none',
        }))
      }
      group.append(graceGroup)
    }

    const notePositions = data.notes.filter((note) => (
      note.staff === row.staff
      && note.start >= measure.start - 1e-6
      && note.start < measure.start + measure.length - 1e-6
    ))
    for (const note of notePositions) {
      const noteEl = findNoteGroup(group, note.start, note.pitch)
      if (!noteEl) continue
      noteEl.setAttribute('id', note.xmlId)
      noteEl.setAttribute('data-source-start', String(note.sourceStart))
      noteEl.setAttribute('data-source-end', String(note.sourceEnd))
      if (note.staccato) {
        const x = (row.blockXs.get(note.start) ?? 0) + (row.blockWidths.get(note.start) ?? 0) / 2
        noteEl.append(svgElement('circle', {
          cx: x,
          cy: noteHeight * 0.8,
          r: 2,
          class: 'm3n-jianpu-staccato',
          fill: '#20242b',
        }))
      }
      if (note.trill) {
        const text = svgElement('text', {
          x: row.blockXs.get(note.start) ?? 0,
          y: row.y0 - 6,
          class: 'm3n-jianpu-trill',
          'font-size': smallFont,
          'font-style': 'italic',
          'font-family': fontFamily,
          fill: '#20242b',
        })
        text.textContent = 'tr'
        noteEl.append(text)
      }
      if (note.accent) {
        const x = (row.blockXs.get(note.start) ?? 0) + (row.blockWidths.get(note.start) ?? 0) / 2
        noteEl.append(svgElement('path', {
          d: `M ${x - 5} ${-noteHeight * 0.6} L ${x + 5} ${-noteHeight * 0.6} L ${x - 1} ${-noteHeight * 0.2} Z`,
          class: 'm3n-jianpu-accent',
          fill: '#20242b',
        }))
      }
      if (note.dynamic) {
        const text = svgElement('text', {
          x: row.blockXs.get(note.start) ?? 0,
          y: row.y0 - 6,
          class: 'm3n-jianpu-dynamic',
          'font-size': smallFont,
          'font-style': 'italic',
          'font-family': fontFamily,
          fill: '#20242b',
        })
        text.textContent = note.dynamic
        noteEl.append(text)
      }
    }

    const chordBaseIds = new Set<string>()
    for (const note of notePositions) {
      const base = note.xmlId.replace(/-n\d+$/, '')
      if (base !== note.xmlId) chordBaseIds.add(base)
    }
    for (const baseId of chordBaseIds) {
      const block = findChordBlock(group, notePositions.filter((note) => note.xmlId.startsWith(`${baseId}-n`)))
      if (block) block.setAttribute('id', baseId)
    }
  }

  for (let index = 0; index < data.measures.length; index += 1) {
    const measure = data.measures[index]
    if (measure) decorateMeasure(measure, index)
  }

  for (const continuation of data.continuations) {
    if (continuation.staff !== row.staff) continue
    const blockStart = blockXAtOrBefore(row.blockXs, continuation.start)
    if (blockStart === undefined) continue
    const block = groupBlock(groups, blockStart)
    if (block) block.setAttribute('data-m3n-id', continuation.xmlId)
  }
}

function groupBlock(groups: ReadonlyMap<number, SVGGElement>, blockStart: number) {
  for (const group of groups.values()) {
    const block = [...group.children].find((child) => child.getAttribute('data-block-start') === String(blockStart))
    if (block) return block
  }
  return null
}

function findNoteGroup(group: SVGGElement, start: number, pitch: number) {
  return group.querySelector<SVGGElement>(`g[data-id="${start}-${pitch}"]`)
}

function findChordBlock(group: SVGGElement, notes: Array<{ pitch: number }>) {
  const first = notes[0]
  if (!first) return null
  const start = group.querySelector(`g[data-id$="-${first.pitch}"]`)?.closest<SVGGElement>('g[data-block-start]')
  return start ?? null
}

function repeatBar(x: number, rowBottom: number, rowTop: number, isStart: boolean) {
  const group = svgElement('g', { class: 'm3n-jianpu-repeat' })
  const y = rowTop
  const height = Math.max(20, rowBottom - rowTop + 20)
  const thickX = isStart ? x : x - 4
  group.append(svgElement('line', {
    x1: thickX,
    y1: y,
    x2: thickX,
    y2: y + height,
    stroke: '#20242b',
    'stroke-width': 4,
  }))
  const thinX = isStart ? x + 7 : x - 11
  group.append(svgElement('line', {
    x1: thinX,
    y1: y,
    x2: thinX,
    y2: y + height,
    stroke: '#20242b',
    'stroke-width': 1.4,
  }))
  const dotX = isStart ? x + 13 : x - 17
  const midY = y + height / 2
  for (const offset of [-8, 8]) {
    group.append(svgElement('circle', {
      cx: dotX,
      cy: midY + offset,
      r: 2,
      fill: '#20242b',
    }))
  }
  return group
}

function drawLyrics(
  data: JianpuScoreData,
  row: RenderedRow,
  group: SVGGElement,
  measure: JianpuScoreMeasure,
  baseY: number,
  fontSize: number,
  fontFamily: string,
  starts: ReadonlyMap<number, number>,
) {
  const lyrics = data.lyrics.filter((lyric) => (
    lyric.staff === row.staff
    && lyric.start >= measure.start - 1e-6
    && lyric.start < measure.start + measure.length - 1e-6
  ))
  if (lyrics.length === 0) return
  const visibleVerses = [...new Set(lyrics.filter((lyric) => lyric.kind !== 'placeholder').map((lyric) => lyric.verse))].sort((a, b) => a - b)
  for (const verse of visibleVerses) {
    const verseLyrics = lyrics.filter((lyric) => lyric.verse === verse).sort((a, b) => a.start - b.start)
    if (verseLyrics.length === 0) continue
    const rowIndex = visibleVerses.indexOf(verse)
    const y = baseY + rowIndex * LYRIC_LINE_HEIGHT + fontSize
    for (let index = 0; index < verseLyrics.length; index += 1) {
      const lyric = verseLyrics[index]
      if (!lyric || lyric.kind === 'placeholder' || !lyric.text) continue
      const blockStart = blockXAtOrBefore(row.blockXs, lyric.start)
      const x = blockStart === undefined ? starts.get(measure.start) ?? 0 : (row.blockXs.get(blockStart) ?? 0) + (row.blockWidths.get(blockStart) ?? 0) / 2
      const text = svgElement('text', {
        x,
        y,
        class: 'verse',
        'font-size': fontSize,
        'font-family': fontFamily,
        fill: '#30363e',
        'text-anchor': 'middle',
        'data-verse': String(verse),
      })
      text.textContent = lyric.text
      group.append(text)
      if (lyric.underlined || lyric.extender) {
        const width = lyric.text.length * fontSize
        const next = verseLyrics[index + 1]
        const nextX = next ? next.start : undefined
        const endX = nextX !== undefined && nextX > lyric.start
          ? (blockXAtOrBefore(row.blockXs, nextX) !== undefined
            ? (row.blockXs.get(blockXAtOrBefore(row.blockXs, nextX)!) ?? 0) + (row.blockWidths.get(blockXAtOrBefore(row.blockXs, nextX)!) ?? 0) / 2
            : x)
          : x + width / 2
        if (endX - width / 2 > x - width / 2 + 2) {
          group.append(svgElement('line', {
            x1: x - width / 2,
            y1: y + 5,
            x2: Math.max(x + width / 2, endX),
            y2: y + 5,
            class: 'm3n-jianpu-lyric-underline',
            stroke: '#30363e',
            'stroke-width': 1.2,
          }))
        }
      }
    }
  }
}
