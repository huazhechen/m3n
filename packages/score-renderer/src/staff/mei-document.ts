import { parseKey, type ScoreDocument } from '@m3n/notation'
import { escapeXml } from './mei-xml.js'
export function meiKeySignature(rawKey: string) {
  const { tonic, mode } = parseKey(rawKey)
  const natural: Record<string, number> = { C: 0, D: 2, E: 4, F: -1, G: 1, A: 3, B: 5 }
  const offsets: Record<string, number> = { m: -3, dor: -2, phr: -4, lyd: 1, mix: -1, loc: -5 }
  const fifths = (natural[tonic[0]!] ?? 0) + (tonic.endsWith('#') ? 7 : tonic.endsWith('b') ? -7 : 0) + (offsets[mode] ?? 0)
  return fifths === 0 ? '0' : `${Math.abs(fifths)}${fifths > 0 ? 's' : 'f'}`
}
export function meiDocumentXml(score: ScoreDocument, content: string, bass: boolean) {
  const staff = (n: number, clef: string, line: number) => `<staffDef n="${n}" lines="5" clef.shape="${clef}" clef.line="${line}" meter.count="${score.meterCount}" meter.unit="${score.meterUnit}"><keySig sig="${meiKeySignature(score.key)}"/></staffDef>`
  return `<?xml version="1.0" encoding="UTF-8"?><mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1"><meiHead><fileDesc><titleStmt><title>${escapeXml(score.title)}</title></titleStmt><pubStmt/></fileDesc></meiHead><music><body><mdiv><score><scoreDef midi.bpm="${score.tempo}"><staffGrp symbol="${bass ? 'brace' : 'none'}" bar.thru="true">${staff(1, 'G', 2)}${bass ? staff(2, 'F', 4) : ''}</staffGrp></scoreDef><section xml:id="m3n-score-section">${content}</section></score></mdiv></body></music></mei>`
}
