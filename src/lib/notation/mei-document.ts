import { parseKey } from './m3n-primitives'
import type { ScoreDocument } from './score-document'
import { escapeXml } from './mei-xml'

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
  const responsibility = [
    document.singer ? ['singer', document.singer, 'Singer'] : null,
    document.composer ? ['composer', document.composer, 'Composer'] : null,
    document.lyricist ? ['lyricist', document.lyricist, 'Lyricist'] : null,
    document.arranger ? ['arranger', document.arranger, 'Arranger'] : null,
  ].filter((item): item is [string, string, string] => item !== null).flatMap(([role, name, label]) => [
    '        <respStmt>', `          <persName role="${role}">${escapeXml(name)}</persName>`,
    `          <resp>${label}</resp>`, '        </respStmt>',
  ])
  const signature = meiKeySignature(document.key)
  const staffDefs = [
    `<staffGrp symbol="${hasBassStaff ? 'brace' : 'none'}" bar.thru="true">`,
    `  <staffDef n="1" lines="5" clef.shape="G" clef.line="2" meter.count="${document.meterCount}" meter.unit="${document.meterUnit}" midi.instrnum="0"><keySig sig="${signature}"/></staffDef>`,
    ...(hasBassStaff ? [`  <staffDef n="2" lines="5" clef.shape="F" clef.line="4" meter.count="${document.meterCount}" meter.unit="${document.meterUnit}" midi.instrnum="0"><keySig sig="${signature}"/></staffDef>`] : []),
    '</staffGrp>',
  ]
  return [
    '<?xml version="1.0" encoding="UTF-8"?>', '<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">',
    '  <meiHead>', '    <fileDesc>', '      <titleStmt>',
    `        <title type="main">${escapeXml(document.title)}</title>`,
    ...(document.subtitle ? [`        <title type="subordinate">${escapeXml(document.subtitle)}</title>`] : []),
    ...responsibility, '      </titleStmt>', '      <pubStmt/>',
    ...(document.source ? ['      <sourceDesc>', `        <source><bibl>${escapeXml(document.source)}</bibl></source>`, '      </sourceDesc>'] : []),
    '    </fileDesc>', '  </meiHead>', '  <music>', '    <body>', '      <mdiv>', '        <score>',
    `          <scoreDef midi.bpm="${document.tempo}">`,
    ...staffDefs.map((line) => `            ${line}`), '          </scoreDef>', '          <section xml:id="m3n-score-section">',
    ...sectionContent.split('\n').map((line) => `            ${line}`),
    '          </section>', '        </score>', '      </mdiv>', '    </body>', '  </music>', '</mei>',
  ].join('\n')
}
