import { describe, expect, it } from 'vitest'
import { element, hasClass, SvgGeometry, InkRangeIndex, textMeasurer, translate, xml } from './layout-svg.js'

describe('staff geometry traversal', () => {
  it('keeps cached leaf text exact through edits, inherited styles, transforms and nested spans', () => {
    const measure = (text: string, size: number, bold = false, italic = false) => ({
      width: text.length * size, left: italic ? -2 : 0, right: text.length * size + (bold ? 3 : 0), ascent: size * .8, descent: size * .2,
    })
    const label = element('text', {x:'3',y:'7','text-anchor':'middle'}, ['标签'])
    const root = element('g', {'font-size':'12'}, [label])
    const cached = new SvgGeometry(root, measure, true), reference = new SvgGeometry(root, measure)
    const compare = () => {
      for (let use = 0; use < 3; use++) {
        expect(cached.pieces(root)).toEqual(reference.pieces(root))
        expect(cached.ink(root)).toEqual(reference.ink(root))
        expect(cached.partitionWithoutClasses(root, ['verse'])).toEqual(reference.partitionWithoutClasses(root, ['verse']))
      }
    }
    compare()
    for (const edit of [
      () => { label.children[0] = '更多文字' },
      () => { label.attributes.x = '-8.125'; label.attributes.y = '23.456' },
      () => { label.attributes['text-anchor'] = 'end' },
      () => { root.attributes['font-size'] = '24' },
      () => { root.attributes.class = 'reh dynam' },
      () => { root.attributes.transform = 'translate(15 -9) scale(-2 1.5)' },
      () => { label.attributes['font-size'] = '8'; label.attributes['stroke-width'] = '2' },
      () => { label.children = [element('tspan', {'font-size':'32'}, ['嵌套'])] },
      () => { label.children = ['\u200B'] },
      () => { label.textValue = '覆盖文字' },
    ]) { edit(); compare() }
    const mutable = reference.pieces(root); mutable[0]!.left = -100000
    compare()
  })
  it('does not cache a public text measurer whose results can change', () => {
    let width = 10
    const label = element('text', {}, ['Text'])
    const geometry = new SvgGeometry(label, () => ({width,left:0,right:width,ascent:8,descent:2}))
    expect(geometry.ink(label).right).toBe(10)
    width = 20
    expect(geometry.ink(label).right).toBe(20)
  })
  it('keeps borrowed numeric ink equivalent through live transforms and default queries isolated', () => {
    const box = Object.freeze({ left: 1, right: 4, top: -2, bottom: 5 })
    const note = element('g', {})
    note.numericInk = [box]
    const root = element('g', {}, [note])
    const borrowed = new SvgGeometry(root, textMeasurer(), true), copied = new SvgGeometry(root, textMeasurer())
    expect(borrowed.pieces(root)[0]).toBe(box)
    const saved = copied.pieces(root)
    saved[0]!.left = -1000
    expect(borrowed.pieces(root)[0]!.left).toBe(1)
    for (const transform of ['translate(10 20)', 'scale(-2 3)', 'rotate(30)', 'matrix(1 0.5 0.2 1 3 4)']) {
      root.attributes.transform = transform
      expect(borrowed.pieces(root)).toEqual(copied.pieces(root))
      expect(borrowed.pieces(root)[0]).not.toBe(box)
    }
    delete root.attributes.transform
    borrowed.compileStatic(root, () => false)
    expect(borrowed.pieces(root)).toEqual(copied.pieces(root))
    translate(root, 15, 5)
    expect(borrowed.pieces(root)).toEqual(copied.pieces(root))
  })
  it('keeps partition identities distinct when immutable ink is reused by excluded and included nodes', () => {
    const box = Object.freeze({ left: 0, right: 5, top: 0, bottom: 10 })
    const omitted = element('g', { class: 'ending' }), music = element('g', {})
    omitted.numericInk = music.numericInk = [box]
    const root = element('g', {}, [omitted, music])
    const partition = new SvgGeometry(root, textMeasurer(), true).partitionWithoutClasses(root, ['ending'])
    expect(partition.all).toEqual([box, box])
    expect(partition.without).toEqual([box])
    expect(partition.all[0]).not.toBe(partition.without[0])
    expect(partition.all[1]).toBe(partition.without[0])
  })
  it('matches whole class tokens across SVG whitespace', () => {
    const node = element('g', { class: 'notehead\tstaff\nverse\u00a0ending' })
    for (const token of ['notehead', 'staff', 'verse', 'ending']) expect(hasClass(node, token)).toBe(true)
    for (const token of ['note', 'head', 'staffs', 'end']) expect(hasClass(node, token)).toBe(false)
  })
  it('excludes attachment subtrees while retaining ancestor transformations', () => {
    const root = element('g', { transform: 'translate(10 20)' }, [
      element('g', { transform: 'scale(2)' }, [
        element('rect', { x: '1', y: '2', width: '3', height: '4' }),
        element('g', { class: 'verse' }, [element('rect', { width: '100', height: '100' })]),
      ]),
    ])
    const geometry = new SvgGeometry(root, textMeasurer())
    expect(geometry.without(root, n => hasClass(n, 'verse'))).toEqual([{left:12,right:18,top:24,bottom:32}])
    expect(geometry.pieces(root)).toHaveLength(2)
    expect(root.children).toHaveLength(1)
  })
  it('observes moves and newly inserted geometry after previous measurements', () => {
    const rect = element('rect', { width: '10', height: '20' })
    const root = element('g', {}, [rect]), geometry = new SvgGeometry(root, textMeasurer())
    expect(geometry.ink(root)).toEqual({left:0,right:10,top:0,bottom:20})
    translate(rect, 30, 40)
    root.children.push(element('circle', { cx: '-10', cy: '-10', r: '2' }))
    expect(geometry.ink(root)).toEqual({left:-12,right:40,top:-12,bottom:60})
  })
  it('invalidates path ink, stroke, classes and inherited text styles after edits', () => {
    const path = element('path', { d: 'M0 0 L10 20', stroke: '#000', 'stroke-width': '2' })
    const label = element('text', { x: '0', y: '0' }, ['Text'])
    const group = element('g', { 'font-size': '10', class: 'verse other' }, [label])
    const root = element('g', {}, [path, group]), geometry = new SvgGeometry(root, textMeasurer())
    expect(geometry.ink(path)).toEqual({ left: -1, right: 11, top: -1, bottom: 21 })
    path.attributes.d = 'M20 30 L40 50'; path.attributes['stroke-width'] = '4'
    expect(geometry.ink(path)).toEqual({ left: 18, right: 42, top: 28, bottom: 52 })
    expect(hasClass(group, 'verse')).toBe(true)
    group.attributes.class = 'ending other'
    expect(hasClass(group, 'verse')).toBe(false)
    expect(hasClass(group, 'ending')).toBe(true)
    const before = geometry.ink(group)
    group.attributes['font-size'] = '20'
    expect(geometry.ink(group).right).toBeGreaterThan(before.right)
    label.children = ['Longer Text']
    expect(geometry.ink(group).right).toBeGreaterThan(before.right * 2)
    const previous = geometry.pieces(path); previous[0]!.left = -1000
    expect(geometry.ink(path).left).toBe(18)
  })
  it('compiles stable music blocks while keeping filtered queries and moving attachments live', () => {
    const music = element('g', {}, [element('rect', { class: 'staff-line', width: '10', height: '1' }), element('rect', { class: 'note', y: '3', width: '5', height: '5' })])
    const verse = element('g', { class: 'verse' }, [element('rect', { width: '100', height: '10' })])
    const root = element('g', {}, [music, verse]), geometry = new SvgGeometry(root, textMeasurer())
    const expected = geometry.pieces(root)
    geometry.compileStatic(root, node => hasClass(node, 'verse'))
    expect(geometry.pieces(root)).toEqual(expected)
    expect(geometry.without(root, node => hasClass(node, 'staff-line'))).toHaveLength(2)
    translate(verse, 0, 20)
    expect(geometry.ink(verse).bottom).toBe(30)
    translate(music, 7, 0)
    expect(geometry.ink(music).left).toBe(7)
  })

  it('partitions complete and spacing ink together without changing transparent music blocks', () => {
    const verse = element('g', { class: 'verse', transform: 'translate(0 30)' }, [element('text', { x: '1', y: '2' }, ['歌词'])])
    const ending = element('g', { class: 'ending', transform: 'translate(3 -20)' }, [element('rect', { width: '20', height: '1' })])
    const staff = element('g', { class: 'staff', transform: 'translate(5 9)' }, [
      element('path', { class: 'staff-line', d: 'M0 0L100 0' }),
      ...[1, 2, 3].map(i => element('g', { class: 'note' }, [element('rect', { x: String(i * 10), width: '5', height: '8' })])),
      verse, ending,
    ])
    const root = element('g', { transform: 'scale(0.7)' }, [staff]), geometry = new SvgGeometry(root, textMeasurer())
    const expected = xml(root)
    geometry.compileStatic(root, node => hasClass(node, 'verse') || hasClass(node, 'ending'))
    expect(xml(root)).toBe(expected)
    for (const classes of [['ending'], ['note'], ['verse', 'ending']]) {
      const partition = geometry.partitionWithoutClasses(root, classes)
      expect(partition.all).toEqual(geometry.pieces(root))
      expect(partition.without).toEqual(geometry.without(root, node => classes.some(name => hasClass(node, name))))
    }
    translate(ending, 10, 10)
    expect(geometry.partitionWithoutClasses(root, ['ending']).without).toEqual(geometry.withoutClasses(root, ['ending']))
  })

})

it('queries immutable and appended ink in its original order including zero-width ink', () => {
  const pieces = Array.from({ length: 500 }, (_, i) => ({ left: (i * 37) % 200, right: (i * 37) % 200 + i % 13, top: i, bottom: i + 1 }))
  const index = new InkRangeIndex(pieces)
  for (let step = 0; step < 30; step++) {
    pieces.push({ left: step * 3, right: step * 3 + step % 5, top: 0, bottom: 1 })
    for (const gap of [0, .25, 3]) {
      const left = step * 5, right = left + step % 7
      expect(index.query(left, right, gap)).toEqual(pieces.filter(p => p.right + gap > left && p.left < right + gap))
    }
  }
})

it('reuses compiled pieces only for unchanged ancestor transforms and immutable readers',()=>{
 const music=element('g',{},[element('rect',{width:'10',height:'5'}),element('rect',{x:'20',y:'10',width:'3',height:'8'})])
 const verse=element('g',{class:'verse'},[element('rect',{width:'2',height:'2'})])
 const root=element('g',{transform:'translate(3 7)'},[music,verse])
 const borrowed=new SvgGeometry(root,textMeasurer(),true),copied=new SvgGeometry(root,textMeasurer())
 borrowed.compileStatic(root,node=>hasClass(node,'verse'))
 const first=borrowed.pieces(root),again=borrowed.pieces(root)
 expect(again).toEqual(copied.pieces(root))
 expect(again[0]).toBe(first[0])
 expect(borrowed.ink(root)).toEqual(copied.ink(root))
 for(const transform of ['translate(8 11)','scale(-2 3)','rotate(30)','matrix(1 .5 .2 1 3 4)']){
  root.attributes.transform=transform
  expect(borrowed.pieces(root)).toEqual(copied.pieces(root))
  expect(borrowed.ink(root)).toEqual(copied.ink(root))
 }
 const publicPieces=copied.pieces(root)
 publicPieces[0]!.left=-999
 expect(copied.pieces(root)[0]!.left).not.toBe(-999)
})
