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
}

export type TimedScoreElement = { xmlId: string; rendition: number }

function normalizeScale(scale: number | undefined) {
  if (!Number.isFinite(scale)) return 42
  return Math.max(1, Math.min(1000, scale ?? 42))
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

  prepareLayout({ width, scale = 42, includeBass = true }: ScoreLayout) {
    const effectiveScale = normalizeScale(scale)
    const layoutMei = includeBass ? this.mei : withoutBassStaff(this.mei)
    this.toolkit.setOptions({
      adjustPageHeight: true,
      breaks: layoutMei.includes('<sb/>') ? 'encoded' : 'auto',
      footer: 'none',
      header: 'none',
      lyricTopMinMargin: 4,
      pageHeight: 60000,
      pageMarginTop: 8,
      pageWidth: Math.max(800, Math.round(width * 100 / effectiveScale)),
      scale: effectiveScale,
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
