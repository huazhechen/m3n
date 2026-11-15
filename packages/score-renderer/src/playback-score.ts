import createVerovioModule from '../vendor/verovio/verovio-module.mjs'
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

type TimedScoreElement = { xmlId: string; rendition: number }

export function normalizePlaybackElementId(id: string): TimedScoreElement {
  const match = /-rend(\d+)$/.exec(id)
  return {
    // Verovio reports a note inside a chord as `m3n-e-12-v2`; the numbered
    // renderer deliberately binds the complete chord (and its lyric) to e-12.
    xmlId: id.replace(/-rend\d+$/, '').replace(/-v\d+$/, '').replace(/-n\d+$/, ''),
    rendition: Number(match?.[1] ?? 1),
  }
}

export class PlaybackScore {
  private readonly toolkit: VerovioToolkit
  private readonly mei: string

  private constructor(toolkit: VerovioToolkit, mei: string) {
    this.toolkit = toolkit
    this.mei = mei
  }

  static async create(mei: string) {
    const toolkit = new VerovioToolkit(await getModule())
    toolkit.setOptions({ font: 'Leipzig', fontFallback: 'Leipzig' })
    return new PlaybackScore(toolkit, mei)
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
      .map(normalizePlaybackElementId)
  }

  timeForElement(xmlId: string) {
    return this.toolkit.getTimeForElement(xmlId)
  }

  destroy() {
    this.toolkit.destroy()
  }
}
