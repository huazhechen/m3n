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

export function layoutSegments(mei: string) {
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

export function layoutFragment(mei: string, measureIds: readonly string[]) {
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

type MeiNote = { id: string; staff: string; attributes: Record<string, string> }

function attribute(tag: string, name: string) {
  return new RegExp(`\\b${name.replace('.', '\\\\.')}="([^"]*)"`).exec(tag)?.[1]
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function firstPitchedNote(content: string, staff: string): MeiNote | undefined {
  const measure = /<measure\b[\s\S]*?<\/measure>/.exec(content)?.[0]
  const staffContent = measure && new RegExp(`<staff\\b(?=[^>]*\\bn="${escapeRegExp(staff)}")[^>]*>[\\s\\S]*?<\\/staff>`).exec(measure)?.[0]
  const tag = staffContent && /<note\b[^>]*>/.exec(staffContent)?.[0]
  const id = tag && attribute(tag, 'xml:id')
  if (!tag || !id) return undefined
  return {
    id,
    staff,
    attributes: Object.fromEntries(['pname', 'oct', 'dur', 'accid', 'accid.ges'].flatMap((name) => {
      const value = attribute(tag, name)
      return value === undefined ? [] : [[name, value]]
    })),
  }
}

function samePitch(left: MeiNote, right: MeiNote) {
  return ['pname', 'oct', 'accid', 'accid.ges'].every((name) => left.attributes[name] === right.attributes[name])
}

function lastMeasure(content: string) {
  return [...content.matchAll(/<measure\b[\s\S]*?<\/measure>/g)].at(-1)?.[0]
}

function appendGhostTie(ending: string, target: MeiNote, ghostIndex: number) {
  const measure = /<measure\b[\s\S]*?<\/measure>/.exec(ending)?.[0]
  if (!measure) return ending
  const ghostId = `m3n-layout-ghost-${ghostIndex}`
  const attributes = ['pname', 'oct', 'dur', 'accid', 'accid.ges']
    .flatMap((name) => target.attributes[name] === undefined ? [] : [`${name}="${target.attributes[name]}"`])
    .join(' ')
  const targetPattern = new RegExp(`(<note\\b(?=[^>]*\\bxml:id="${escapeRegExp(target.id)}")[^>]*>)`)
  const updatedMeasure = measure
    .replace(targetPattern, `<graceGrp attach="post"><note xml:id="${ghostId}" ${attributes} grace="unacc" visible="false"/></graceGrp>$1`)
    .replace('</measure>', `<tie startid="#${ghostId}" endid="#${target.id}"/></measure>`)
  return ending.replace(measure, updatedMeasure)
}

/** Adds layout-only tie anchors for later matching alternate endings. */
export function projectEndingTieGhosts(mei: string) {
  let ghostIndex = 0
  return mei.replace(/(<section\b(?=[^>]*\bxml:id="m3n-segment-[^"]+")[\s\S]*?<\/section>)((?:\s*<ending\b[\s\S]*?<\/ending>){2,})/g, (group, sharedSection: string, endingSource: string) => {
    const endings = [...endingSource.matchAll(/<ending\b[\s\S]*?<\/ending>/g)].map((match) => match[0])
    const firstEnding = endings[0]
    const measure = lastMeasure(sharedSection)
    if (!firstEnding || !measure) return group
    const ties = [...measure.matchAll(/<tie\b(?=[^>]*\bendid="#([^"]+)")[^>]*\/>/g)]
    for (const tie of ties) {
      const endId = tie[1]
      if (!endId || !firstEnding.includes(`xml:id="${endId}"`)) continue
      const targetTag = new RegExp(`<note\\b(?=[^>]*\\bxml:id="${escapeRegExp(endId)}")[^>]*>`).exec(firstEnding)?.[0]
      const staff = targetTag && /<staff\b(?=[^>]*\bn="([^"]+)")[^>]*>[\s\S]*?$/.exec(firstEnding.slice(0, firstEnding.indexOf(targetTag)))?.[1]
      if (!targetTag || !staff) continue
      const target = { id: endId, staff, attributes: Object.fromEntries(['pname', 'oct', 'dur', 'accid', 'accid.ges'].flatMap((name) => {
        const value = attribute(targetTag, name)
        return value === undefined ? [] : [[name, value]]
      })) }
      for (let index = 1; index < endings.length; index += 1) {
        const laterTarget = firstPitchedNote(endings[index] ?? '', staff)
        if (!laterTarget || !samePitch(target, laterTarget)) continue
        endings[index] = appendGhostTie(endings[index] ?? '', laterTarget, ++ghostIndex)
      }
    }
    return `${sharedSection}${endings.join('')}`
  })
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
    let layoutMei = projectEndingTieGhosts(includeBass ? this.mei : withoutBassStaff(this.mei))
    const layoutOptions = {
      adjustPageHeight: true,
      footer: 'none',
      header: 'none',
      lyricTopMinMargin: 0,
      pageHeight: 60000,
      pageMarginTop: 8,
      pageWidth: Math.max(800, Math.round(width * 100 / effectiveScale)),
      scale: effectiveScale,
      svgCss: '.m3n-text-underline .rend { text-decoration: underline; }',
      svgViewBox: true,
    }
    const segments = layoutSegments(layoutMei)
    if (segments.length > 1) {
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
    this.toolkit.setOptions({ ...layoutOptions, breaks: layoutMei.includes('<sb/>') ? 'encoded' : 'auto' })
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
