import { parseKey } from './m3n-primitives'
import type { ScoreDocument } from './score-document'
import { create, fragment } from 'xmlbuilder2/lib/xmlbuilder2.min.js'

export type ScoreHeaderMetadata = { value: string; side: 'left' | 'right' | 'center'; priority: number }

export function meiKeySignature(rawKey: string) {
  const pitchClasses: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  const { tonic, mode } = parseKey(rawKey)
  const tonicPitch = (pitchClasses[tonic[0] ?? 'C'] ?? 0) + (tonic.endsWith('#') ? 1 : tonic.endsWith('b') ? -1 : 0)
  const relativeMajor = (tonicPitch + ({ m: 3, dor: 10, phr: 8, lyd: 5, mix: 7, loc: 1 }[mode] ?? 0) + 12) % 12
  const fifths = [0, 7, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5][relativeMajor] ?? 0
  return fifths === 0 ? '0' : `${Math.abs(fifths)}${fifths > 0 ? 's' : 'f'}`
}

export function scoreHeaderMetadata(document: ScoreDocument): ScoreHeaderMetadata[] {
  return ([
    { value: document.title, side: 'center', priority: 0 },
    { value: document.subtitle, side: 'center', priority: 10 },
    { value: document.singer || document.composer, side: 'right', priority: 20 },
  ] satisfies ScoreHeaderMetadata[]).filter((item) => item.value)
}

export function meiDocumentXml(document: ScoreDocument, sectionContent: string, hasBassStaff: boolean) {
  const responsibilities = [
    document.singer ? ['singer', document.singer, 'Singer'] : null,
    document.composer ? ['composer', document.composer, 'Composer'] : null,
    document.lyricist ? ['lyricist', document.lyricist, 'Lyricist'] : null,
    document.arranger ? ['arranger', document.arranger, 'Arranger'] : null,
  ].filter((item): item is [string, string, string] => item !== null)
  const signature = meiKeySignature(document.key)
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('mei', {
    xmlns: 'http://www.music-encoding.org/ns/mei', meiversion: '5.1',
  })
  const fileDesc = root.ele('meiHead').ele('fileDesc')
  const titleStmt = fileDesc.ele('titleStmt')
  titleStmt.ele('title', { type: 'main' }).txt(document.title)
  if (document.subtitle) titleStmt.ele('title', { type: 'subordinate' }).txt(document.subtitle)
  for (const [role, name, label] of responsibilities) {
    const statement = titleStmt.ele('respStmt')
    statement.ele('persName', { role }).txt(name)
    statement.ele('resp').txt(label)
  }
  fileDesc.ele('pubStmt')
  if (document.source) fileDesc.ele('sourceDesc').ele('source').ele('bibl').txt(document.source)

  const score = root.ele('music').ele('body').ele('mdiv').ele('score')
  const scoreDef = score.ele('scoreDef', { 'midi.bpm': document.tempo })
  const staffGroup = scoreDef.ele('staffGrp', { symbol: hasBassStaff ? 'brace' : 'none', 'bar.thru': 'true' })
  const addStaff = (number: number, clefShape: string, clefLine: number) => {
    staffGroup.ele('staffDef', {
      n: number, lines: 5, 'clef.shape': clefShape, 'clef.line': clefLine,
      'meter.count': document.meterCount, 'meter.unit': document.meterUnit, 'midi.instrnum': 0,
    }).ele('keySig', { sig: signature })
  }
  addStaff(1, 'G', 2)
  if (hasBassStaff) addStaff(2, 'F', 4)
  score.ele('section', { 'xml:id': 'm3n-score-section' }).import(fragment(sectionContent))
  return root.end({ prettyPrint: false })
}
