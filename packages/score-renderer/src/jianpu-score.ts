import { mapMidiToJianpu } from './jianpu-pitch.js'
import type {
  JianpuScoreData,
  JianpuScoreMeasure,
  JianpuScoreStaff,
} from '@m3n/notation'
import { a4SourcePageHeight } from './score-export.js'
import { addScoreHeaderToSvg, scoreHeaderHeight } from './score-header-svg.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const DEFAULT_NOTE_HEIGHT = 22
const COMPACT_NOTE_HEIGHT = 18
const ROW_GAP = 46
const SYSTEM_GAP = 30
const LYRIC_FONT = 18
const LYRIC_LINE_HEIGHT = 22
const LYRIC_TOP_FACTOR = 1.3
const SYSTEM_RIGHT_MARGIN = 24
const TOP_PADDING = 6
const BOTTOM_PADDING = 10

const TIE_PATH_D = 'M -13,5 C 15,-15 65,-15 90,5 C 65,-25 15,-25 -13,5 Z'

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

type System = {
  fromMeasure: number
  toMeasure: number
  startX: number
  endX: number
  width: number
  hasLyrics: boolean
  lyricRows: number
  height: number
}

type SystemPlacement = {
  system: System
  top: number
}

type Page = {
  systems: SystemPlacement[]
  height: number
}

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number | undefined> = {}) {
  const element = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== undefined) element.setAttribute(name, String(value))
  }
  return element
}

function renderJianpuRow(
  data: JianpuScoreData,
  staff: JianpuScoreStaff,
  noteHeight: number,
  fontFamily: string,
): RenderedRow {
  const notes = data.notes.filter((note) => note.staff === staff).sort((a, b) => a.start - b.start)
  const nodes: Element[] = []
  const blockXs = new Map<number, number>()
  const blockWidths = new Map<number, number>()
  let x = 0
  const key = data.keySignatures[0]?.key ?? 0
  for (const note of notes) {
    const width = Math.max(30, 24 + note.length * 10)
    const block = svgElement('g', { 'data-block-start': note.start, transform: `translate(${x},0)` })
    const mapped = mapMidiToJianpu(note.pitch, key)
    const text = svgElement('text', { x: width / 2, y: 0, 'text-anchor': 'middle', 'font-size': noteHeight, 'font-family': fontFamily, fill: '#20242b' })
    text.textContent = `${mapped.accidental === 1 ? '#' : mapped.accidental === -1 ? 'b' : ''}${mapped.jianpuNumber}`
    const noteGroup = svgElement('g', { 'data-id': `${note.start}-${note.pitch}` })
    noteGroup.append(text)
    block.append(noteGroup)
    if (mapped.octaveDot !== 0) {
      const dots = svgElement('text', { x: width / 2, y: mapped.octaveDot > 0 ? -noteHeight * 0.75 : noteHeight * 0.65, 'text-anchor': 'middle', 'font-size': noteHeight * 0.55, 'font-family': fontFamily, fill: '#20242b' })
      dots.textContent = mapped.octaveDot > 0 ? '.'.repeat(mapped.octaveDot) : ':'.repeat(-mapped.octaveDot)
      block.append(dots)
    }
    nodes.push(block)
    blockXs.set(note.start, x)
    blockWidths.set(note.start, width)
    x += width
  }
  for (const continuation of data.continuations.filter((item) => item.staff === staff)) {
    if (blockXs.has(continuation.start)) continue
    const block = svgElement('g', { 'data-block-start': continuation.start, transform: `translate(${x},0)` })
    block.append(svgElement('g', { 'data-id': `${continuation.start}-0` }))
    nodes.push(block)
    blockXs.set(continuation.start, x)
    blockWidths.set(continuation.start, 30)
    x += 30
  }
  for (const measure of data.measures) {
    const mx = [...blockXs.entries()].find(([, value]) => value >= (blockXs.get(measure.start) ?? 0))?.[1] ?? 0
    const bar = svgElement('path', { d: `M ${mx} 8 V ${noteHeight + 8}`, stroke: '#20242b', 'stroke-width': 1, fill: 'none', 'data-measure-start': measure.start })
    nodes.push(bar)
  }
  return { staff, nodes, blockXs, blockWidths, y0: -noteHeight, y1: noteHeight + 10, maxX: x }
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

    const systems = computeSystems(data, rows, measureStartX, measureEndX, options.width)
    const systemStarts = new Set(systems.map((system) => system.fromMeasure))
    const rowMeasureGroups = new Map<JianpuScoreStaff, Map<number, SVGGElement>>()
    for (const row of rows) {
      const groups = new Map<number, SVGGElement>()
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
      decorateRow(
        data,
        row,
        groups,
        measureStartX.get(row.staff)!,
        measureEndX.get(row.staff)!,
        noteHeight,
        fontFamily,
        systemStarts,
      )
      rowMeasureGroups.set(row.staff, groups)
    }

    const pages = buildPages(options, data, rows, rowMeasureGroups, measureStartX, measureEndX, systems, noteHeight)
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

function computeSystems(
  data: JianpuScoreData,
  rows: RenderedRow[],
  starts: ReadonlyMap<JianpuScoreStaff, ReadonlyMap<number, number>>,
  ends: ReadonlyMap<JianpuScoreStaff, ReadonlyMap<number, number>>,
  width: number,
): System[] {
  const systems: System[] = []
  let current: System | null = null
  for (let index = 0; index < data.measures.length; index += 1) {
    const measure = data.measures[index]
    if (!measure) continue
    const startXs = rows
      .map((row) => starts.get(row.staff)?.get(measure.start))
      .filter((value): value is number => value !== undefined)
    const endXs = rows
      .map((row) => ends.get(row.staff)?.get(measure.start))
      .filter((value): value is number => value !== undefined)
    const startX: number = startXs.length > 0 ? Math.min(...startXs) : (current?.endX ?? 0)
    const endX = endXs.length > 0 ? Math.max(...endXs) : startX + 40
    if (!current) {
      current = { fromMeasure: index, toMeasure: index, startX, endX, width: endX - startX, hasLyrics: false, lyricRows: 0, height: 0 }
      continue
    }
    if (endX - current.startX <= width) {
      current.toMeasure = index
      current.endX = Math.max(current.endX, endX)
      current.width = current.endX - current.startX
    } else {
      systems.push(current)
      current = { fromMeasure: index, toMeasure: index, startX, endX, width: endX - startX, hasLyrics: false, lyricRows: 0, height: 0 }
    }
  }
  if (current) systems.push(current)
  if (systems.length === 0) {
    systems.push({ fromMeasure: 0, toMeasure: 0, startX: 0, endX: width, width, hasLyrics: false, lyricRows: 0, height: 0 })
  }
  return systems
}

function systemHasLyrics(data: JianpuScoreData, system: System) {
  for (let index = system.fromMeasure; index <= system.toMeasure; index += 1) {
    const measure = data.measures[index]
    if (!measure) continue
    if (data.lyrics.some((lyric) => (
      lyric.staff === 'melody'
      && lyric.kind !== 'placeholder'
      && lyric.start >= measure.start - 1e-6
      && lyric.start < measure.start + measure.length - 1e-6
    ))) return true
  }
  return false
}

/** Maximum visible lyric rows within a system. */
function systemLyricRows(data: JianpuScoreData, system: System) {
  let rows = 0
  for (let index = system.fromMeasure; index <= system.toMeasure; index += 1) {
    const measure = data.measures[index]
    if (!measure) continue
    const verses = new Set(data.lyrics.filter((lyric) => (
      lyric.staff === 'melody'
      && lyric.kind !== 'placeholder'
      && lyric.start >= measure.start - 1e-6
      && lyric.start < measure.start + measure.length - 1e-6
    )).map((lyric) => lyric.verse))
    rows = Math.max(rows, verses.size)
  }
  return rows
}

function lyricReserve(noteHeight: number, melodyRow: RenderedRow | undefined, hasLyrics: boolean, lyricRows: number) {
  if (!melodyRow || !hasLyrics || lyricRows === 0) return 0
  const areaBottom = LYRIC_TOP_FACTOR * noteHeight + lyricRows * LYRIC_LINE_HEIGHT
  return Math.max(2, areaBottom - melodyRow.y1 + 4)
}

function rowTopInSystem(rows: RenderedRow[], reserve: number, target: RenderedRow) {
  let y = TOP_PADDING
  for (const row of rows) {
    if (row === target) return y
    y += row.y1 - row.y0
    if (row.staff === 'melody') y += reserve
    y += ROW_GAP
  }
  return TOP_PADDING
}

/** Per-measure horizontal offsets that justify a row to the target width. */
function justificationOffsets(
  data: JianpuScoreData,
  starts: ReadonlyMap<number, number>,
  ends: ReadonlyMap<number, number>,
  system: System,
  targetWidth: number,
) {
  const offsets = new Map<number, number>()
  const from = data.measures[system.fromMeasure]
  const to = data.measures[system.toMeasure]
  if (!from || !to) return offsets
  const firstX = starts.get(from.start)
  const lastEnd = ends.get(to.start)
  const measureCount = system.toMeasure - system.fromMeasure + 1
  if (firstX === undefined || lastEnd === undefined || measureCount <= 1) return offsets
  const extra = Math.max(0, targetWidth - (lastEnd - firstX))
  const perGap = extra / (measureCount - 1)
  for (let index = system.fromMeasure; index <= system.toMeasure; index += 1) {
    offsets.set(index, (index - system.fromMeasure) * perGap)
  }
  return offsets
}

/** Extends tie arcs so they reach their continuation after justification. */
function stretchTies(rowEl: SVGGElement, offsets: ReadonlyMap<number, number>, data: JianpuScoreData) {
  const blocks = [...rowEl.querySelectorAll<SVGGElement>('g[data-block-start]')]
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex]
    if (!block) continue
    const paths = [...block.querySelectorAll<SVGPathElement>('path')].filter((path) => path.getAttribute('d') === TIE_PATH_D)
    if (paths.length === 0) continue
    const blockStart = Number(block.getAttribute('data-block-start'))
    const fromOffset = offsets.get(measureIndexAt(data, blockStart)) ?? 0
    for (const path of paths) {
      const noteGroup = path.closest<SVGGElement>('g[data-id]')
      const pitch = noteGroup?.getAttribute('data-id')?.split('-').at(-1)
      if (!pitch) continue
      const continuation = blocks.slice(blockIndex + 1).find((candidate) => (
        candidate.querySelector(`g[data-id$="-${pitch}"]`) !== null
      ))
      if (!continuation) continue
      const toOffset = offsets.get(measureIndexAt(data, Number(continuation.getAttribute('data-block-start')))) ?? 0
      const delta = toOffset - fromOffset
      if (Math.abs(delta) < 0.5) continue
      const transform = path.getAttribute('transform') ?? ''
      const match = /scale\(([\d.]+),/.exec(transform)
      if (!match) continue
      const scaleX = Number(match[1])
      path.setAttribute('transform', transform.replace(
        /scale\([\d.]+,/,
        `scale(${rounded(scaleX + delta * 1.3 / 100)},`,
      ))
    }
  }
}

function buildPages(
  options: JianpuScoreOptions,
  data: JianpuScoreData,
  rows: RenderedRow[],
  rowMeasureGroups: ReadonlyMap<JianpuScoreStaff, ReadonlyMap<number, SVGGElement>>,
  starts: ReadonlyMap<JianpuScoreStaff, ReadonlyMap<number, number>>,
  ends: ReadonlyMap<JianpuScoreStaff, ReadonlyMap<number, number>>,
  systems: System[],
  noteHeight: number,
) {
  const contentBudget = options.paged
    ? Math.max(200, a4SourcePageHeight(options.width) - scoreHeaderHeight(options.headerMetadata))
    : Number.POSITIVE_INFINITY
  const pages: Page[] = []
  let current: Page = { systems: [], height: 0 }
  for (const system of systems) {
    const hasLyrics = systemHasLyrics(data, system)
    const lyricRows = systemLyricRows(data, system)
    const melodyRow = rows.find((row) => row.staff === 'melody')
    const reserve = lyricReserve(noteHeight, melodyRow, hasLyrics, lyricRows)
    const height = TOP_PADDING + rows.reduce((total, row, index) => {
      const rowHeight = row.y1 - row.y0
      const lyricHeight = row.staff === 'melody' ? reserve : 0
      const gap = index < rows.length - 1 ? ROW_GAP : 0
      return total + rowHeight + lyricHeight + gap
    }, 0) + BOTTOM_PADDING
    system.hasLyrics = hasLyrics
    system.lyricRows = lyricRows
    system.height = height
    const gap = current.systems.length > 0 ? SYSTEM_GAP : 0
    if (current.systems.length > 0 && current.height + gap + height > contentBudget) {
      pages.push(current)
      current = { systems: [], height: 0 }
    }
    current.systems.push({ system, top: current.height + gap })
    current.height += gap + height
  }
  if (current.systems.length > 0) pages.push(current)
  if (pages.length === 0) {
    const empty: System = { fromMeasure: 0, toMeasure: 0, startX: 0, endX: options.width, width: options.width, hasLyrics: false, lyricRows: 0, height: 100 }
    pages.push({ systems: [{ system: empty, top: 0 }], height: empty.height })
  }

  const pageHeight = options.paged
    ? Math.max(a4SourcePageHeight(options.width), contentBudget)
    : pages.reduce((total, page) => total + page.height, 0)
  return pages.map((page, index) => {
    const viewWidth = Math.max(1, options.width)
    const viewHeight = options.paged ? Math.max(1, pageHeight) : Math.max(1, page.height)
    const svg = svgElement('svg', {
      xmlns: SVG_NS,
      viewBox: `0 0 ${viewWidth} ${viewHeight}`,
      width: viewWidth,
      height: viewHeight,
      class: 'jianpu-page',
      'data-render-page': String(index + 1),
    })
    for (const { system, top } of page.systems) {
      for (const row of rows) {
        const melodyRow = rows.find((candidate) => candidate.staff === 'melody')
        const reserve = lyricReserve(noteHeight, melodyRow, system.hasLyrics, system.lyricRows)
        const rowTop = top + rowTopInSystem(rows, reserve, row)
        const rowEl = svgElement('g', {
          transform: `translate(${-system.startX}, ${rounded(rowTop - row.y0)})`,
          class: 'm3n-jianpu-system',
          'data-system-start': system.fromMeasure + 1,
        })
        const groups = rowMeasureGroups.get(row.staff)
        const offsets = justificationOffsets(
          data,
          starts.get(row.staff) ?? new Map(),
          ends.get(row.staff) ?? new Map(),
          system,
          Math.max(1, options.width - SYSTEM_RIGHT_MARGIN),
        )
        for (let measureIndex = system.fromMeasure; measureIndex <= system.toMeasure; measureIndex += 1) {
          const group = groups?.get(measureIndex)
          if (!group) continue
          const isSystemStart = measureIndex === system.fromMeasure
          const clone = cloneMeasureGroup(group, isSystemStart && system.fromMeasure > 0)
          if (!clone) continue
          const offset = offsets.get(measureIndex) ?? 0
          if (offset > 0.5) clone.setAttribute('transform', `translate(${rounded(offset)}, 0)`)
          rowEl.append(clone)
        }
        stretchTies(rowEl, offsets, data)
        svg.append(rowEl)
      }
    }
    if (index === 0) addScoreHeaderToSvg(svg, options.headerMetadata, viewWidth, viewHeight)
    return svg
  })
}

/** Clones a measure group, dropping the leading barline when a new system starts. */
function cloneMeasureGroup(group: SVGGElement, dropLeadingBar: boolean) {
  const clone = group.cloneNode(true) as SVGGElement
  if (!dropLeadingBar) return clone
  for (const node of [...clone.children]) {
    if (node.tagName === 'path' && node.getAttribute('class') === undefined) {
      const x = barPathX(node)
      const startX = leadingBarX(group)
      if (startX !== undefined && x !== undefined && x < startX && startX - x < 20) node.remove()
    }
  }
  return clone
}

function leadingBarX(group: SVGGElement) {
  let minX = Number.POSITIVE_INFINITY
  for (const block of group.querySelectorAll<SVGGElement>('g[data-block-start]')) {
    const box = block.getBBox()
    minX = Math.min(minX, box.x)
  }
  return Number.isFinite(minX) ? minX : undefined
}

function decorateRow(
  data: JianpuScoreData,
  row: RenderedRow,
  groups: ReadonlyMap<number, SVGGElement>,
  starts: ReadonlyMap<number, number>,
  ends: ReadonlyMap<number, number>,
  noteHeight: number,
  fontFamily: string,
  systemStarts: ReadonlySet<number>,
) {
  const melody = row.staff === 'melody'
  const labelsY = row.y0 - 12
  const lyricBase = LYRIC_TOP_FACTOR * noteHeight
  const numberFont = Math.round(noteHeight * 1.2)
  const smallFont = Math.round(noteHeight * 0.9)
  const laneA = labelsY - 3 * smallFont - 18
  const laneB = labelsY - 2 * smallFont - 12
  const laneC = labelsY - smallFont - 6
  const laneD = labelsY
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
      const showKey = index === 0 || keyChanged || systemStarts.has(index)
      const showMeter = index === 0 || meterChanged
      if (showKey || showMeter) {
        const label = [
          showKey && key ? `1=${PITCH_CLASS_LABELS[key.key % 12] ?? 'C'}` : '',
          showMeter && meter ? `${meter.numerator}/${meter.denominator}` : '',
        ].filter(Boolean).join(' ')
        if (label) {
          const text = svgElement('text', {
            x: startX,
            y: laneC,
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
            y: laneA,
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
          y: laneD,
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
          y: laneD,
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
          y: laneB,
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
          y: laneD,
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
      drawLyrics(data, row, group, measure, lyricBase, LYRIC_FONT, fontFamily, starts)
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
          cy: -noteHeight * 0.72,
          r: 2,
          class: 'm3n-jianpu-staccato',
          fill: '#20242b',
        }))
      }
      if (note.trill) {
        const text = svgElement('text', {
          x: (row.blockXs.get(note.start) ?? 0) + (row.blockWidths.get(note.start) ?? 0) + 3,
          y: 2,
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
          x: (row.blockXs.get(note.start) ?? 0) + (row.blockWidths.get(note.start) ?? 0) + 3,
          y: 2,
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

  for (const group of groups.values()) {
    for (const noteGroup of group.querySelectorAll<SVGGElement>('g[data-id]')) {
      const texts = [...noteGroup.children].filter((child) => child.tagName === 'text')
      if (texts.length !== 2) continue
      const accidental = texts[0]?.textContent?.trim()
      const number = texts[1]?.getAttribute('x')
      if ((accidental === '#' || accidental === 'b') && number !== null) {
        texts[0]?.setAttribute('x', String(Number(number) - 2))
      }
    }
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
  const seen = new Set<string>()
  const lyrics = data.lyrics.filter((lyric) => {
    if (
      lyric.staff !== row.staff
      || lyric.start < measure.start - 1e-6
      || lyric.start >= measure.start + measure.length - 1e-6
    ) return false
    const key = `${lyric.start}:${lyric.verse}:${lyric.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
