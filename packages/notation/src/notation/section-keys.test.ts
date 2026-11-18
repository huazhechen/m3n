import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '../m3n-direct.js'
import { formatM3N } from '../m3n-format.js'
import { validateM3NDiagnostics } from '../m3n-validate.js'
import { compileScorePerformance } from '../performance.js'
import { unfoldScorePerformance } from './performance-order.js'
import { sectionOrderLabels } from './section-keys.js'

const source = '{key=C}{2/4}{order=A,B,A@Db,A}\n===A\nN: 1 2 ||\nL: 春天\nB: 1d^ |\n===B\nN: 3 4 ||\nB: 5d^ |'

describe('keyed section visits', () => {
  it('preserves a compact source and restores the entry key on unqualified returns', () => {
    expect(validateM3NDiagnostics(source)).toEqual([])
    const document = parseM3NDocument(source), before = structuredClone(document)
    expect(document.order).toEqual(['A','B','A','A'])
    expect(document.orderKeys).toEqual([undefined,undefined,'Db',undefined])
    expect(sectionOrderLabels(document)).toEqual(['A（1=C）','B','A（1=D♭）','A（1=C）'])
    expect(unfoldScorePerformance(document).parts.get('score')!.melody.map(bar => bar.events[0]!.key)).toEqual(['C','C','Db','C'])
    const performance = compileScorePerformance(document)
    expect(performance.notes.filter(note => note.channel === 0).map(note => note.pitch)).toEqual([60,62,64,65,61,63,60,62])
    expect(performance.notes.filter(note => note.channel === 1).map(note => note.pitch)).toEqual([48,55,49,48])
    expect(performance.elements.filter(item => item.voice.endsWith('melody')).map(item => [item.xmlId,item.rendition]))
      .toEqual([['m3n-e-1',1],['m3n-e-2',1],['m3n-e-4',1],['m3n-e-5',1],['m3n-e-1',2],['m3n-e-2',2],['m3n-e-1',3],['m3n-e-2',3]])
    expect(document).toEqual(before)
    const formatted = parseM3NDocument(formatM3N(source))
    expect(formatted.orderKeys).toEqual(document.orderKeys)

  })

  it('supports minor visits and visit-based endings in the target key', () => {
    const input = '{key=Am}{2/4}{order=A,A@Bbm}\n===A\nN: 6 7 |\n---V1\nN: 1 2 ||\n---V2\nN: 3 4 ||'
    expect(validateM3NDiagnostics(input)).toEqual([])
    expect(compileScorePerformance(parseM3NDocument(input)).notes.map(note => note.pitch)).toEqual([69,71,60,62,70,72,65,66])
  })

  it('keeps explicit octave bases when crossing B to C and resets unqualified visits', () => {
    const input = '{key=Bb}{2/4}{order=A,A@C5,A@F5,A}\n===A\nN: 6{ac(5)} 2e ||\nB: 1d^ |'
    expect(validateM3NDiagnostics(input)).toEqual([])
    const document = parseM3NDocument(input)
    expect(document.orderKeys).toEqual([undefined, 'C', 'F', undefined])
    expect(document.orderKeyOctaves).toEqual([undefined, 5, 5, undefined])
    expect(parseM3NDocument(formatM3N(input)).orderKeyOctaves).toEqual(document.orderKeyOctaves)
    expect(sectionOrderLabels(document)).toEqual(['A（1=B♭）', 'A（1=C）', 'A（1=F）', 'A（1=B♭）'])
    const performance = compileScorePerformance(document)
    const original = performance.notes.filter(note => note.start < 2)
    for (const [visit, shift] of [[1, 2], [2, 7], [3, 0]]) {
      expect(performance.notes.filter(note => note.start >= visit! * 2 && note.start < (visit! + 1) * 2)
        .map(note => [note.start - visit! * 2, note.end - visit! * 2, note.pitch, note.channel]))
        .toEqual(original.map(note => [note.start, note.end, note.pitch + shift!, note.channel]))
    }
    expect(unfoldScorePerformance(document).orderKeyOctaves).toBeUndefined()
  })

  it.each(['A@','A@H','A@Cfoo','A@@Db','A@Cm','A@C9','A@C-1','A@C5x'])('rejects an invalid key or mode change: %s', entry => {
    const diagnostics = validateM3NDiagnostics(`{2/4}{order=${entry}}\n===A\nN: 1 2 ||`)
    expect(diagnostics.some(item=>item.code==='M3N_SECTION_ORDER')).toBe(true)
  })
})
