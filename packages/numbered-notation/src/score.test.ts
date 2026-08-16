import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseM3NDocument, type ScoreDocument } from '@m3n/notation'
import {
  NumberedNotationScore,
  type NumberedNotationRenderOptions,
} from './score.js'

function renderScore(document: ScoreDocument, options: NumberedNotationRenderOptions) {
  return NumberedNotationScore.create(document).render(options)
}

describe('NumberedNotationScore', () => {
  it('uses the numbered notation page, glyph, layout, and font contract from a ScoreDocument', () => {
    const document = parseM3NDocument('{title=测试曲} {key=D} {3/4} {90qpm}\nN: ||: 1. 2 3 | 4~ 5 6 :|||{x3}\nL: 春天来 | 了')
    const [svg] = renderScore(document, { paged: true, width: 1000 })

    expect(svg).toContain('<svg width="1000"')
    expect(Number(/<svg width="1000" height="(\d+)"/.exec(svg)?.[1])).toBeLessThan(400)
    expect(svg).toContain('>D</text>')
    expect(svg).toContain('xlink:href="#shuzi_b_bian_1"')
    expect(svg).toContain('id="shuzi_b_bian_1" transform="translate(-51,-50)"')
    expect(svg).toContain('font-family="serif"')
    expect(svg).toContain('id="m3n-e-1"')
    expect(svg).toContain('data-m3n-id="m3n-e-1"')
    expect(svg).toContain('data-m3n-measure-start=')
    expect(svg).toContain('data-m3n-measure-end=')
    expect(svg).toContain('id="m3n-playback-highlight"')
    expect(svg).toMatch(/<g class="measure"[^>]*>[\s\S]*id="m3n-e-1"/)
    expect(svg).toContain('xlink:href="#xunhuan_zuo"')
  })

  it('derives lyrics and rendering only from the normalized ScoreDocument', () => {
    const document = parseM3NDocument('{2/4}\nN: 1 2 | 3 4 |||\nL: 春天 | 来了')
    document.source = 'intentionally unrelated'
    const [svg] = renderScore(document, { paged: false, width: 1000 })

    expect(svg).toContain('>春</text>')
    expect(svg).toContain('>天</text>')
    expect(svg).toContain('>来</text>')
    expect(svg).toContain('>了</text>')
  })

  it('uses compact glyph definitions without changing its requested page width', () => {
    const [svg] = renderScore(
      parseM3NDocument('{title=测试曲} {2/4}\nN: 1 2 |||'),
      { paged: false, width: 800 },
    )

    expect(svg).toContain('<svg width="800"')
    expect(svg).toContain('font-size="32"')
    expect(svg).toMatch(/xlink:href="#shuzi_b_bian_1"[^>]*id="m3n-e-1"/)
  })

  it('keeps dotted values and their scaled support glyphs aligned', () => {
    const source = readFileSync(new URL('../../../src/scores/huan_le_song_01.m3n', import.meta.url), 'utf8')
    const [svg] = renderScore(parseM3NDocument(source), { paged: true, width: 800 })

    expect(svg).toContain('<circle')
    expect(svg).toContain('data-type="jianshixian" stroke-width="1.6"')
    expect(svg).toContain('<path d="M 47.48,')
    expect(svg).toContain('<rect x="100"')
  })

  it('keeps augmentation dots and lyrics attached to their sounding note', () => {
    const [svg] = renderScore(
      parseM3NDocument('{3/4}\nN: 1. 0 2 |||\nL: 春 天'),
      { paged: false, width: 800 },
    )

    expect(svg).toMatch(/<circle[^>]*data-m3n-id="m3n-e-1"/)
    expect(svg).toMatch(/<text[^>]*data-m3n-id="m3n-e-1"[^>]*>春<\/text>/)
    expect(svg).toContain('data-m3n-rendition="1"')
    expect(svg).toMatch(/<text[^>]*data-m3n-id="m3n-e-3"[^>]*>天<\/text>/)
    expect(svg).not.toMatch(/<text[^>]*data-m3n-id="m3n-e-2"[^>]*>天<\/text>/)
    expect(svg).toContain('font-size="16" font-family="serif"')
  })

  it('keeps a single-phrase paged score close to its content height', () => {
    const [svg] = renderScore(
      parseM3NDocument('N: 1 1 5 5 | 6 6 5^ | 4 4 3 3 | 2 2 1^ |||'),
      { paged: true, width: 800 },
    )

    expect(Number(/<svg width="800" height="(\d+)"/.exec(svg)?.[1])).toBeLessThan(100)
    const firstNoteY = Number(/<use x="[\d.]+" y="([\d.]+)"[^>]*id="m3n-e-1"/.exec(svg)?.[1])
    expect(firstNoteY).toBeLessThan(40)
  })

  it('does not reserve lyric space below a lyric-free continuous score', () => {
    const [svg] = renderScore(
      parseM3NDocument('N: 1 1 5 5 | 6 6 5^ | 4 4 3 3 | 2 2 1^ |||'),
      { paged: false, width: 800 },
    )

    expect(Number(/<svg width="800" height="(\d+)"/.exec(svg)?.[1])).toBeLessThan(170)
  })

  it('maps M3N grace-note postfixes onto the following numbered-notation grace group', () => {
    const [svg] = renderScore(
      parseM3NDocument('{2/4}\nN: 1{ac(7e)} 2{ap((3d5d))} |||'),
      { paged: false, width: 1000 },
    )

    expect(svg).toContain('xlink:href="#yiyin_shuzi_7"')
    expect(svg).toContain('xlink:href="#yiyin_shuzi_3"')
    expect(svg).toContain('xlink:href="#yiyin_shuzi_5"')
    expect(svg).toContain('x1="-3" y1="-3.7" x2="10" y2="-3.7" stroke-width="0.9"')
    expect(svg).toContain('x1="-3" y1="-1.8" x2="10" y2="-1.8" stroke-width="0.9"')
  })

  it('does not render the parser placeholder after a final barline', () => {
    const [svg] = renderScore(parseM3NDocument('{2/4}\nN: 1 2 |||'), { paged: false, width: 1000 })

    expect(svg.match(/code="\|j"/g)).toHaveLength(1)
  })

  it('keeps both sides of a repeat boundary without an empty measure', () => {
    const [svg] = renderScore(parseM3NDocument('{2/4}\nN: ||: 1 2 :|| |||'), { paged: false, width: 1000 })

    expect(svg.match(/code="\|z"/g)).toHaveLength(1)
    expect(svg.match(/code="\|y"/g)).toHaveLength(1)
    expect(svg.match(/code="\|j"/g)).toHaveLength(1)
  })

  it('merges a plain barline before a forward repeat into one repeat-start', () => {
    const [svg] = renderScore(parseM3NDocument('{2/4}\nN: 1 2 | ||: 3 4 |||'), { paged: false, width: 1000 })

    expect(svg.match(/code="\|z"/g)).toHaveLength(1)
    expect(svg.match(/code="\|"/g) ?? []).toHaveLength(0)
  })

  it('merges a repeat end and following repeat start into repeat-both', () => {
    const document = parseM3NDocument('{2/4}\nN: ||: 1 2 | 3 4 |||')
    const measures = document.parts.get('score')!.melody
    measures[0]!.right = 'rptend'
    measures[1]!.left = 'rptstart'
    const [svg] = renderScore(document, { paged: false, width: 1000 })

    expect(svg.match(/code="\|l"/g) ?? []).toHaveLength(1)
    expect(svg.match(/code="\|y"/g) ?? []).toHaveLength(0)
    expect(svg.match(/code="\|z"/g) ?? []).toHaveLength(1)
  })

  it('measures natural numbered notation width before fitting, so long scores form multiple systems', () => {
    const source = `{4/4}\nN: ${Array.from({ length: 48 }, () => '1 2 3 4 |').join(' ')} |||`
    const [svg] = renderScore(parseM3NDocument(source), { paged: false, width: 1000 })
    const systems = new Set([...svg.matchAll(/notepos="0_(\d+)_/g)].map((match) => match[1]))

    expect(systems.size).toBeGreaterThan(1)
  })

  it('wraps the Lao Nan Hai corpus score into multiple numbered notation systems', () => {
    const source = readFileSync(new URL('../../../src/scores/lao_nan_hai_01.m3n', import.meta.url), 'utf8')
    const [svg] = renderScore(parseM3NDocument(source), { paged: false, width: 1000 })
    const systems = new Set([...svg.matchAll(/notepos="0_(\d+)_/g)].map((match) => match[1]))

    expect(systems.size).toBeGreaterThan(1)
  })

  it('reflows systems when the configured page width changes', () => {
    const source = `{4/4}\nN: ${Array.from({ length: 24 }, () => '1 2 3 4 |').join(' ')} |||`
    const document = parseM3NDocument(source)
    const systemsAt = (width: number) => {
      const [svg] = renderScore(document, { paged: false, width })
      return new Set([...svg.matchAll(/notepos="0_(\d+)_/g)].map((match) => match[1])).size
    }

    expect(systemsAt(480)).toBeGreaterThan(systemsAt(1000))
  })

  it('projects ScoreMeasure endings as numbered notation volta brackets', () => {
    const document = parseM3NDocument('{2/4}\nN: ||: 1 2 |\n---V1\nN: 3 4 :||\n---V2\nN: 5 6 |||')
    const [svg] = renderScore(document, { paged: false, width: 1000 })

    expect(svg).toContain('>1.</text>')
    const captionIndex = svg.indexOf('>1.</text>')
    const bracket = svg.slice(Math.max(0, captionIndex - 500), captionIndex)
    expect(bracket).toContain('<line x1=')
    expect(svg).toContain('xlink:href="#xiaojiexian"')
  })

  it('anchors lyrics on the first note of a tied chain', () => {
    const document = parseM3NDocument('{2/4}\nN: 1~ 1 | 2 3 |||\nL: 春 | 天')
    const [svg] = renderScore(document, { paged: false, width: 1000 })

    expect(svg).toMatch(/cipos="0_1_1"[^>]*>春<\/text>/)
    expect(svg).not.toContain('cipos="0_1_2">春</text>')
  })

  it('does not let placeholder lyrics consume tied continuations', () => {
    const document = parseM3NDocument('{4/4}\nN: 1~ 1 2 3 |||\nL: 春 % 天')
    const [svg] = renderScore(document, { paged: false, width: 1000 })

    expect(svg).toMatch(/cipos="0_1_1"[^>]*>春<\/text>/)
    expect(svg).toMatch(/cipos="0_1_4"[^>]*>天<\/text>/)
  })

  it('renders every complete beat after a long note as an numbered notation sustain glyph', () => {
    const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 |||')
    const first = document.parts.get('score')?.melody[0]?.events[0]
    if (first) first.beats = 2
    const [svg] = renderScore(document, { paged: false, width: 1000 })

    expect(svg).toContain('xlink:href="#yanyinfu"')
    expect(svg).toContain('code="-"')
    expect(svg).toMatch(/xlink:href="#yanyinfu"[^>]*data-m3n-id="m3n-e-1"/)
    expect(svg).toContain('height="2.5" width="11" y="48.75"')
  })

  it('leaves one stroke-width of space between stacked duration underlines', () => {
    const document = parseM3NDocument('{4/4}\nN: 1 2 |||')
    const first = document.parts.get('score')?.melody[0]?.events[0]
    if (first) first.beats = 0.25
    const [svg] = renderScore(document, { paged: false, width: 1000 })
    const underlineYs = [...svg.matchAll(/<line[^>]*y1="([\d.]+)"[^>]*data-type="jianshixian"/g)]
      .map((match) => Number(match[1]))

    expect(underlineYs).toHaveLength(2)
    expect(underlineYs[1]! - underlineYs[0]!).toBeCloseTo(3.2)
  })

  it('keeps one unit of clearance between lower octave dots and duration underlines', () => {
    const document = parseM3NDocument('{4/4}\nN: 1dd 2 |||')
    const first = document.parts.get('score')?.melody[0]?.events[0]
    if (first) first.beats = 0.5
    const [svg] = renderScore(document, { paged: false, width: 1000 })
    const octaveDots = [...svg.matchAll(/<circle cx="[\d.]+" cy="([\d.]+)" r="1.52"/g)]
      .map((match) => Number(match[1]))
    const underlineY = Number(/<line[^>]*y1="([\d.]+)"[^>]*data-type="jianshixian"/.exec(svg)?.[1])

    expect(octaveDots).toHaveLength(2)
    expect(octaveDots[1]! - octaveDots[0]!).toBeCloseTo(4.04)
    expect(octaveDots[0]! - 1.52 - (underlineY + 0.8)).toBeCloseTo(1)
  })

  it('keeps all simultaneous chord pitches as vertically stacked numbered notation glyphs', () => {
    const document = parseM3NDocument('{2/4}\nN: [1d 3d 5d:h] 0 |||')
    const [svg] = renderScore(document, { paged: false, width: 1000 })

    expect(svg).toContain('xlink:href="#shuzi_b_bian_1"')
    expect(svg).toContain('xlink:href="#shuzi_b_bian_3"')
    expect(svg).toContain('xlink:href="#shuzi_b_bian_5"')
    expect(svg).toContain('data-m3n-id="m3n-e-1"')
    expect(svg.match(/data-m3n-id="m3n-e-1"/g)).toHaveLength(3)
    const pitches = [...svg.matchAll(/<use x="([\d.]+)" y="([\d.]+)" xlink:href="#shuzi_b_bian_[135]"/g)]
      .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }))
    const ys = pitches.map(({ y }) => y)
    expect(new Set(ys).size).toBe(3)
    expect(ys[0]! - ys[1]!).toBeCloseTo(22)
    expect(ys[1]! - ys[2]!).toBeCloseTo(22)
    expect((ys[0]! + ys[2]!) / 2).toBeCloseTo(ys[1]!)
    const lowOctaveDots = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="1.52"/g)]
      .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }))
    pitches.forEach((pitch) => {
      expect(lowOctaveDots.some((dot) => Math.abs(dot.x - pitch.x) < 1e-6 && Math.abs(dot.y - (pitch.y + 10.88)) < 1e-6)).toBe(true)
    })
  })

  it('raises slurs above chord stacks and their upper octave dots', () => {
    const [svg] = renderScore(
      parseM3NDocument('{4/4}\nN: {lg}[1e 3ee 5e:h] 2{/} |||'),
      { paged: false, width: 1000 },
    )
    const slurTop = Number(/<path d="M [\d.]+,([\d.]+) C/.exec(svg)?.[1])
    const octaveDotYs = [...svg.matchAll(/<circle cx="[\d.]+" cy="([\d.]+)" r="1.52"/g)]
      .map((match) => Number(match[1]))

    expect(octaveDotYs).not.toHaveLength(0)
    expect(slurTop).toBeLessThan(Math.min(...octaveDotYs) - 4)
  })

  it('expands ScoreDocument tuplets into compact numbered notation note groups', () => {
    const document = parseM3NDocument('{4/4}\nN: [123:2] 4 5 |||')
    const [svg] = renderScore(document, { paged: false, width: 1000 })
    const notes = [...svg.matchAll(/<use x="([\d.]+)" y="([\d.]+)" xlink:href="#shuzi_b_bian_([123])"[^>]*data-m3n-id="m3n-e-1"/g)]

    expect(Number(notes[1]?.[1]) - Number(notes[0]?.[1])).toBe(15)
    expect(Number(notes[2]?.[1]) - Number(notes[1]?.[1])).toBe(15)
    expect(new Set(notes.map((match) => match[2]))).toHaveLength(1)
    expect(svg).toContain('xlink:href="#lianyin_shuzi_3"')
  })

  it('uses MEI playback IDs for every voice and tuplet child', () => {
    const document = parseM3NDocument('{2/4}\nN: [123:2] 4 | 5 6 |||\nB: 1 2 | 3 4 |||')
    const [svg] = renderScore(document, { paged: false, width: 1000 })

    expect(svg).toContain('id="m3n-e-1-n1"')
    expect(svg).toContain('id="m3n-e-1-n3"')
    expect(svg).toContain('id="m3n-e-4"')
    expect(svg).toContain('id="m3n-e-5"')
  })

  it('uses the compact tempo glyph and the staff-score credit priority', () => {
    const document = parseM3NDocument('{title=测试曲} {subtitle=副标题} {singer=演唱者} {composer=作曲者} {lyricist=作词者} {4/4} {90qpm}\nN: 1 2 3 4 |||')
    const [svg] = renderScore(document, { paged: true, width: 1000 })

    expect(svg).toContain('font-family="Leipzig" font-size="30.24"')
    expect(svg).toMatch(/font-size="16"[^>]*>副标题<\/text>/)
    expect(svg).toMatch(/font-size="14"[^>]*>演唱者<\/text>/)
    expect(svg).toContain('data-jiepai="90"')
    expect(svg).toContain('>演唱者</text>')
    expect(svg).not.toContain('>作曲者</text>')
    expect(svg).not.toContain('>作词者</text>')
  })

  it('uses Verovio’s metNoteQuarterUp glyph when its music font is supplied', () => {
    const [svg] = renderScore(
      parseM3NDocument('{title=测试曲} {4/4} {90qpm}\nN: 1 2 3 4 |||'),
      { paged: true, width: 1000, musicFontCss: '@font-face { font-family: Leipzig; src: url(test); }' },
    )

    expect(svg).toContain('@font-face { font-family: Leipzig; src: url(test); }')
    expect(svg).toContain('font-family="Leipzig" font-size="30.24">&#xECA5;</text>')
    expect(svg).not.toContain('xlink:href="#jiepaifu"')
  })

  it('uses compact accidental glyphs and Leipzig dynamics when its music font is supplied', () => {
    const [svg] = renderScore(
      parseM3NDocument('{title=测试曲} {4/4}\n{mf} 1# 2b 3= 4 |||'),
      { paged: true, width: 1000, musicFontCss: '@font-face { font-family: Leipzig; src: url(test); }' },
    )

    expect(svg).toContain('xlink:href="#bianyinfu_sheng"')
    expect(svg).toContain('xlink:href="#bianyinfu_jiang"')
    expect(svg).toContain('xlink:href="#bianyinfu_huanyuan"')
    expect(svg).toContain('&#xE521;&#xE522;')
    expect(svg).not.toContain('xlink:href="#lidu_mf"')
  })

  it('uses the staff-score header metrics for numbered notation metadata', () => {
    const [svg] = renderScore(parseM3NDocument('{title=测试曲} {subtitle=副标题} {composer=作曲者} {key=D} {3/4}\nN: 1 2 3 4 |||'), { paged: true, width: 1000 })

    expect(svg).toMatch(/x="500" y="60" dy="0"[^>]*font-size="32"[^>]*font-family="ui-serif, serif"[^>]*>测试曲<\/text>/)
    expect(svg).toMatch(/x="500" y="95.2" dy="0"[^>]*font-size="16"[^>]*font-family="ui-serif, serif"[^>]*>副标题<\/text>/)
    expect(svg).toMatch(/x="972" y="128.96" dy="0"[^>]*font-size="14"[^>]*font-family="system-ui, sans-serif"[^>]*>作曲者<\/text>/)
    expect(svg).not.toContain('scale(0.8)')
  })

  it('aligns Xiao Xing Xing speed, header, and first note with the 800px staff score', () => {
    const source = readFileSync(new URL('../../../src/scores/xiao_xing_xing_01.m3n', import.meta.url), 'utf8')
    const [svg] = renderScore(parseM3NDocument(source), { paged: false, width: 800 })

    expect(svg).toContain('x="400" y="60" dy="0"')
    expect(svg).toContain('x="772" y="97.2" dy="0"')
    expect(svg).toContain('x="162.4" y="107" dy="0"')
    expect(svg).toContain('data-jiepai="100"')
    expect(svg).toContain('font-family="Leipzig" font-size="30.24"')
    expect(svg).toMatch(/y="151.2"[^>]*id="m3n-e-1"/)
    expect(svg).toContain('>C</text>')
    expect(svg).toContain('<rect x="100" y="100.3" width="16.8" height="1.4"')
    expect(svg).toContain('x="108.4" y="94" dy="0" text-anchor="middle" fill="#1b1b1b" font-size="16" font-family="system-ui, sans-serif"')
    expect(svg).toContain('x="108.4" y="118" dy="0" text-anchor="middle" fill="#1b1b1b" font-size="16" font-family="system-ui, sans-serif"')
  })

  it('keeps Turkish March dynamics above its octave notes and section labels', () => {
    const source = readFileSync(new URL('../../../src/scores/turkish_march_01.m3n', import.meta.url), 'utf8')
    const [svg] = renderScore(parseM3NDocument(source), {
      paged: false,
      width: 800,
      musicFontCss: '@font-face { font-family: Leipzig; src: url(test); }',
    })
    const noteY = Number(/<use x="[\d.]+" y="([\d.]+)" xlink:href="#shuzi_b_bian_7"[^>]*id="m3n-e-1"/.exec(svg)?.[1])
    const dynamicY = Number(/<text x="[\d.]+" y="([\d.]+)" fill="#1b1b1b" font-family="Leipzig" font-size="22">&#xE520;<\/text>/.exec(svg)?.[1])

    expect(noteY - dynamicY).toBeGreaterThanOrEqual(38)
  })

  it('paginates by the rendered lyric rows so Guang Yin De Gu Shi lyrics remain visible', () => {
    const source = readFileSync(new URL('../../../src/scores/guang_yin_de_gu_shi_01.m3n', import.meta.url), 'utf8')
    const pages = renderScore(parseM3NDocument(source), { paged: true, width: 1000 })

    expect(pages.length).toBeGreaterThan(0)
    pages.forEach((svg) => {
      const lyricYs = [...svg.matchAll(/<text x="[^"]+" y="([\d.]+)"[^>]*cipos=/g)].map((match) => Number(match[1]))
      expect(Math.max(...lyricYs)).toBeLessThanOrEqual(1335)
    })
  })

  it('justifies an automatically wrapped Hong He Gu first system at 930 width', () => {
    const source = readFileSync(new URL('../../../src/scores/hong_he_gu_01.m3n', import.meta.url), 'utf8')
    const [svg] = renderScore(parseM3NDocument(source), { paged: true, width: 930 })

    expect(svg).toMatch(/<use x="[\d.]+" y="[\d.]+" xlink:href="#xiaojiexian"/)
  })

  it('combines contiguous M3N legato intervals into one numbered notation line', () => {
    const document = parseM3NDocument('{4/4}\nN: {lg}1 2 3 4{/}{lg}5 6 7 1e{/} |||')
    const [svg] = renderScore(document, { paged: false, width: 1000 })

    expect(svg.match(/xlink:href="#lianyinxian_zuo"/g)).toHaveLength(1)
  })

  it('starts a volta at the system edge when its first measure starts a new system', () => {
    const source = readFileSync(new URL('../../../src/scores/qian_si_xi_01.m3n', import.meta.url), 'utf8')
    const [svg] = renderScore(parseM3NDocument(source), { paged: false, width: 1000 })

    expect(svg).toMatch(/<use x="[\d.]+" y="[^"]+" xlink:href="#xiaojiexian"[^>]*code="\|"/)
    expect(svg).toMatch(/<line x1="[\d.]+" y1="[^"]+" x2="[\d.]+" y2="[^"]+"/)
  })

  it('continues a cross-system volta without repeating its house number', () => {
    const document = parseM3NDocument('{2/4}\nN: 1 2 | 3 4 |||')
    const melody = document.parts.get('score')?.melody
    if (!melody) throw new Error('Expected melody')
    melody.forEach((measure) => { measure.ending = '1' })
    melody[0]!.breakAfter = true
    const [svg] = renderScore(document, { paged: false, width: 1000 })

    expect(svg.match(/>1\.<\/text>/g)).toHaveLength(1)
  })

  it('gives Tong Hua Zhen a continuous page tall enough for its final lyric system', () => {
    const source = readFileSync(new URL('../../../src/scores/tong_hua_zhen_01.m3n', import.meta.url), 'utf8')
    const [svg] = renderScore(parseM3NDocument(source), { paged: false, width: 1000 })
    const height = Number(/<svg width="1000" height="([\d.]+)"/.exec(svg)?.[1])
    const lyricYs = [...svg.matchAll(/<text x="[^"]+" y="([\d.]+)"[^>]*cipos=/g)].map((match) => Number(match[1]))

    expect(Math.max(...lyricYs)).toBeLessThan(height - 32)
  })

  it('uses the first lyric row for generic L: after numbered lyric passes', () => {
    const source = readFileSync(new URL('../../../src/scores/zhi_yao_ping_fan_01.m3n', import.meta.url), 'utf8')
    const [svg] = renderScore(parseM3NDocument(source), { paged: false, width: 800 })
    const lyricYsBySystem = new Map<string, Set<string>>()
    for (const match of svg.matchAll(/<text x="[^"]+" y="([^"]+)"[^>]*cipos="0_(\d+)_\d+"[^>]*>[^<]*<\/text>/g)) {
      const rows = lyricYsBySystem.get(match[2] ?? '') ?? new Set<string>()
      rows.add(match[1] ?? '')
      lyricYsBySystem.set(match[2] ?? '', rows)
    }

    expect(Math.max(...[...lyricYsBySystem.values()].map((rows) => rows.size))).toBe(3)
    expect(svg).toContain('data-m3n-rendition="1"')
    expect(svg).toContain('data-m3n-rendition="2"')
    expect(svg).toContain('data-m3n-rendition="3"')
    expect(svg).toMatch(/<text x="82"[^>]*>F<\/text>[\s\S]*?<text x="75"[^>]*>#<\/text>/)
  })
})
