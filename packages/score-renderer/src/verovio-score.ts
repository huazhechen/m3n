import createVerovioModule from 'verovio/wasm' 
import { VerovioToolkit } from 'verovio/esm'

let modulePromise: ReturnType<typeof createVerovioModule> | undefined

function getModule() {
  modulePromise ??= createVerovioModule()
  return modulePromise
}

function base64ToArrayBuffer(value: string) {
  const binary = atob(value.replace(/^data:audio\/midi;base64,/, ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

type ScoreLayout = {
  width: number
  pageHeight?: number
  scale?: number
  includeBass?: boolean
}

type TimedScoreElement = { xmlId: string; rendition: number }

function normalizeScale(scale: number | undefined) {
  if (!Number.isFinite(scale)) return 42
  return Math.max(1, Math.min(1000, scale ?? 42))
}

function layoutSegments(mei: string) {
  const document = new DOMParser().parseFromString(mei, 'application/xml')
  const segments: string[][] = []
  let measures: string[] = []
  for (const element of document.querySelectorAll('measure, sb')) {
    if (element.localName === 'sb') {
      if (measures.length > 0) segments.push(measures)
      measures = []
      continue
    }
    const id = element.getAttribute('xml:id')
    if (id) measures.push(id)
  }
  if (measures.length > 0) segments.push(measures)
  return segments
}

function layoutFragment(mei: string, measureIds: readonly string[]) {
  const document = new DOMParser().parseFromString(mei, 'application/xml')
  const selected = new Set(measureIds)
  for (const sb of document.querySelectorAll('sb')) sb.remove()
  for (const measure of document.querySelectorAll('measure')) {
    if (!selected.has(measure.getAttribute('xml:id') ?? '')) measure.remove()
  }
  for (const expansion of document.querySelectorAll('expansion')) expansion.remove()
  for (const container of [...document.querySelectorAll('section, ending')].reverse()) {
    if (!container.querySelector('measure')) container.remove()
  }
  const presentIds = new Set([...document.querySelectorAll('*')]
    .map((element) => element.getAttribute('xml:id'))
    .filter((id): id is string => Boolean(id)))
  for (const element of document.querySelectorAll('[startid], [endid]')) {
    const references = [element.getAttribute('startid'), element.getAttribute('endid')]
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => value.split(/\s+/).map((reference) => reference.replace(/^#/, '')))
    if (references.some((reference) => !presentIds.has(reference))) element.remove()
  }
  return new XMLSerializer().serializeToString(document)
}

export function automaticSystemBreakMeasureIds(svgPages: readonly string[]) {
  return new Set(svgPages.flatMap((svg) => svg
    .split('class="system"')
    .slice(1)
    .map((system) => [...system.matchAll(/id="(m3n-measure-[^"]+)"/g)].at(-1)?.[1])
    .filter((id): id is string => Boolean(id))))
}

export function encodeSystemBreaks(mei: string, measureIds: ReadonlySet<string>) {
  if (measureIds.size === 0) return mei
  return mei
    .replace(/(<measure\b[^>]*\bxml:id="([^"]+)"[^>]*>[\s\S]*?<\/measure>)/g, (measure, _element, id: string) => (
      measureIds.has(id) ? `${measure}<sb/>` : measure
    ))
    .replace(/<\/measure>\s*(?:<sb\/>\s*){2,}/g, '</measure><sb/>')
}

type EncodedSystem = {
  top: number
  bottom: number
  firstMeasure: string | undefined
}

/** Reads each system's staff position and first measure from an encoded-break SVG. */
export function encodedSystemLayout(svg: string): EncodedSystem[] {
  return svg.split(/<g[^>]*class="system"/).slice(1).map((chunk) => {
    const bar = /<path d="M13 ([\d.]+) L13 ([\d.]+)"/.exec(chunk)
    const measureNumbers = [...chunk.matchAll(/<text[^>]*y="([\d.]+)"/g)].map((match) => Number(match[1]))
    const top = bar ? Number(bar[1]) : (measureNumbers.length > 0 ? Math.min(...measureNumbers) : Number.NaN)
    return {
      top,
      bottom: bar ? Number(bar[2]) : Number.NaN,
      firstMeasure: /id="(m3n-measure-[^"]+)"/.exec(chunk)?.[1],
    }
  })
}

/**
 * Groups encoded systems into pages of a fixed height and returns the first
 * measure id of each page that follows the first one.
 */
export function pageBreakMeasureIds(systems: readonly EncodedSystem[], capacity: number): string[] {
  const first = systems[0]
  if (!first || !Number.isFinite(first.top) || !Number.isFinite(first.bottom)) return []
  const startY = first.top
  const staffHeight = first.bottom - first.top
  const heights = systems.map((system, index) => {
    const next = systems[index + 1]
    if (next && Number.isFinite(next.top)) return next.top - system.top
    const previous = systems[index - 1]
    if (previous && Number.isFinite(previous.top) && Number.isFinite(system.top)) return system.top - previous.top
    return staffHeight + 1440
  })
  const safeCapacity = capacity - 200
  const breaks: string[] = []
  let usedPitch = 0
  for (let index = 0; index < systems.length; index++) {
    const system = systems[index]
    if (!system) continue
    if (index > 0 && startY + usedPitch + staffHeight > safeCapacity) {
      const firstMeasure = system.firstMeasure
      if (firstMeasure) breaks.push(firstMeasure)
      usedPitch = 0
    }
    usedPitch += heights[index] ?? 0
  }
  return breaks
}

export class VerovioScore {
  private readonly toolkit: VerovioToolkit
  private readonly mei: string

  private constructor(toolkit: VerovioToolkit, mei: string) {
    this.toolkit = toolkit
    this.mei = mei
  }

  static async create(mei: string) {
    const toolkit = new VerovioToolkit(await getModule())
    return new VerovioScore(toolkit, mei)
  }

  prepareLayout({ width, pageHeight, scale = 42, includeBass = true }: ScoreLayout) {
    const effectiveScale = normalizeScale(scale)
    const fixedPageHeight = pageHeight !== undefined
    let layoutMei = includeBass ? this.mei : withoutBassStaff(this.mei)
    const layoutOptions = {
      adjustPageHeight: !fixedPageHeight,
      footer: 'none',
      header: 'none',
      lyricTopMinMargin: 0,
      pageHeight: pageHeight === undefined ? 60000 : Math.max(800, Math.round(pageHeight * 100 / effectiveScale)),
      pageMarginTop: 8,
      pageWidth: Math.max(800, Math.round(width * 100 / effectiveScale)),
      scale: effectiveScale,
      svgCss: '.m3n-text-underline .rend { text-decoration: underline; }',
      svgViewBox: true,
    }
    const hasEncodedBreaks = layoutMei.includes('<sb/>')
    if (fixedPageHeight && hasEncodedBreaks) {
      this.toolkit.setOptions({ ...layoutOptions, breaks: 'encoded' })
      if (!this.toolkit.loadData(layoutMei)) {
        throw new Error(this.toolkit.getLog() || 'Verovio 无法重排当前 MEI 乐谱。')
      }
      const breaks = pageBreakMeasureIds(encodedSystemLayout(this.toolkit.renderToSVG(1)), layoutOptions.pageHeight * 10)
      for (const measureId of breaks) {
        layoutMei = layoutMei.replace(`<measure xml:id="${measureId}"`, `<pb/><measure xml:id="${measureId}"`)
      }
    }
    const segments = layoutSegments(layoutMei)
    if (!fixedPageHeight && segments.length > 1) {
      const automaticBreaks = new Set<string>()
      for (const segment of segments) {
        this.toolkit.setOptions({ ...layoutOptions, breaks: 'auto' })
        if (!this.toolkit.loadData(layoutFragment(layoutMei, segment))) {
          throw new Error(this.toolkit.getLog() || 'Verovio 无法重排当前 MEI 乐谱。')
        }
        const breaks = automaticSystemBreakMeasureIds(Array.from(
          { length: this.toolkit.getPageCount() },
          (_, index) => this.toolkit.renderToSVG(index + 1),
        ))
        breaks.delete(segment.at(-1) ?? '')
        breaks.forEach((id) => automaticBreaks.add(id))
      }
      layoutMei = encodeSystemBreaks(layoutMei, automaticBreaks)
    }
    this.toolkit.setOptions({
      ...layoutOptions,
      breaks: fixedPageHeight ? (hasEncodedBreaks ? 'encoded' : 'auto') : (layoutMei.includes('<sb/>') ? 'encoded' : 'auto'),
    })
    if (!this.toolkit.loadData(layoutMei)) {
      throw new Error(this.toolkit.getLog() || 'Verovio 无法重排当前 MEI 乐谱。')
    }
    return this.toolkit.getPageCount()
  }

  renderPage(page: number) {
    return this.toolkit.renderToSVG(page)
  }

  layout(options: ScoreLayout) {
    const pageCount = this.prepareLayout(options)
    return Array.from({ length: pageCount }, (_, index) => this.renderPage(index + 1)).join('')
  }

  midi() {
    if (!this.toolkit.loadData(this.mei)) {
      throw new Error(this.toolkit.getLog() || 'Verovio 无法生成 MIDI。')
    }
    return base64ToArrayBuffer(this.toolkit.renderToMIDI())
  }

  elementsAtTime(milliseconds: number) {
    const elements = this.toolkit.getElementsAtTime(milliseconds)
    return [...(elements.notes ?? []), ...(elements.chords ?? [])]
      .map((id): TimedScoreElement => {
        const match = /-rend(\d+)$/.exec(id)
        return { xmlId: id.replace(/-rend\d+$/, ''), rendition: Number(match?.[1] ?? 1) }
      })
  }

  timeForElement(xmlId: string) {
    return this.toolkit.getTimeForElement(xmlId)
  }

  destroy() {
    this.toolkit.destroy()
  }
}

function withoutBassStaff(mei: string) {
  const document = new DOMParser().parseFromString(mei, 'application/xml')
  for (const element of document.querySelectorAll('staffDef[n="2"], staff[n="2"]')) {
    element.remove()
  }
  const staffGroup = document.querySelector('staffGrp')
  staffGroup?.setAttribute('symbol', 'none')
  return new XMLSerializer().serializeToString(document)
}
