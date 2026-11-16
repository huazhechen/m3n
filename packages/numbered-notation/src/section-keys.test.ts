// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument, scoreEventIds } from '@m3n/notation'
import { compileScore, ASTFunctionNode } from '@m3n/jpfun'
import { NumberedNotationScore } from './score.js'
import { projectNumberedScore } from './projection.js'

const source = '{key=C}{2/4}{order=A,B,A@Db}\n===A\nN: 1 2 ||\nL1: 春天\nL2: 花开\n===B\nN: 3 4 ||'

describe('numbered keyed section visits', () => {
  it.each([320,800])('centers two key rows together at normal key size at %spx', width => {
    const document = parseM3NDocument(source), before = structuredClone(document)
    const projection = projectNumberedScore(document, {width,paged:false})
    expect(projection.source).toContain('visits="1:C4;2:Db4"')
    expect(projection.source).toContain('A（1=D♭）')
    const result = compileScore(projection.source, {autoWrap:true})
    const key = result.layout.objects.find(node=>node.ast instanceof ASTFunctionNode && node.ast.callName==='key' && node.ast.toString().includes('visits='))!
    expect(key).toBeDefined()
    expect(key.box.visualAxis).toBeCloseTo(key.box.h / 2)
    const svg = NumberedNotationScore.create(document).render({width,paged:false}).join('')
    const root = new DOMParser().parseFromString(svg,'text/html')
    for (const prefix of ['1. 1=','2. 1=']) {
      const text = [...root.querySelectorAll('text')].find(node=>node.textContent===prefix)!
      expect(text.getAttribute('font-size')).toBe('16')
      expect(text.getAttribute('font-family')).toBe('M3N Numbers')
    }
    expect(root.querySelectorAll('g.note')).toHaveLength(4)
    expect(document).toEqual(before)
  })

  it('keeps standard key rows while fixed-do retains explicit visit octaves', () => {
    const document = parseM3NDocument('{key=Bb}{2/4}{order=A,A@C5,A@F5}\n===A\nN: 6 2e ||')
    const id = scoreEventIds(document).get(document.parts.get('score')!.melody[0]!.events[0]!)!
    const compact = projectNumberedScore(document, {width:800,paged:false})
    expect(compact.source).toContain('visits="1:Bb4;2:C4;3:F4"')
    const fixed = projectNumberedScore(document, {width:800,paged:false,fixedDo:true})
    const visits = [...fixed.bindings.values()].filter(binding => binding.xmlId === id)
    expect(visits.map(binding => [binding.event!.key, binding.event!.octaveShift])).toEqual([['Bb',0],['C',1],['F',1]])
    expect(fixed.source).not.toContain('visits=')
  })

  it('groups equal-key visits and updates both entry and itinerary when transposed', () => {
    const document = parseM3NDocument(source.replace('A,B,A@Db','A,A,B,A@Db'))
    const projection = projectNumberedScore(document,{width:800,paged:false,transpose:2})
    expect(projection.source).toContain('visits="1–2:D4;3:Eb4"')
    expect(projection.source).toContain('A（1=D）')
    expect(projection.source).toContain('A（1=E♭）')
  })

  it('labels internal modulations for each visit and honors an override on the first visit', () => {
    const input = '{key=C}{2/4}{order=A@D,A@Eb}\n===A\nN: 1 2 | {key=G}3 4 ||'
    const projection = projectNumberedScore(parseM3NDocument(input),{width:800,paged:false})
    expect(projection.source).toContain('visits="1:D4;2:Eb4"')
    expect(projection.source).toContain('visits="1:A4;2:Bb4"')
  })

  it.each([320,800])('expands fixed-do pitches and selects lyrics while preserving playback IDs and passes at %spx', width => {
    const document = parseM3NDocument(source), ids = scoreEventIds(document)
    const firstId = ids.get(document.parts.get('score')!.melody[0]!.events[0]!)!
    const projection = projectNumberedScore(document,{width,paged:false,fixedDo:true})
    expect(projection.source).not.toContain('visits=')
    const bindings = [...projection.bindings.values()].filter(binding=>binding.xmlId===firstId)
    expect(bindings.map(binding=>binding.passes)).toEqual([[1],[2]])
    expect(bindings.map(binding=>binding.lyrics.get(0)!.texts.join(''))).toEqual(['春','花'])
    expect(bindings.map(binding=>binding.event!.key)).toEqual(['C','Db'])
    const pages = NumberedNotationScore.create(document).render({width,paged:false,fixedDo:true})
    const root = new DOMParser().parseFromString(pages.join(''),'text/html')
    const groups = [...root.querySelectorAll(`g.note[data-m3n-id="${firstId}"]`)]
    expect(groups.map(group=>group.getAttribute('data-m3n-passes'))).toEqual(['1','2'])
    expect(new Set([...root.querySelectorAll('[id]')].map(node=>node.id)).size).toBe(root.querySelectorAll('[id]').length)
  })
})
