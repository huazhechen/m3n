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

export type ScoreLayout = {
  width: number
  scale?: number
  includeBass?: boolean
  invalidMeasureIds?: readonly string[]
}

export type TimedScoreElement = { xmlId: string; rendition: number }

function normalizeScale(scale: number | undefined) {
  if (!Number.isFinite(scale)) return 42
  return Math.max(1, Math.min(1000, scale ?? 42))
}

export function layoutBreaks() {
  return 'line'
}

export function markInvalidMeasures(mei: string, measureIds: readonly string[]) {
  if (measureIds.length === 0) return mei
  const ids = new Set(measureIds)
  const document = new DOMParser().parseFromString(mei, 'application/xml')
  for (const measure of document.querySelectorAll('measure')) {
    if (!ids.has(measure.getAttribute('xml:id') ?? '')) continue
    const type = measure.getAttribute('type')
    measure.setAttribute('type', type ? `${type} m3n-invalid-measure` : 'm3n-invalid-measure')
  }
  return new XMLSerializer().serializeToString(document)
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

  prepareLayout({ width, scale = 42, includeBass = true, invalidMeasureIds = [] }: ScoreLayout) {
    const effectiveScale = normalizeScale(scale)
    const layoutMei = markInvalidMeasures(includeBass ? this.mei : withoutBassStaff(this.mei), invalidMeasureIds)
    this.toolkit.setOptions({
      adjustPageHeight: true,
      breaks: layoutBreaks(),
      footer: 'none',
      header: 'none',
      lyricTopMinMargin: 0,
      pageHeight: 60000,
      pageMarginTop: 8,
      pageWidth: Math.max(800, Math.round(width * 100 / effectiveScale)),
      scale: effectiveScale,
      svgCss: '.m3n-text-underline .rend { text-decoration: underline; }',
      svgViewBox: true,
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

export function withoutBassStaff(mei: string) {
  const document = new DOMParser().parseFromString(mei, 'application/xml')
  for (const element of document.querySelectorAll('staffDef[n="2"], staff[n="2"]')) {
    element.remove()
  }
  const staffGroup = document.querySelector('staffGrp')
  staffGroup?.setAttribute('symbol', 'none')
  return new XMLSerializer().serializeToString(document)
}
