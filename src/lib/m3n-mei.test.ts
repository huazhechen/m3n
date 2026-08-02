import { describe, expect, it } from 'vitest'
import { m3nPitch } from './m3n-direct'
import { m3nToMei } from './m3n-mei'

describe('M3N to MEI conversion', () => {
  it('creates a complete MEI score with source-linked notes', () => {
    const result = m3nToMei('{title=Test} {subtitle=Sub} {composer=Composer} {lyricist=Lyricist} {arranger=Arranger} {copyright=Copyright} {source=First edition} {note=Note} {transpose=2}\n{key=D} {3/4} {90qpm}\n1 2 3 | 4^. |||')

    expect(result.diagnostics).toEqual([])
    expect(result.title).toBe('Test')
    expect(result.mei).toContain('meiversion="5.1"')
    expect(result.mei).toContain('\n  <meiHead>\n')
    expect(result.mei).toContain('<title type="main">Test</title>')
    expect(result.mei).toContain('<title type="subordinate">Sub</title>')
    expect(result.mei).toContain('<persName role="composer">Composer</persName>')
    expect(result.mei).toContain('<persName role="lyricist">Lyricist</persName>')
    expect(result.mei).toContain('<persName role="arranger">Arranger</persName>')
    expect(result.mei).toContain('<source><bibl>First edition</bibl></source>')
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
    expect(compoundTime.mei).toContain('glyph.name="metNote8thUp"')
    expect(compoundTime.mei).not.toContain('glyph.name="augmentationDot"')
    expect(compoundTime.mei).toContain('</rend> = 240</tempo>')
  })

  it('writes mid-score tempo changes using the active meter while preserving QPM', () => {
    const result = m3nToMei('{4/4} {120qpm}\n1 2 3 4 | {6/8} {90qpm}(1 2 3 4 5 6) |||')

    expect(result.mei).toContain('<tempo xml:id="m3n-tempo-2" staff="1" startid="#m3n-e-5" midi.bpm="90"><rend glyph.auth="smufl" glyph.name="metNote8thUp"')
    expect(result.mei).toContain('glyph.name="metNote8thUp"')
    expect(result.mei).toContain('</rend> = 180</tempo>')
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

  it('renders a D.S. after a closed ending at the preceding barline', () => {
    const result = m3nToMei('{2/4} {segno}1 2 | {volta=1}3 4{/}{ds}|| 5 6 |||')

    expect(result.mei).toContain('<repeatMark staff="1" tstamp="3" place="above" func="dalSegno"/>')
    expect(result.mei).toContain('<expansion xml:id="m3n-expansion" plist="#m3n-segment-1 #m3n-ending-1 #m3n-segment-1 #m3n-segment-2"/>')
  })

  it('keeps ordinary measures together between navigation boundaries', () => {
    const result = m3nToMei('{2/4}\n{segno}1 2 | 3 4 | 5 6 | 7 1e{ds} |||')

    expect(result.mei).toContain('<section xml:id="m3n-segment-2">\n            <measure xml:id="m3n-measure-1-2"')
    expect(result.mei).toContain('<measure xml:id="m3n-measure-1-3"')
    expect(result.mei).toContain('<section xml:id="m3n-segment-3">')
    expect(result.mei).not.toContain('<section xml:id="m3n-segment-4">')
  })

  it('repeats every section of a common volta passage and follows a D.S. inside an ending', () => {
    const result = m3nToMei('{2/4}\n||: 1 2 | {segno}3 4 | {volta=1,3}5 6{fine}{/} :|| {volta=2}7 1{ds}{/} |||')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<expansion xml:id="m3n-expansion" plist="#m3n-segment-1 #m3n-segment-2 #m3n-ending-1 #m3n-segment-1 #m3n-segment-2 #m3n-ending-2 #m3n-segment-2 #m3n-ending-1"/>')
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
    expect(result.mei).toContain('xml:id="m3n-e-1" pname="c" oct="4" dur="4"><artic')
    expect(result.mei).toContain('xml:id="m3n-e-9" pname="c" oct="4" dur="4"></note>')
    expect(result.mei).toContain('<trill startid="#m3n-e-1"/>')
    expect(result.mei).toContain('<artic artic="acc"/>')
    expect(result.mei).toContain('<artic artic="stacciss"/>')
    expect(result.mei).toContain('<artic artic="stacc"/>')
    expect(result.mei).toContain('<artic artic="ten"/>')
    expect(result.mei).not.toContain('dur.ges=')
    expect(result.mei).not.toContain(' vel=')
    expect(result.mei).toContain('<fermata startid="#m3n-e-1"/>')
    expect(result.mei).toContain('<breath startid="#m3n-e-1"/>')
    expect(result.mei).toContain('<fing startid="#m3n-e-1">3</fing>')
    expect(result.mei).toContain('<slur startid="#m3n-e-1" endid="#m3n-e-4"/>')
    expect(result.mei).toContain('<hairpin staff="1" form="cres" startid="#m3n-e-1" endid="#m3n-e-4"/>')
    expect(result.mei).toContain('<octave staff="1" dis="8" dis.place="above" startid="#m3n-e-1" endid="#m3n-e-4"/>')
    expect(result.mei).toContain('<hairpin staff="1" form="dim" startid="#m3n-e-5" endid="#m3n-e-8"/>')
  })

  it('leaves staccato performance duration to Verovio', () => {
    const result = m3nToMei('{key=C} {2/4}\n1{tip} 2 |||')

    expect(result.mei).toContain('xml:id="m3n-e-1" pname="c" oct="4" dur="4"><artic artic="stacc"/></note>')
    expect(result.mei).not.toContain('dur.ges=')
  })

  it('serializes arpeggios on chord groups as MEI arpeg controls', () => {
    const result = m3nToMei('{key=C} {4/4}\n[135:h]{arp} 0 0 0 |||')

    expect(result.mei).toContain('<chord xml:id="m3n-e-1"')
    expect(result.mei).toContain('<arpeg startid="#m3n-e-1"/>')
  })

  it('serializes double accidentals with their MEI pitch values', () => {
    const result = m3nToMei('{key=C} {4/4}\n1## 2bb 1 2 |||')

    expect(result.mei).toContain('pname="c" oct="4" accid="x" accid.ges="ss"')
    expect(result.mei).toContain('pname="d" oct="4" accid="ff" accid.ges="ff"')
    expect(m3nPitch('1##', 'C').accidGes).toBe('ss')
    expect(m3nPitch('1##', 'C').accid).toBe('x')
    expect(m3nPitch('2bb', 'C').accidGes).toBe('ff')
  })

  it('keeps the double-sharp gesture valid when the accidental carries through a measure', () => {
    const notes = m3nToMei('{key=C} {4/4}\n1## 1 2 3 |||').mei.match(/<note[^>]+>/g) ?? []

    expect(notes[0]).toContain('accid="x" accid.ges="ss"')
    expect(notes[1]).toContain('accid.ges="ss"')
    expect(notes[1]).not.toContain(' accid="')
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

  it('automatically separates Chinese characters and hyphenated English lyrics', () => {
    const result = m3nToMei('{key=C} {4/4}\n1 2 3 4 |||\n{lyrics}\n你 好 Twin-kle\n{/}')

    expect(result.mei).toContain('<syl>你\u200B</syl>')
    expect(result.mei).toContain('<syl>好\u200B</syl>')
    expect(result.mei).toContain('<syl wordpos="i" con="d">Twin</syl>')
    expect(result.mei).toContain('<syl wordpos="t">kle</syl>')
  })

  it('maps default lyrics by character while keeping punctuation on its lyric', () => {
    const result = m3nToMei('{key=C} {2/4}\n1 2 |||\n{lyrics}\n甲，乙！\n{/}')

    expect(result.mei).toContain('<syl>甲，\u200B\u200B</syl>')
    expect(result.mei).toContain('<syl>乙！\u200B\u200B</syl>')
  })

  it('adds CJK spacing compensation only to character-based lyrics', () => {
    const result = m3nToMei('{key=C} {2/4}\n||: 1 2 :|||\n{lyrics}\n甲乙\n{/}\n{lyrics=2}\nhello world\n{/}')

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
    const result = m3nToMei('{key=G} {4/4}\n((3 3 4 5)) ((3 3 4 5)) ((3 3 4 5)) ((3 3 4 5)) :|||\n{lyrics=1}一二三四一二三四一二三四一二三四{/}\n// {lyrics=2}hello hello hello hello hello hello hello hello hello hello hello hello hello hello hello hello {/}')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<verse xml:id="m3n-e-1-v1" n="1"><syl>一\u200B</syl></verse>')
    expect(result.mei).not.toContain(' n="2">')
    expect(result.mei).not.toContain('hello')
  })

  it('expands repeated placeholders and encodes grouped lyrics as underlined single-note text', () => {
    const result = m3nToMei('{key=C} {4/4}\n1 2 3 4 |||\n{lyrics}\n%{2} (甲乙) _{0}\n{/}')

    expect(result.mei).toContain('<note xml:id="m3n-e-1" pname="c" oct="4" dur="4"><verse xml:id="m3n-e-1-v1" n="1"><syl>\u200B</syl></verse></note>')
    expect(result.mei).toContain('<syl type="m3n-text-underline"><rend>甲乙\u200B\u200B</rend></syl>')
    expect(result.mei).toContain('<syl con="u"></syl>')
  })

  it('underlines grouped lyric text without underlining punctuation', () => {
    const result = m3nToMei('{key=C} {2/4}\n1 2 |||\n{lyrics}(word,word) next{/}')

    expect(result.mei).toContain('<syl type="m3n-text-underline"><rend>word</rend>,<rend>word</rend></syl>')
  })

  it('renders lyrics for multiple repeat passes as separate verses', () => {
    const result = m3nToMei('{key=C} {2/4}\n||: 1 2 :|||\n{lyrics=1}\nfirst pass\n{/}\n{lyrics=2}\nsecond pass\n{/}')

    expect(result.mei).toContain('<verse xml:id="m3n-e-1-v1" n="1"><syl>first</syl></verse><verse xml:id="m3n-e-1-v2" n="2"><syl>second</syl></verse>')
    expect(result.mei).toContain('<verse xml:id="m3n-e-2-v1" n="1"><syl>pass</syl></verse><verse xml:id="m3n-e-2-v2" n="2"><syl>pass</syl></verse>')
  })

  it('does not attach later-pass lyrics to a one-time introduction', () => {
    const result = m3nToMei('{key=C} {2/4}\n1 2 | ||: 3 4 :|||\n{lyrics=1}intro words{/}\n{lyrics=2}second pass{/}')

    expect(result.mei).toContain('<note xml:id="m3n-e-1" pname="c" oct="4" dur="4"><verse xml:id="m3n-e-1-v1" n="1"><syl>intro</syl></verse><verse xml:id="m3n-e-1-v2" n="2"><syl>\u200B</syl></verse></note>')
    expect(result.mei).toContain('<verse xml:id="m3n-e-1-v2" n="2"><syl>\u200B</syl></verse>')
    expect(result.mei).toContain('<note xml:id="m3n-e-3" pname="e" oct="4" dur="4"><verse xml:id="m3n-e-3-v1" n="1"><syl>\u200B</syl></verse><verse xml:id="m3n-e-3-v2" n="2"><syl>second</syl></verse></note>')
  })

  it('maps pass-specific lyrics to their matching alternate endings', () => {
    const result = m3nToMei('{key=C} {2/4}\n||: 1 2 | {volta=1}3 4{/}:|| {volta=2}5 6{/} |||\n{lyrics=1}a b c d{/}\n{lyrics=2}a b e f{/}')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<note xml:id="m3n-e-1" pname="c" oct="4" dur="4"><verse xml:id="m3n-e-1-v1" n="1"><syl>a</syl></verse><verse xml:id="m3n-e-1-v2" n="2"><syl>a</syl></verse></note>')
    expect(result.mei).toContain('<note xml:id="m3n-e-3" pname="e" oct="4" dur="4"><verse xml:id="m3n-e-3-v1" n="1"><syl>c</syl></verse></note>')
    expect(result.mei).toContain('<note xml:id="m3n-e-5" pname="g" oct="4" dur="4"><verse xml:id="m3n-e-5-v1" n="1"><syl>e</syl></verse></note>')
  })

  it('keeps second-pass lyrics on their row at tied note targets', () => {
    const result = m3nToMei('{key=C} {3/4}\n||: 1~ 1 2 :|||\n{lyrics=1}one two{/}\n{lyrics=2}one +two three{/}')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<note xml:id="m3n-e-2" pname="c" oct="4" dur="4"><verse xml:id="m3n-e-2-v1" n="1"><syl>\u200B</syl></verse><verse xml:id="m3n-e-2-v2" n="2"><syl>two</syl></verse></note>')
  })

  it('compacts tied-target lyrics inside alternate endings', () => {
    const result = m3nToMei('{key=C} {3/4}\n||: 1 2 3 | {volta=1}4 5 6{/}:|| {volta=2}4~ 4 5{/} |||\n{lyrics=1}a b c d e f{/}\n{lyrics=2}g h i j +k l{/}')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<note xml:id="m3n-e-8" pname="f" oct="4" dur="4"><verse xml:id="m3n-e-8-v1" n="1"><syl>k</syl></verse></note>')
  })

  it('compacts rows before third-pass lyrics inside alternate endings', () => {
    const result = m3nToMei('{key=C} {2/4}\n||: {volta=1}1 2{/}:|| {volta=2}3 4{/} || {volta=3}5 6{/} |||\n{lyrics=1}a b{/}\n{lyrics=2}c d{/}\n{lyrics=3}e f{/}')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<note xml:id="m3n-e-5" pname="g" oct="4" dur="4"><verse xml:id="m3n-e-5-v1" n="1"><syl>e</syl></verse></note>')
  })

  it('starts every lyric block at the public opening for a 2~4 ending', () => {
    const result = m3nToMei('{key=C} {2/4}\n||: 1 2 | {volta=1}3 4{/} | {volta=2~4}5 6{/} | 7 1e :||{x3} |||\n{lyrics=1}a b c d e f{/}\n{lyrics=2}g h i j k l{/}\n{lyrics=3}m n o p q r{/}\n{lyrics=4}s t u v w x{/}')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('xml:id="m3n-e-1-v2" n="2"><syl>g</syl>')
    expect(result.mei).toContain('xml:id="m3n-e-1-v4" n="4"><syl>s</syl>')
    expect(result.mei).toContain('xml:id="m3n-e-5-v1" n="1"><syl>i</syl>')
    expect(result.mei).toContain('xml:id="m3n-e-5-v3" n="3"><syl>u</syl>')
  })

  it('keeps instrumental intervals lyric-free without visual markers', () => {
    const result = m3nToMei('{key=C} {2/4}\n{inst}1 2{/} | 3 4 |||\n{lyrics}\nla la\n{/}')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).not.toContain('<bracketSpan')
    expect(result.mei).not.toContain('<note xml:id="m3n-e-1" pname="c" oct="4" dur="4"><verse')
    expect(result.mei).toContain('<note xml:id="m3n-e-3" pname="e" oct="4" dur="4"><verse xml:id="m3n-e-3-v1" n="1"><syl>la</syl></verse></note>')
  })

  it('does not assign lyrics to tied note targets', () => {
    const source = '{key=C} {3/4}\n1~ 1 2 |||\n{lyrics}\nla la\n{/}'
    const result = m3nToMei(source)
    const tiedTargetStart = source.indexOf('1 2')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<note xml:id="m3n-e-2" pname="c" oct="4" dur="4"><verse xml:id="m3n-e-2-v1" n="1"><syl>\u200B</syl></verse></note>')
    expect(result.mei).toContain('<tie startid="#m3n-e-1" endid="#m3n-e-2"/>')
    expect(result.mei).toContain('<note xml:id="m3n-e-3" pname="d" oct="4" dur="4"><verse xml:id="m3n-e-3-v1" n="1"><syl>la</syl></verse></note>')
    expect(result.sourceMap.some((item) => item.xmlId === 'm3n-e-2' && item.sourceStart > tiedTargetStart)).toBe(false)
  })

  it('assigns a + prefixed lyric to a tied note target', () => {
    const result = m3nToMei('{key=C} {3/4}\n1~ 1 2 |||\n{lyrics}\nla +la la\n{/}')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<note xml:id="m3n-e-2" pname="c" oct="4" dur="4"><verse xml:id="m3n-e-2-v1" n="1"><syl>la</syl></verse></note>')
    expect(result.mei).toContain('<tie startid="#m3n-e-1" endid="#m3n-e-2"/>')
    expect(result.mei).not.toContain('>+la</syl>')
  })

  it('serializes acciaccaturas and appoggiaturas as grace notes', () => {
    const result = m3nToMei('{key=C} {4/4}\n1{ac(2)} 3{ap((45))} 5{ap(((6)))} 1e |||')

    expect(result.mei).toContain('<graceGrp attach="post"><note pname="d" oct="4" dur="8" grace="unacc"/></graceGrp>')
    expect(result.mei).toContain('<beam><note pname="f" oct="4" dur="16" grace="acc"/><note pname="g" oct="4" dur="16" grace="acc"/></beam>')
    expect(result.mei).toContain('<graceGrp attach="post"><note pname="a" oct="4" dur="32" grace="acc"/></graceGrp>')
    expect(result.mei).not.toContain('acciaccatura')
  })

  it('keeps a grace group outside the main-note beam', () => {
    const result = m3nToMei('{key=C} {2/4}\n(7e){ac(56)} (6e) (5e) (6e) |||')

    expect(result.mei).toContain('</graceGrp>\n                    <beam>\n                    <note xml:id="m3n-e-1"')
    expect(result.mei).not.toContain('<beam>\n                    <graceGrp')
  })

  it('beams consecutive eighth notes in two-beat groups in 4/4', () => {
    const result = m3nToMei('{4/4}\n(5e6e5e3e) (4e5e4e2e)|||')

    expect(result.mei).toMatch(/<beam>\s*<note xml:id="m3n-e-1"/)
    expect(result.mei.match(/<beam>/g)).toHaveLength(2)
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
    expect(result.mei).not.toMatch(/<section xml:id="m3n-segment-2">\s+<sb\/>/)
    expect(result.mei).toContain('<measure xml:id="m3n-measure-1-1" n="1"')
    expect(result.mei).toContain('<measure xml:id="m3n-measure-2-1" n="2"')
    expect(result.mei).toContain('<reh staff="1" tstamp="1"><rend fontweight="bold">A</rend></reh>')
    expect(result.mei).toContain('<reh staff="1" tstamp="1"><rend fontweight="bold">B</rend></reh>')
    expect(result.mei).toContain('<expansion xml:id="m3n-expansion" plist="#m3n-segment-1 #m3n-segment-2 #m3n-segment-1"/>')
  })

  it('writes every numbered lyric block onto the named-part baseline', () => {
    const result = m3nToMei('{key=C} {2/4} {parts=A B A}\n{part=A}1 2 |{/}\n{part=B}3 4 |{/}\n{lyrics=1}one two three four{/}\n{lyrics=2}eins zwei drei vier{/}')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<verse xml:id="m3n-e-1-v1" n="1"><syl>one</syl></verse><verse xml:id="m3n-e-1-v2" n="2"><syl>eins</syl></verse>')
    expect(result.mei).toContain('<verse xml:id="m3n-e-3-v1" n="1"><syl>three</syl></verse><verse xml:id="m3n-e-3-v2" n="2"><syl>drei</syl></verse>')
  })

  it('converts explicit line breaks into MEI system breaks', () => {
    const result = m3nToMei('{key=C} {2/4}\n1 2 | {br} 3 4 |')

    expect(result.mei).toMatch(/m3n-measure-1-1[\s\S]*?<\/measure>\s*<sb\/>\s*<measure xml:id="m3n-measure-1-2"/)
  })

  it('retains a line break before a part-closing interval', () => {
    const result = m3nToMei('{key=C} {2/4} {parts=A B}\n{part=A}1 2 | {br} {/} {part=B}3 4 |')

    expect(result.mei).toMatch(/m3n-measure-1-1[\s\S]*?<\/measure>\s*<sb\/>\s*<\/section>\s*<section xml:id="m3n-segment-2">/)
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

  it('attaches successive lyric items to each pitched tuplet child note', () => {
    const result = m3nToMei('{key=C} {2/4}\n[1 2 3:2] |\n{lyrics}\n\u7532\u4e59\u4e19\n{/}')

    expect(result.mei).toContain('<note xml:id="m3n-e-1-n1" pname="c" oct="4" dur="4"><verse xml:id="m3n-e-1-n1-v1" n="1"><syl>\u7532\u200B</syl></verse></note>')
    expect(result.mei).toContain('<note xml:id="m3n-e-1-n2" pname="d" oct="4" dur="4"><verse xml:id="m3n-e-1-n2-v1" n="1"><syl>\u4e59\u200B</syl></verse></note>')
    expect(result.mei).toContain('<note xml:id="m3n-e-1-n3" pname="e" oct="4" dur="4"><verse xml:id="m3n-e-1-n3-v1" n="1"><syl>\u4e19\u200B</syl></verse></note>')
  })

  it('maps lyric syllables to their rendered notes', () => {
    const source = '{key=C} {2/4}\n1 2 |||\n{lyrics}\nla la\n{/}'
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

  it('continues after a final alternate ending closed by a regular barline', () => {
    const result = m3nToMei('{key=C} {2/4}\n||: 1 2 | {volta=1}3 4{/} :|| {volta=2}5 6{/} | 7 1e |||')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<expansion xml:id="m3n-expansion" plist="#m3n-segment-1 #m3n-ending-1 #m3n-segment-1 #m3n-ending-2 #m3n-segment-2"/>')
  })

  it('selects each non-adjacent volta group on its matching repeat pass', () => {
    const result = m3nToMei('{2/4}\n||: 1 2 | {volta=1}3 4{/} || {volta=2}5 6{/} || 7 1e | {volta=1}2 3{/}:|| {volta=2}4 5{/} |||')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<expansion xml:id="m3n-expansion" plist="#m3n-segment-1 #m3n-ending-1 #m3n-segment-2 #m3n-ending-3 #m3n-segment-1 #m3n-ending-2 #m3n-segment-2 #m3n-ending-4"/>')
  })

  it('resets earlier ending groups while preserving the later group after an implicit repeat', () => {
    const result = m3nToMei('{2/4} 1 2 | {volta=1}3 4{/}:|| {volta=2}5 6{/} | 7 1 | {volta=1}2 3{/}:|| {volta=2}4 5{/} |||')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<expansion xml:id="m3n-expansion" plist="#m3n-segment-1 #m3n-ending-1 #m3n-segment-1 #m3n-ending-2 #m3n-segment-2 #m3n-ending-3 #m3n-segment-1 #m3n-ending-1 #m3n-segment-1 #m3n-ending-2 #m3n-segment-2 #m3n-ending-4"/>')
  })

  it('maps third-pass lyrics from the segno return through the third ending', () => {
    const result = m3nToMei('{2/4}\n||: {segno}1 2 | {volta=1}3 4{/}:|| {volta=2}5 6{ds}{/} || {volta=3}7 1{/} |||\n{lyrics=3}甲乙丙丁{/}')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('xml:id="m3n-e-1-v1" n="1"><syl>\u200B</syl></verse><verse xml:id="m3n-e-1-v2" n="2"><syl>\u200B</syl></verse><verse xml:id="m3n-e-1-v3" n="3"><syl>甲')
    expect(result.mei).not.toContain('xml:id="m3n-e-3-v3"')
    expect(result.mei).toContain('xml:id="m3n-e-7-v1" n="1"><syl>丙')
  })

  it('starts second-pass lyrics at the public opening before a D.S. from a second ending', () => {
    const result = m3nToMei('{2/4}\n||: 1 2 | {volta=1}3 4{/}:|| {volta=2}5 6{ds}{/} || {segno}7 1 |||\n{lyrics=1}a b c d e f{/}\n{lyrics=2}one two three four five six{/}')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('xml:id="m3n-e-1-v2" n="2"><syl>one</syl>')
  })

  it('consumes later-pass placeholders from the segno on a plain D.S. return', () => {
    const result = m3nToMei('{2/4}\n{segno}1 2 | 3 4{ds} |||\n{lyrics=1}a b c d{/}\n{lyrics=2}%{2}x y{/}')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<note xml:id="m3n-e-3" pname="e" oct="4" dur="4"><verse xml:id="m3n-e-3-v1" n="1"><syl>c</syl></verse><verse xml:id="m3n-e-3-v2" n="2"><syl>x</syl></verse></note>')
  })

  it('repeats from the beginning for each implicit repeat end', () => {
    const result = m3nToMei('{2/4} 1 2 :|| 3 4 :|| 5 6 |||')

    expect(result.mei).toContain('<expansion xml:id="m3n-expansion" plist="#m3n-segment-1 #m3n-segment-1 #m3n-segment-2 #m3n-segment-1 #m3n-segment-1 #m3n-segment-2 #m3n-segment-3"/>')
  })

  it('writes incomplete repeat-boundary measures as native repeat bars', () => {
    const result = m3nToMei('{4/4}\n(1 2) | 3 4 5 6 | 1 2 3 :|| 4 | 5 6 7 |||')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<measure xml:id="m3n-measure-1-3" n="3" metcon="false" right="rptend">')
    expect(result.mei).toContain('<measure xml:id="m3n-measure-1-4" n="3" join="#m3n-measure-1-3" right="single">')
    expect(result.mei).not.toContain('<measure xml:id="m3n-measure-1-4" n="3" metcon="false"')
  })

  it('joins a forward repeat that starts in the middle of a measure', () => {
    const result = m3nToMei('{4/4}\n1 2 3 ||: 4 | 5 6 7 1 | 2 3 4 :|| 5 | 6 7 1 2 |||')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<measure xml:id="m3n-measure-1-1" n="1" metcon="false" right="single">')
    expect(result.mei).toContain('<measure xml:id="m3n-measure-1-2" n="1" join="#m3n-measure-1-1" left="rptstart" right="single">')
  })

  it('expands an explicitly counted repeat the requested number of times', () => {
    const result = m3nToMei('{key=C} {2/4}\n||: 1 2 | 3 4 :|||{x3}')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<expansion xml:id="m3n-expansion" plist="#m3n-segment-1 #m3n-segment-1 #m3n-segment-1"/>')
  })

  it('expands an uncounted repeat twice', () => {
    const result = m3nToMei('{key=C} {2/4}\n1 2 | 3 4 :|||')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<expansion xml:id="m3n-expansion" plist="#m3n-segment-1 #m3n-segment-1"/>')
  })

  it('does not repeat again after jumping to the segno', () => {
    const result = m3nToMei('{key=C} {2/4}\n{segno}1 2 | 3 4 :|| {ds} |||')

    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<expansion xml:id="m3n-expansion" plist="#m3n-segment-1 #m3n-segment-2 #m3n-segment-1 #m3n-segment-2 #m3n-segment-1 #m3n-segment-2"/>')
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
