import { parseKey } from './m3n-primitives.js' 
import type { ScoreDocument } from './score-document.js'
import { scoreCreditLines } from '../score-credits.js'
import { parse, stringify, type TNode } from 'txml/txml'

export type ScoreHeaderMetadata = { value: string; side: 'left' | 'right' | 'center'; priority: number }

export function meiKeySignature(rawKey: string) {
  const { tonic, mode } = parseKey(rawKey)
  // Preserve the written tonic: Db and C# share pitches, but have different signatures.
  const naturalFifths: Record<string, number> = { C: 0, D: 2, E: 4, F: -1, G: 1, A: 3, B: 5 }
  const accidental = tonic.endsWith('#') ? 7 : tonic.endsWith('b') ? -7 : 0
  const modeOffset = { m: -3, dor: -2, phr: -4, lyd: 1, mix: -1, loc: -5 }[mode] ?? 0
  const fifths = (naturalFifths[tonic[0] ?? 'C'] ?? 0) + accidental + modeOffset
  return fifths === 0 ? '0' : `${Math.abs(fifths)}${fifths > 0 ? 's' : 'f'}`
}

export function scoreHeaderMetadata(document: ScoreDocument): ScoreHeaderMetadata[] {
  return ([
    { value: document.title, side: 'center', priority: 0 },
    { value: document.subtitle, side: 'center', priority: 10 },
    ...scoreCreditLines(document).map((value, index) => ({ value, side: 'right' as const, priority: 20 + index })),
  ] satisfies ScoreHeaderMetadata[]).filter((item) => item.value)
}

type XmlChild = TNode | string

function xmlNode(tagName: string, attributes: Record<string, string | number> = {}, children: XmlChild[] = []): TNode {
  return {
    tagName,
    attributes: Object.fromEntries(Object.entries(attributes).map(([name, value]) => [name, String(value)])),
    children,
  }
}

export function meiDocumentXml(document: ScoreDocument, sectionContent: string, hasBassStaff: boolean) {
  const responsibilities = [
    document.singer ? ['singer', document.singer, 'Singer'] : null,
    document.composer ? ['composer', document.composer, 'Composer'] : null,
    document.lyricist ? ['lyricist', document.lyricist, 'Lyricist'] : null,
    document.arranger ? ['arranger', document.arranger, 'Arranger'] : null,
  ].filter((item): item is [string, string, string] => item !== null)
  const signature = meiKeySignature(document.key)
  const titleChildren: XmlChild[] = [xmlNode('title', { type: 'main' }, [document.title])]
  if (document.subtitle) titleChildren.push(xmlNode('title', { type: 'subordinate' }, [document.subtitle]))
  for (const [role, name, label] of responsibilities) titleChildren.push(xmlNode('respStmt', {}, [
    xmlNode('persName', { role }, [name]),
    xmlNode('resp', {}, [label]),
  ]))
  const fileDescription: XmlChild[] = [
    xmlNode('titleStmt', {}, titleChildren),
    xmlNode('pubStmt'),
  ]
  if (document.source) fileDescription.push(xmlNode('sourceDesc', {}, [xmlNode('source', {}, [xmlNode('bibl', {}, [document.source])])]))

  const staffDefinitions: XmlChild[] = []
  const addStaff = (number: number, clefShape: string, clefLine: number) => staffDefinitions.push(
    xmlNode('staffDef', {
      n: number, lines: 5, 'clef.shape': clefShape, 'clef.line': clefLine,
      'meter.count': document.meterCount, 'meter.unit': document.meterUnit,
    }, [xmlNode('keySig', { sig: signature }), xmlNode('instrDef', { 'midi.channel': number - 1, 'midi.instrnum': 0 })]),
  )
  addStaff(1, 'G', 2)
  if (hasBassStaff) addStaff(2, 'F', 4)
  const sectionChildren = parse(sectionContent, { decodeEntities: true, keepWhitespace: true, selfClosingTags: [] })
  const root = xmlNode('mei', { xmlns: 'http://www.music-encoding.org/ns/mei', meiversion: '5.1' }, [
    xmlNode('meiHead', {}, [xmlNode('fileDesc', {}, fileDescription)]),
    xmlNode('music', {}, [xmlNode('body', {}, [xmlNode('mdiv', {}, [xmlNode('score', {}, [
      xmlNode('scoreDef', { 'midi.bpm': document.tempo }, [
        xmlNode('staffGrp', { symbol: hasBassStaff ? 'brace' : 'none', 'bar.thru': 'true' }, staffDefinitions),
      ]),
      xmlNode('section', { 'xml:id': 'm3n-score-section' }, sectionChildren),
    ])])])]),
  ])
  const content = stringify(root, { encodeEntities: true })
    .replace(/<([A-Za-z][\w:.-]*)([^<>]*)><\/\1>/g, '<$1$2/>')
    .replace(/<\/rend>= /g, '</rend> = ')
  return `<?xml version="1.0" encoding="UTF-8"?>${content}`
}
