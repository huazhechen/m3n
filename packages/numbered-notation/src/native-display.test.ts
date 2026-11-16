// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { compileScorePerformance, parseM3NDocument, scoreEventIds } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { NativeNumberedNotationScore } from './native-score.js'
import { nativeHeaderGeometry } from './native-header.js'
import { DefaultTextMeasurer } from './native-measure.js'

const options = {width:800,paged:false}
const spell = (pitch:{degree:string;accidental:string;octave:number}) => pitch.accidental+pitch.degree+(pitch.octave>0 ? "'".repeat(pitch.octave) : ','.repeat(-pitch.octave))
const heads = (source:string,extra = {}) => layoutNativeScore(parseM3NDocument(source),{...options,...extra}).projection.glyphs.filter(glyph=>!glyph.sustain)

describe('native display options',()=>{
  it('resolves key changes and inherited accidentals without suppressing repeated fixed-do sharps',()=>{
    const source = '{key=Bb}{4/4}\nN: 1 3 5 7 | {key=D}1 3 4# 4 | 4 4= 0 1 |||'
    const glyphs = heads(source,{fixedDo:true})
    expect(glyphs.map(glyph=>spell(glyph.pitches[0]!))).toEqual(['♯6',"2'","4'","6'",'2','♯4','♯5','♯5','5','5','0','2'])
    expect(glyphs.flatMap(glyph=>glyph.controls).filter(control=>control.kind==='key')).toEqual([])
  })
  it('keeps minor pitch convention and crosses octave boundaries when transposed',()=>{
    const glyphs = heads('{key=Am}{4/4}\nN: 6d 7d 1 2 | {key=Em}3 4 5# 6 |||',{fixedDo:true,transpose:1})
    expect(glyphs.map(glyph=>spell(glyph.pitches[0]!))).toEqual(['♯6,','1','♯1','♯2',"1'","♯1'","3'","4'"])
  })
  it('covers bass, chords, tuplets, grace notes and alternate melodies',()=>{
    const glyphs = heads('{key=Db}{2/4}\nN: ||: [1 3 5:h] 2 | [3 4 5:1] 6{ac(1)} :||\nB: 1d^ | 5d^ |\nNs[2]: 2: 7 1e |',{fixedDo:true,transpose:-1})
    expect(glyphs.find(glyph=>glyph.event?.kind==='chord')!.pitches.map(spell)).toEqual(['1','3','5'])
    expect(glyphs.filter(glyph=>glyph.event?.kind==='tuplet').map(glyph=>spell(glyph.pitches[0]!))).toEqual(['3','4','5'])
    expect(glyphs.filter(glyph=>glyph.staff==='bass').map(glyph=>spell(glyph.pitches[0]!))).toEqual(['1,','5,'])
    expect(glyphs.flatMap(glyph=>glyph.graces).map(spell)).toEqual(['1'])
    expect(glyphs.filter(glyph=>glyph.lane.startsWith('alternative:')).map(glyph=>spell(glyph.pitches[0]!))).toEqual(['7',"1'"])
  })
  it('transposes relative keys and visit rows while preserving notes and playback identity',()=>{
    const document = parseM3NDocument('{key=C}{2/4}{order=A,A@Db}\n===A\nN: 1 2 | {key=Am}3 4 ||')
    const before = structuredClone(document), performance = compileScorePerformance(document)
    const plain = layoutNativeScore(document,options), shifted = layoutNativeScore(document,{...options,transpose:2})
    expect(shifted.projection.glyphs.map(glyph=>glyph.pitches)).toEqual(plain.projection.glyphs.map(glyph=>glyph.pitches))
    const keys = shifted.projection.glyphs.flatMap(glyph=>glyph.controls).filter(control=>control.kind==='key')
    expect(keys.map(key=>key.keyRows?.map(row=>row.key))).toEqual([['1=D','1=Eb'],['6=B','6=C']])
    expect(shifted.projection.glyphs.map(glyph=>glyph.xmlId)).toEqual(plain.projection.glyphs.map(glyph=>glyph.xmlId))
    expect(document).toEqual(before)
    expect(compileScorePerformance(document)).toEqual(performance)
  })
  it.each([320,600,800,1000].flatMap(width=>[false,true].map(paged=>({width,paged}))))('expands keyed visits, correct lyrics and relations with canonical IDs at $width, paged=$paged',variant=>{
    const document = parseM3NDocument('{key=C}{2/4}{order=A,A@Db}\n===A\nN: {lg}1 2{/} ||\nL1: 春天\nL2: 花开')
    const id = scoreEventIds(document).get(document.parts.get('score')!.melody[0]!.events[0]!)!
    const layout = layoutNativeScore(document,{...variant,fixedDo:true})
    expect(layout.projection.glyphs.map(glyph=>spell(glyph.pitches[0]!))).toEqual(['1','2','♯1','♯2'])
    const visits = layout.projection.glyphs.filter(glyph=>glyph.xmlId===id)
    expect(visits.map(glyph=>glyph.passes)).toEqual([[1],[2]])
    expect(visits.map(glyph=>glyph.lyrics.get(0)!.texts.join(''))).toEqual(['春','花'])
    expect(layout.relations.filter(relation=>relation.kind==='slur')).toHaveLength(2)
    const svg = NativeNumberedNotationScore.create(document).render({...variant,fixedDo:true}).join('')
    const root = new DOMParser().parseFromString(svg,'text/html')
    expect([...root.querySelectorAll(`g.note[data-m3n-id="${id}"]`)].map(node=>node.getAttribute('data-m3n-passes'))).toEqual(['1','2'])
    const ids = [...root.querySelectorAll('[id]')].map(node=>node.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('inherits absolute octave anchors for successive keyed visits',()=>{
    const document = parseM3NDocument('{key=C}{2/4}{order=A@C4,A@C5}\n===A\nN: 1 2 ||')
    const before = structuredClone(document)
    const glyphs = layoutNativeScore(document,{...options,fixedDo:true}).projection.glyphs
    expect(glyphs.map(glyph=>spell(glyph.pitches[0]!))).toEqual(['1','2',"1'","2'"])
    expect(glyphs.map(glyph=>glyph.passes)).toEqual([[1],[1],[2],[2]])
    expect(document).toEqual(before)
  })
  it('scales header and inline tempos including multirest onset, without changing performance',()=>{
    const document = parseM3NDocument('{key=Am}{4/4}{120qpm}\nN: 1 2 3 4 | {60qpm}{rest=2} | 5 6 7 1e |||')
    const before = compileScorePerformance(document)
    const layout = layoutNativeScore(document,{...options,tempoScale:.5})
    expect(layout.projection.glyphs.flatMap(glyph=>glyph.controls).filter(control=>control.kind==='tempo').map(control=>control.text)).toEqual(['♩ = 30'])
    const header = nativeHeaderGeometry(document,800,32,new DefaultTextMeasurer(),24,{tempoScale:.5,fixedDo:true})
    expect(header.svg).toContain('= 60</text>')
    expect(header.svg).toContain('>1=</text>')
    expect(compileScorePerformance(document)).toEqual(before)
  })
  it('engraves the measured header range with the selected pitch spelling and vector accidentals',()=>{
    const document = parseM3NDocument('{key=Db}{2/4}\nN: [1 3 5:h] 6{ac(7d)} ||')
    const geometry = nativeHeaderGeometry(document,800,32,new DefaultTextMeasurer(),24,{fixedDo:true,transpose:-1})
    const root = new DOMParser().parseFromString(`<svg>${geometry.svg}</svg>`,'image/svg+xml')
    const range = root.querySelector('[data-m3n-role="pitch-range"]')!
    expect([...range.querySelectorAll('text')].map(node=>node.textContent)).toEqual(['7','~','6'])
    expect([...range.querySelectorAll('text')].every(node=>node.getAttribute('font-size')==='16')).toBe(true)
    const altered = nativeHeaderGeometry(document,800,32,new DefaultTextMeasurer(),24,{fixedDo:true})
    const shifted = new DOMParser().parseFromString(`<svg>${altered.svg}</svg>`,'image/svg+xml')
    expect(shifted.querySelectorAll('[data-m3n-role="pitch-range"] path[data-m3n-symbol="♯"]')).toHaveLength(1)
  })
  it('paginates measured itinerary rows when the complete header exceeds a narrow page',()=>{
    const document = parseM3NDocument('{title=长演奏顺序}{origin=乐曲来源}{composer=作曲者}{lyricist=作词者}{key=Bb}{4/4}{60qpm}{order=Intro,A,B,A@C,B@C,Bridge,B@F,Coda,Intro,A,B,A@C,B@C,Bridge,B@F,Coda}\n===Intro\nN: 1 2 3 4 ||\n===A\nN: 1 2 3 4 ||\n===B\nN: 1 2 3 4 ||\n===Bridge\nN: 1 2 3 4 ||\n===Coda\nN: 1 2 3 4 |||')
    const geometry = nativeHeaderGeometry(document,320,32,new DefaultTextMeasurer())
    expect(geometry.height-24).toBeGreaterThan(Math.floor(320*277/190)-64)
    const paged = NativeNumberedNotationScore.create(document).render({width:320,paged:true})
    const continuous = NativeNumberedNotationScore.create(document).render({width:320,paged:false})
    expect(paged.length).toBeGreaterThan(1)
    const parse = (svg:string[])=>new DOMParser().parseFromString(svg.join(''),'text/html')
    const a = parse(paged), b = parse(continuous)
    expect([...a.querySelectorAll('[data-m3n-role="order"]')].map(node=>node.textContent)).toEqual([...b.querySelectorAll('[data-m3n-role="order"]')].map(node=>node.textContent))
    expect(a.querySelectorAll('g.note')).toHaveLength(b.querySelectorAll('g.note').length)
    for (const node of a.querySelectorAll('[data-m3n-role="order"]')) {
      let translatedY = Number(node.getAttribute('y'))
      for (let parent=node.parentElement;parent && parent.tagName!=='svg';parent=parent.parentElement) {
        translatedY += Number(/translate\(0 ([^)]+)\)/.exec(parent.getAttribute('transform') ?? '')?.[1] ?? 0)
      }
      expect(translatedY).toBeGreaterThanOrEqual(32)
      expect(translatedY).toBeLessThan(Math.floor(320*277/190)-32)
    }
  })
  it.each([{transpose:.5},{transpose:Infinity},{tempoScale:0},{tempoScale:-1},{tempoScale:NaN}])('rejects invalid options %j',extra=>{
    expect(()=>layoutNativeScore(parseM3NDocument('N: 1 2 3 4 |'),{...options,...extra})).toThrow()
  })
})
