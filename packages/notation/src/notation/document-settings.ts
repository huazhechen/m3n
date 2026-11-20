import type { M3NSyntaxTree } from './syntax-tree.js'
import { parseSectionOrderEntry } from './section-keys.js'

export const metadataNames = ['title', 'subtitle', 'singer', 'composer', 'lyricist', 'arranger', 'origin', 'copyright', 'note', 'transpose'] as const

/** Only opening directives establish defaults; subsequent directives belong to the event timeline. */
export function documentSettings(tree: M3NSyntaxTree) {
  const metadata: Record<(typeof metadataNames)[number], string> = {
    title: '', subtitle: '', singer: '', composer: '', lyricist: '', arranger: '',
    origin: '', copyright: '', note: '', transpose: '',
  }
  const headerLines = new Set(tree.lines.filter(line => line.kind === 'header').map(line => line.line))
  let equalMeasures = false
  let minimumCoreGapEm: number | undefined
  let order: string[] | undefined
  let orderKeys: Array<string | undefined> | undefined
  let orderKeyOctaves: Array<number | undefined> | undefined
  for (const directive of tree.directives) {
    if (!headerLines.has(directive.line) || directive.closing) continue
    const name = metadataNames.find(name => name === directive.name)
    if (name) metadata[name] = directive.value?.trim() ?? ''
    if (directive.name === 'order') {
      const entries = (directive.value ?? '').split(',').map(parseSectionOrderEntry)
      order = entries.map(entry => entry.name)
      orderKeyOctaves = entries.some(entry => entry.octave !== undefined) ? entries.map(entry => entry.octave) : undefined
      orderKeys = entries.some(entry => entry.key !== undefined) ? entries.map(entry => entry.key) : undefined
    }
    if (directive.name === 'equal-measures') equalMeasures = directive.value === 'true'
    if (directive.name === 'leading' && /^\d+(?:\.\d+)?$/.test(directive.value ?? '') && Number.isFinite(Number(directive.value))) minimumCoreGapEm = Number(directive.value)
  }

  let key = 'C'
  let initialKeyPasses: string[] | undefined
  let meterCount = 4
  let meterUnit = 4
  let tempo = 120
  let hasExplicitTempo = false
  for (const token of tree.tokens) {
    if (token.kind === 'note' || token.kind === 'group' || token.kind === 'bar') break
    if (token.kind !== 'attribute') continue
    const value = token.content ?? ''
    if (value.startsWith('rest=')) break
    if (value.startsWith('key=')) {
      const keys = value.slice(4).split(',').map(key => key.trim())
      key = keys[0]!
      initialKeyPasses = keys.length > 1 ? keys : undefined
    }
    const meter = /^(\d+)\/(\d+)$/.exec(value)
    if (meter) {
      meterCount = Number(meter[1])
      meterUnit = Number(meter[2])
    }
    const speed = /^(\d+)qpm$/.exec(value)
    if (speed) {
      tempo = Number(speed[1])
      hasExplicitTempo = true
    }
  }
  return { ...metadata, ...(order ? {order} : {}), ...(orderKeys ? {orderKeys} : {}), ...(orderKeyOctaves ? {orderKeyOctaves} : {}), equalMeasures, ...(minimumCoreGapEm !== undefined ? {minimumCoreGapEm} : {}), key, initialKeyPasses, meterCount, meterUnit, tempo, hasExplicitTempo }
}
