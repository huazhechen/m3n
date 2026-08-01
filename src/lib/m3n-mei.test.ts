import { describe, expect, it } from 'vitest'
import { m3nPitch } from './m3n-direct'
import { m3nToMei } from './m3n-mei'

describe('M3N to MEI conversion', () => {
  it('creates a complete MEI score with source-linked notes', () => {
    const result = m3nToMei('{title=Test} {subtitle=Sub} {composer=Composer} {lyricist=Lyricist} {arranger=Arranger} {copyright=Copyright} {note=Note} {transpose=2}\n{key=D} {3/4} {90qpm}\n1 2 3 | 4^. |||')

    expect(result.diagnostics).toEqual([])
    expect(result.title).toBe('Test')
    expect(result.mei).toContain('meiversion="5.1"')
    expect(result.mei).toContain('\n  <meiHead>\n')
    expect(result.mei).toContain('<title type="main">Test</title>')
    expect(result.mei).toContain('<title type="subordinate">Sub</title>')
    expect(result.mei).toContain('<persName role="composer">Composer</persName>')
    expect(result.mei).toContain('<persName role="lyricist">Lyricist</persName>')
    expect(result.mei).toContain('<persName role="arranger">Arranger</persName>')
    expect(result.subtitle).toBe('Sub')
    expect(result.composer).toBe('Composer')
    expect(result.lyricist).toBe('Lyricist')
    expect(result.arranger).toBe('Arranger')
    expect(result.headerMetadata).toEqual([
      { value: 'Test', side: 'center', priority: 0 },
      { value: 'Sub', side: 'center', priority: 10 },
      { value: 'Composer', side: 'right', priority: 20 },
    ])
    expect(result.mei).not.toContain('<pgHead>')
    expect(result.mei).toContain('<scoreDef midi.bpm="90"')
    expect(result.mei).toContain('<tempo xml:id="m3n-tempo-1" staff="1" tstamp="1" midi.bpm="90"><rend glyph.auth="smufl" glyph.name="metNoteQuarterUp" glyph.num="U+ECA5">&#xECA5;</rend> = 90</tempo>')
    expect(result.mei).toContain('<keySig sig="2s"/>')
    expect(result.mei).toContain('meter.count="3"')
    expect(result.mei).toContain('midi.bpm="90"')
    expect(result.mei).toContain('pname="f" oct="4"')
    expect(result.mei).toContain('pname="f" oct="4" accid.ges="s"')
    expect(result.sourceMap).toHaveLength(4)
    expect(result.sourceMap[0]?.xmlId).toMatch(/^m3n-e-/)
  })

  it('shows the singer in the header when present and otherwise falls back to the composer', () => {
    const withSinger = m3nToMei('{title=Song} {singer=Singer} {composer=Composer}\n{key=C} {4/4} 1--- |||')
    const withoutSinger = m3nToMei('{title=Instrumental} {composer=Composer}\n{key=C} {4/4} 1--- |||')

    expect(withSinger.singer).toBe('Singer')
    expect(withSinger.mei).toContain('<persName role="singer">Singer</persName>')
    expect(withSinger.headerMetadata).toContainEqual({ value: 'Singer', side: 'right', priority: 20 })
    expect(withSinger.headerMetadata).not.toContainEqual({ value: 'Composer', side: 'right', priority: 20 })
    expect(withoutSinger.headerMetadata).toContainEqual({ value: 'Composer', side: 'right', priority: 20 })
  })

  it('does not engrave an implicit default tempo', () => {
    const result = m3nToMei('{key=C} {4/4}\n1 2 3 4 |||')

    expect(result.mei).toContain('<scoreDef midi.bpm="120"')
    expect(result.mei).not.toContain('<tempo')
  })

  it('converts QPM only for the displayed metronome mark', () => {
    const cutTime = m3nToMei('{2/2} {120qpm}\n1 2 |')
    const commonTime = m3nToMei('{4/4} {120qpm}\n1 2 3 4 |')
    const compoundTime = m3nToMei('{6/8} {120qpm}\n1 2 3 4 5 6 |')

    expect(cutTime.mei).toContain('midi.bpm="120"')
    expect(cutTime.mei).toContain('glyph.name="metNoteHalfUp"')
    expect(cutTime.mei).toContain('</rend> = 60</tempo>')

    expect(commonTime.mei).toContain('midi.bpm="120"')
    expect(commonTime.mei).toContain('glyph.name="metNoteQuarterUp"')
    expect(commonTime.mei).toContain('</rend> = 120</tempo>')

    expect(compoundTime.mei).toContain('midi.bpm="120"')
    expect(compoundTime.mei).toContain('glyph.name="metNoteQuarterUp"')
    expect(compoundTime.mei).toContain('glyph.name="augmentationDot"')
    expect(compoundTime.mei).toContain('</rend> = 80</tempo>')
  })

  it('writes mid-score tempo changes using the active meter while preserving QPM', () => {
    const result = m3nToMei('{4/4} {120qpm}\n1 2 3 4 | {6/8} {90qpm}(1 2 3 4 5 6) |||')

    expect(result.mei).toContain('<tempo xml:id="m3n-tempo-2" staff="1" startid="#m3n-e-5" midi.bpm="90"><rend glyph.auth="smufl" glyph.name="metNoteQuarterUp"')
    expect(result.mei).toContain('augmentationDot')
    expect(result.mei).toContain('</rend> = 60</tempo>')
    expect(result.tempoChanges).toMatchObject([{ startBeats: 4, tempo: 90 }])
  })

  it('writes a visible ritardando direction without intermediate tempo labels', () => {
    const result = m3nToMei('{4/4} {120qpm}\n{rit=80}1 2 3 4{/} | 1 2 3 4 |||')

    expect(result.mei).toContain('<tempo staff="1" startid="#m3n-e-1" endid="#m3n-e-4" place="above" func="continuous">rit.</tempo>')
    expect(result.mei).not.toContain('midi.bpm="107"')
    expect(result.mei).not.toContain('midi.bpm="80"')
    expect(result.mei).not.toContain('<octave')
    expect(result.tempoChanges).toHaveLength(3)
  })

  it('renders and expands a D.S. al Fine navigation', () => {
    const result = m3nToMei('{4/4}\n{segno}1 2 3 4 | 5 6 7 1e{fine} ||| 1e 7 6 5{ds} ||')

    expect(result.mei).toContain('<repeatMark staff="1" startid="#m3n-e-1" func="segno"/>')
    expect(result.mei).toContain('<repeatMark staff="1" tstamp="5" place="above" func="fine">Fine</repeatMark>')
    expect(result.mei).toContain('<repeatMark staff="1" tstamp="5" place="above" func="dalSegno"/>')
    expect(result.mei).toContain('<expansion xml:id="m3n-expansion" plist="#m3n-segment-1 #m3n-segment-2 #m3n-segment-3 #m3n-segment-1 #m3n-segment-2"/>')
  })

  it('renders and expands a D.C. al Fine navigation', () => {
    const result = m3nToMei('{4/4}\n1 2 3 4 | 5 6 7 1e{fine} ||| 1e 7 6 5{dc} ||')

    expect(result.mei).toContain('<repeatMark staff="1" tstamp="5" place="above" func="fine">Fine</repeatMark>')
    expect(result.mei).toContain('<repeatMark staff="1" tstamp="5" place="above" func="daCapo"/>')
    expect(result.mei).toContain('<expansion xml:id="m3n-expansion" plist="#m3n-segment-1 #m3n-segment-2 #m3n-segment-3 #m3n-segment-1 #m3n-segment-2"/>')
  })

  it('keeps an explicitly reset tempo visible at an accelerando start', () => {
    const result = m3nToMei('{4/4} {120qpm}\n1 2 3 4 | {60qpm}1 2 3 4 | {120qpm}{accel=144}1 2 3 4{/} |||')

    expect(result.mei).toContain('<tempo xml:id="m3n-tempo-3" staff="1" startid="#m3n-e-9" midi.bpm="120">')
    expect(result.mei).toContain('<tempo staff="1" startid="#m3n-e-9" endid="#m3n-e-12" place="above" func="continuous">accel.</tempo>')
  })

  it('serializes performance marks as MEI control events', () => {
    const result = m3nToMei('{key=C} {4/4}\n{p}{lg}{cresc}{8va}1{tr}{str}{brk}{tip}{hold}{fermata}{breath}{f3} 2 | 3 4{/}{/}{/} | {decres}1 2 3 4{/} | {sfz}1 2 3 4 |||')

    expect(result.mei).toContain('<dynam staff="1" startid="#m3n-e-1">p</dynam>')
    expect(result.mei).toContain('<dynam staff="1" startid="#m3n-e-9">sfz</dynam>')
    expect(result.mei).toContain('xml:id="m3n-e-1" pname="c" oct="4" dur="4" dur.ges="16" vel="65"')
    expect(result.mei).toContain('xml:id="m3n-e-9" pname="c" oct="4" dur="4" vel="120"')
    expect(result.mei).toContain('<trill startid="#m3n-e-1"/>')
    expect(result.mei).toContain('<artic artic="acc"/>')
    expect(result.mei).toContain('<artic artic="stacciss"/>')
    expect(result.mei).toContain('<artic artic="stacc"/>')
    expect(result.mei).toContain('<artic artic="ten"/>')
    expect(result.mei).toContain('dur.ges="16"')
    expect(result.mei).toContain('vel="65"')
    expect(result.mei).toContain('<fermata startid="#m3n-e-1"/>')
    expect(result.mei).toContain('<breath startid="#m3n-e-1"/>')
    expect(result.mei).toContain('<fing startid="#m3n-e-1">3</fing>')
    expect(result.mei).toContain('<slur startid="#m3n-e-1" endid="#m3n-e-4"/>')
    expect(result.mei).toContain('<hairpin staff="1" form="cres" startid="#m3n-e-1" endid="#m3n-e-4"/>')
    expect(result.mei).toContain('<octave staff="1" dis="8" dis.place="above" startid="#m3n-e-1" endid="#m3n-e-4"/>')
    expect(result.mei).toContain('<hairpin staff="1" form="dim" startid="#m3n-e-5" endid="#m3n-e-8"/>')
  })

  it('serializes arpeggios on chord groups as MEI arpeg controls', () => {
    const result = m3nToMei('{key=C} {4/4}\n[135:h]{arp} 0 0 0 |||')

    expect(result.mei).toContain('<chord xml:id="m3n-e-1"')
    expect(result.mei).toContain('<arpeg startid="#m3n-e-1"/>')
  })

  it('serializes double accidentals with their MEI pitch values', () => {
    const result = m3nToMei('{key=C} {4/4}\n1## 2bb 1 2 |||')

    expect(result.mei).toContain('pname="c" oct="4" accid="x" accid.ges="x"')
    expect(result.mei).toContain('pname="d" oct="4" accid="ff" accid.ges="ff"')
    expect(m3nPitch('1##', 'C').accidGes).toBe('x')
    expect(m3nPitch('2bb', 'C').accidGes).toBe('ff')
  })

  it('resolves explicit accidentals relative to the key signature', () => {
    const pitch = m3nPitch('4#', 'Bb')
    const result = m3nToMei('{key=Bb} {4/4}\n4# 1 2 3 |||')

    expect(pitch).toMatchObject({ pname: 'e', accid: 'n', accidGes: 'n' })
    expect(result.mei).toContain('pname="e" oct="5" accid="n" accid.ges="n"')
    expect(result.mei).not.toContain('pname="e" oct="5" accid="s"')
  })

  it('renders chord symbols in the active key', () => {
    const result = m3nToMei('{key=C} {4/4}\n{chord=V7}1 2 | {key=Bb}3 4 |||')

    expect(result.mei).toContain('<harm staff="1" startid="#m3n-e-1">G7</harm>')
    expect(result.mei).toContain('<harm staff="1" startid="#m3n-e-3">F7</harm>')
    expect(result.mei).not.toContain('m3n-accompaniment')
  })

  it('writes mid-score key signature changes at the affected note', () => {
    const result = m3nToMei('{key=C} {4/4}\n1 2 {key=D}3 4 |||')

    expect(result.mei).toMatch(/<layer n="1">\s*<note[^>]*>.*?<note[^>]*>.*?<keySig sig="2s"\/>\s*<note/s)
    expect(result.mei).not.toMatch(/<beam>[\s\S]*<keySig/)
    expect(result.mei).toMatch(/pname="f" oct="4" accid\.ges="s"/)
  })

  it('uses a score definition for key changes at a measure boundary', () => {
    const result = m3nToMei('{key=C} {4/4}\n1 2 3 4 | {key=D}1 2 3 4 |||')

    expect(result.mei).toMatch(/<scoreDef>\s*<staffGrp>\s*<staffDef n="1"><keySig sig="2s"\/><\/staffDef>/)
    expect(result.mei).not.toMatch(/<layer n="1">\s*<keySig sig="2s"/)
  })

  it('uses score definitions and beam groups for meter changes at measure boundaries', () => {
    const result = m3nToMei('{key=C} {4/4}\n1 2 3 4 | {3/4}1 2 3 | {6/8}(1 2 3 4 5 6) |||')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toMatch(/<scoreDef>\s*<staffGrp>\s*<staffDef n="1" meter.count="3" meter.unit="4"\/>/)
    expect(result.mei).toMatch(/<scoreDef>\s*<staffGrp>\s*<staffDef n="1" meter.count="6" meter.unit="8"\/>/)
    expect(result.mei.match(/<beam>/g)).toHaveLength(2)
  })

  it('splits hyphenated English lyrics across consecutive notes', () => {
    const result = m3nToMei('{key=C} {2/4}\n1 2 |||\n{lyrics-word}\nTwin-kle\n{/}')

    expect(result.mei).toContain('<syl wordpos="i" con="d">Twin</syl>')
    expect(result.mei).toContain('<syl wordpos="t">kle</syl>')
  })

  it('maps default lyrics by character while keeping punctuation on its lyric', () => {
    const result = m3nToMei('{key=C} {2/4}\n1 2 |||\n{lyrics}\n甲，乙！\n{/}')

    expect(result.mei).toContain('<syl>甲，\u200B\u200B</syl>')
    expect(result.mei).toContain('<syl>乙！\u200B\u200B</syl>')
  })

  it('adds CJK spacing compensation only to character-based lyrics', () => {
    const result = m3nToMei('{key=C} {2/4}\n1 2 |||\n{lyrics}\n甲乙\n{/}\n{lyrics-word=2}\nhello world\n{/}')

    expect(result.mei).toContain('<verse xml:id="m3n-e-1-v1" n="1"><syl>甲\u200B</syl></verse>')
    expect(result.mei).toContain('<verse xml:id="m3n-e-2-v1" n="1"><syl>乙\u200B</syl></verse>')
    expect(result.mei).toContain('<verse xml:id="m3n-e-1-v2" n="2"><syl>hello</syl></verse>')
    expect(result.mei).toContain('<verse xml:id="m3n-e-2-v2" n="2"><syl>world</syl></verse>')
    expect(result.mei).not.toContain('hello\u200B')
  })

  it('ignores inline comments in lyric blocks', () => {
    const result = m3nToMei('{key=C} {2/4}\n1 2 |||\n{lyrics}\n甲 // 注释内容\n乙\n{/}')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<syl>甲\u200B</syl>')
    expect(result.mei).toContain('<syl>乙\u200B</syl>')
    expect(result.mei).not.toContain('注释内容')
  })

  it('does not open a lyric block declared inside a comment', () => {
    const result = m3nToMei('{key=G} {4/4}\n((3 3 4 5)) ((3 3 4 5)) ((3 3 4 5)) ((3 3 4 5)) :|||\n{lyrics=1}一二三四一二三四一二三四一二三四{/}\n// {lyrics-word=2}hello hello hello hello hello hello hello hello hello hello hello hello hello hello hello hello {/}')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<verse xml:id="m3n-e-1-v1" n="1"><syl>一\u200B</syl></verse>')
    expect(result.mei).not.toContain(' n="2">')
    expect(result.mei).not.toContain('hello')
  })

  it('expands repeated placeholders and encodes grouped lyrics as underlined single-note text', () => {
    const result = m3nToMei('{key=C} {4/4}\n1 2 3 4 |||\n{lyrics}\n%{2} (甲乙) _{0}\n{/}')

    expect(result.mei).not.toContain('<note xml:id="m3n-e-1" pname="c" oct="4" dur="4"><verse')
    expect(result.mei).toContain('<syl type="m3n-text-underline"><rend>甲乙\u200B\u200B</rend></syl>')
    expect(result.mei).toContain('<syl con="u"></syl>')
  })

  it('underlines grouped lyric text without underlining punctuation', () => {
    const result = m3nToMei('{key=C} {2/4}\n1 2 |||\n{lyrics-word}(word,word) next{/}')

    expect(result.mei).toContain('<syl type="m3n-text-underline"><rend>word</rend>,<rend>word</rend></syl>')
  })

  it('renders lyrics for multiple repeat passes as separate verses', () => {
    const result = m3nToMei('{key=C} {2/4}\n1 2 |||\n{lyrics-word=1}\nfirst pass\n{/}\n{lyrics-word=2}\nsecond pass\n{/}')

    expect(result.mei).toContain('<verse xml:id="m3n-e-1-v1" n="1"><syl>first</syl></verse><verse xml:id="m3n-e-1-v2" n="2"><syl>second</syl></verse>')
    expect(result.mei).toContain('<verse xml:id="m3n-e-2-v1" n="1"><syl>pass</syl></verse><verse xml:id="m3n-e-2-v2" n="2"><syl>pass</syl></verse>')
  })

  it('keeps instrumental intervals lyric-free without visual markers', () => {
    const result = m3nToMei('{key=C} {2/4}\n{inst}1 2{/} | 3 4 |||\n{lyrics-word}\nla la\n{/}')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).not.toContain('<bracketSpan')
    expect(result.mei).not.toContain('<note xml:id="m3n-e-1" pname="c" oct="4" dur="4"><verse')
    expect(result.mei).toContain('<note xml:id="m3n-e-3" pname="e" oct="4" dur="4"><verse xml:id="m3n-e-3-v1" n="1"><syl>la</syl></verse></note>')
  })

  it('does not assign lyrics to tied note targets', () => {
    const source = '{key=C} {3/4}\n1~ 1 2 |||\n{lyrics-word}\nla la\n{/}'
    const result = m3nToMei(source)
    const tiedTargetStart = source.indexOf('1 2')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).not.toContain('<note xml:id="m3n-e-2" pname="c" oct="4" dur="4"><verse')
    expect(result.mei).toContain('<tie startid="#m3n-e-1" endid="#m3n-e-2"/>')
    expect(result.mei).toContain('<note xml:id="m3n-e-3" pname="d" oct="4" dur="4"><verse xml:id="m3n-e-3-v1" n="1"><syl>la</syl></verse></note>')
    expect(result.sourceMap.some((item) => item.xmlId === 'm3n-e-2' && item.sourceStart > tiedTargetStart)).toBe(false)
  })

  it('assigns a + prefixed lyric to a tied note target', () => {
    const result = m3nToMei('{key=C} {3/4}\n1~ 1 2 |||\n{lyrics-word}\nla +la la\n{/}')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<note xml:id="m3n-e-2" pname="c" oct="4" dur="4"><verse xml:id="m3n-e-2-v1" n="1"><syl>la</syl></verse></note>')
    expect(result.mei).toContain('<tie startid="#m3n-e-1" endid="#m3n-e-2"/>')
    expect(result.mei).not.toContain('>+la</syl>')
  })

  it('serializes acciaccaturas and appoggiaturas as grace notes', () => {
    const result = m3nToMei('{key=C} {4/4}\n1{ac(2)} 3{ap((45))} 5{ap(((6)))} 1e |||')

    expect(result.mei).toContain('<graceGrp attach="pre"><note pname="d" oct="4" dur="8" grace="unacc"/></graceGrp>')
    expect(result.mei).toContain('<beam><note pname="f" oct="4" dur="16" grace="acc"/><note pname="g" oct="4" dur="16" grace="acc"/></beam>')
    expect(result.mei).toContain('<graceGrp attach="pre"><note pname="a" oct="4" dur="32" grace="acc"/></graceGrp>')
    expect(result.mei).not.toContain('acciaccatura')
  })

  it('beams consecutive eighth notes by beats in 4/4', () => {
    const result = m3nToMei('{4/4}\n(5e6e5e3e) (4e5e4e2e)|||')

    expect(result.mei).toMatch(/<beam>\s*<note xml:id="m3n-e-1"/)
    expect(result.mei.match(/<beam>/g)).toHaveLength(4)
  })

  it('beams a dotted eighth note with its following sixteenth note', () => {
    const result = m3nToMei('{4/4}\n5d^~ (5d) (0) (3.) ((2)) |')

    expect(result.mei).toMatch(/<beam>\s*<note xml:id="m3n-e-4"[^>]*dur="8" dots="1"[^>]*>.*?<note xml:id="m3n-e-5"[^>]*dur="16"/s)
  })

  it('does not beam dotted eighth-sixteenth pairs across 4/4 beats', () => {
    const result = m3nToMei('{4/4}\n(5. (6)) (5. (3)) (4. (3)) 2 |')

    expect(result.mei.match(/<beam>/g)).toHaveLength(3)
  })

  it('creates two staves for an unsegmented score', () => {
    const source = [
      '{key=C} {2/4}',
      '1 2 |',
      '{bass}1d 5d |{/}',
    ].join('\n')
    const result = m3nToMei(source)

    expect(result.hasBassStaff).toBe(true)
    expect(result.mei).toContain('clef.shape="F"')
    expect(result.mei).toContain('<section xml:id="m3n-score-section">')
    expect(result.mei).toContain('xml:id="m3n-measure-1-1"')
    expect(result.mei).not.toContain('<section xml:id="m3n-segment-1">')
    expect(result.mei).not.toContain('<expansion')
  })

  it('expands named parts in the declared performance order', () => {
    const result = m3nToMei('{key=C} {2/4} {parts=A B A}\n{part=A}1 2 |{/}\n{part=B}3 4 |{/}')

    expect(result.partOrder).toEqual(['A', 'B', 'A'])
    expect(result.headerMetadata).toContainEqual({ value: 'A → B → A', side: 'left', priority: 30 })
    expect(result.mei).toContain('<section xml:id="m3n-segment-1">')
    expect(result.mei).toContain('<section xml:id="m3n-segment-2">')
    expect(result.mei).toMatch(/<section xml:id="m3n-segment-2">\s+<sb\/>/)
    expect(result.mei).toContain('<reh staff="1" tstamp="1">A</reh>')
    expect(result.mei).toContain('<reh staff="1" tstamp="1">B</reh>')
    expect(result.mei).toContain('<expansion xml:id="m3n-expansion" plist="#m3n-segment-1 #m3n-segment-2 #m3n-segment-1"/>')
  })

  it('converts explicit line breaks into MEI system breaks', () => {
    const result = m3nToMei('{key=C} {2/4}\n1 2 | {br} 3 4 |')

    expect(result.mei).toMatch(/m3n-measure-1-1[\s\S]*?<\/measure>\s*<sb\/>\s*<measure xml:id="m3n-measure-1-2"/)
  })

  it('serializes multi-measure rests as MEI multiRest elements', () => {
    const result = m3nToMei('{key=C} {4/4}\n1 2 3 4 | {rest=4} | 4 3 2 1 |||')

    expect(result.mei).toContain('<multiRest num="4"/>')
  })

  it('serializes tuplets as MEI tuplets', () => {
    const result = m3nToMei('{key=C} {2/4}\n[1 2 3:2] |')
    expect(result.mei).toContain('<tuplet')
    expect(result.mei).toContain('num="3" numbase="2"')
    expect(result.mei).toContain('pname="c" oct="4" dur="4"')
    expect(result.mei).toContain('xml:id="m3n-e-1-n1"')
    expect(result.mei).toContain('xml:id="m3n-e-1-n3"')
    expect(result.sourceMap).toEqual([
      { xmlId: 'm3n-e-1', sourceStart: 14, sourceEnd: 23 },
      { xmlId: 'm3n-e-1-n1', sourceStart: 14, sourceEnd: 23 },
      { xmlId: 'm3n-e-1-n2', sourceStart: 14, sourceEnd: 23 },
      { xmlId: 'm3n-e-1-n3', sourceStart: 14, sourceEnd: 23 },
    ])
  })

  it('maps lyric syllables to their rendered notes', () => {
    const source = '{key=C} {2/4}\n1 2 |||\n{lyrics-word}\nla la\n{/}'
    const result = m3nToMei(source)
    const firstLyricStart = source.indexOf('la la')
    const secondLyricStart = source.lastIndexOf('la')

    expect(result.sourceMap).toContainEqual({ xmlId: 'm3n-e-1', sourceStart: firstLyricStart, sourceEnd: firstLyricStart + 2 })
    expect(result.sourceMap).toContainEqual({ xmlId: 'm3n-e-2', sourceStart: secondLyricStart, sourceEnd: secondLyricStart + 2 })
  })

  it('keeps rests inside sequential groups as rests', () => {
    const result = m3nToMei('{key=C} {2/4}\n[066:2] |||')

    expect(result.mei).toContain('<rest xml:id="m3n-e-1-n1" dur="4"/>')
    expect(result.mei).toContain('<note xml:id="m3n-e-1-n2" pname="a" oct="4" dur="4"/>')
    expect(result.mei).not.toContain('xml:id="m3n-e-1-n1" pname=')
  })

  it('beams eighth-note tuplets internally', () => {
    const result = m3nToMei('{key=E} {4/4}\n([3d6d1:2]) |')

    expect(result.mei).toContain('<tuplet xml:id="m3n-e-1" num="3" numbase="2"><beam>')
    expect(result.mei).toContain('</beam></tuplet>')
  })

  it('writes explicit beams for the doll and bear dance example', () => {
    const source = [
      '{title=洋娃娃和小熊跳舞} {key=C} {2/4} {96qpm}',
      '(1 2) (3 4) | (5 5) ((5 4) 3) | (4 4) ((4 3) 2) | (1 3) (5 0) |',
      '(1 2) (3 4) | (5 5) ((5 4) 3) | (4 4) ((4 3) 2) | (1 3) (1 0) |||',
    ].join('\n')
    const result = m3nToMei(source)

    expect(result.mei.match(/<beam>/g)).toHaveLength(14)
    expect(result.mei).toMatch(/<beam>\s+<note/)
  })

  it('does not beam across rests', () => {
    const result = m3nToMei('{key=C} {4/4}\n(1) (0) (2) |')
    expect(result.mei).not.toContain('<beam>')
  })

  it('carries temporary accidentals through the measure in MIDI pitch data', () => {
    const result = m3nToMei('{key=C} {3/4}\n7#d (6d) 7d |')
    const notes = result.mei.match(/<note[^>]+>/g) ?? []

    expect(notes[0]).toContain('accid="s" accid.ges="s"')
    expect(notes[2]).toContain('accid.ges="s"')
    expect(notes[2]).not.toContain(' accid="s"')
  })

  it('keeps the final measure as sequential notes', () => {
    const result = m3nToMei('{key=C} {4/4}\n1 2 3 4 |||')
    expect(result.mei.match(/<note xml:id=/g)).toHaveLength(4)
    expect(result.mei).not.toContain('<chord')
  })

  it('keeps the title empty when title metadata is absent', () => {
    const result = m3nToMei('{key=C} {4/4}\n1 2 3 4 |||')

    expect(result.title).toBe('')
    expect(result.mei).not.toContain('M3N Score')
  })

  it('serializes alternate endings as MEI endings', () => {
    const result = m3nToMei('{key=C} {2/4}\n||: 1 2 | {volta=1}3 4{/} :|| {volta=2}1 0{/} |||')
    expect(result.mei).toContain('<ending xml:id="m3n-ending-1" n="1">')
    expect(result.mei).toContain('<ending xml:id="m3n-ending-2" n="2">')
    expect(result.mei).toContain('<expansion xml:id="m3n-expansion" plist="#m3n-segment-1 #m3n-ending-1 #m3n-segment-1 #m3n-ending-2"/>')
    expect(result.mei).toContain('right="rptend"')
    expect(result.mei).not.toContain('<mSpace/>')
  })

  it('repeats the opening section for alternate endings without an explicit repeat start', () => {
    const result = m3nToMei('{key=C} {2/4}\n1 2 | {volta=1}3 4{/}:|| {volta=2}5 6{/}|||')

    expect(result.mei).toContain('<expansion xml:id="m3n-expansion" plist="#m3n-segment-1 #m3n-ending-1 #m3n-segment-1 #m3n-ending-2"/>')
  })

  it('expands an explicitly counted repeat the requested number of times', () => {
    const result = m3nToMei('{key=C} {2/4}\n||: 1 2 | 3 4 :|||{x3}')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<expansion xml:id="m3n-expansion" plist="#m3n-segment-1 #m3n-segment-1 #m3n-segment-1"/>')
  })

  it('keeps following music outside an explicitly counted repeat expansion', () => {
    const result = m3nToMei('{key=C} {2/4}\n||: 1 2 | 3 4 :||{x3} 5 6 :|||')

    expect(result.mei).toContain('<expansion xml:id="m3n-expansion" plist="#m3n-segment-1 #m3n-segment-1 #m3n-segment-1 #m3n-segment-2 #m3n-segment-2"/>')
  })

  it('preserves later default repeats when an earlier repeat has an explicit count', () => {
    const result = m3nToMei('1 2 3 4 :||{x3} 5 4 3 2 ||: 1 2 3 4 :||: 5 3 1^ :|||')

    expect(result.mei).toContain('<expansion xml:id="m3n-expansion" plist="#m3n-segment-1 #m3n-segment-1 #m3n-segment-1 #m3n-segment-2 #m3n-segment-3 #m3n-segment-3 #m3n-segment-4 #m3n-segment-4"/>')
  })
})
