import { describe, expect, it } from 'vitest'
import { element, hasClass, SvgGeometry, InkRangeIndex, textMeasurer, translate, xml, type XmlNode } from './layout-svg.js'

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


it('streams scaled partitions with exact occurrence identities and live transforms', () => {
  const shared = Object.freeze({ left: -2, right: 5, top: 0, bottom: 10 })
  const omitted = element('g', { class: 'ending' }), music = element('g', {})
  omitted.numericInk = music.numericInk = [shared]
  const root = element('g', {}, [omitted, music])
  const geometry = new SvgGeometry(root, textMeasurer(), true)
  for (const offset of [0, 15, -7]) {
    if (offset) translate(root, offset, 4)
    geometry.compileStatic(root, n => hasClass(n, 'ending'), ['ending'])
    const original = geometry.partitionWithoutClasses(root, ['ending'])
    const expected = original.all.map(box => ({ left: box.left * .75, right: box.right * .75,
      top: box.top * .75, bottom: box.bottom * .75 }))
    const actual = geometry.partitionScaledWithoutClasses(root, ['ending'], .75)
    expect(actual.all).toEqual(expected)
    expect(actual.without).toEqual([expected[1]])
    expect(actual.boundary).toEqual([expected[0]])
    expect(actual.all[0]).not.toBe(actual.all[1])
    expect(actual.all[1]).toBe(actual.without[0])
    expect(actual.all[0]).toBe(actual.boundary[0])
    actual.all[0]!.left = -999
    expect(geometry.partitionScaledWithoutClasses(root, ['ending'], .75).all).toEqual(expected)
  }
})


it('collects selected edge ink in the final partition without cloning ancestor trees', () => {
  // Independent oracle: the previous edge path cloned selected ancestors,
  // preserving transforms and inherited text styles before collecting ink.
  const select = (node: XmlNode): XmlNode | undefined => {
    if (hasClass(node, 'staff-clef')) return node
    const children = node.children.flatMap(child => typeof child === 'string' ? [] : select(child) ?? [])
    return children.length ? { ...node, numericInk: undefined, renderNodes: undefined, tagName: 'g', children } : undefined
  }
  for (const borrowed of [false, true]) for (const compiled of [false, true]) {
    const nested = element('g', { class: 'staff-clef', transform: 'translate(2 -3)' }, [
      element('rect', { x: '-1', y: '2', width: '4', height: '8' }),
    ])
    const clef = element('g', { class: 'staff-clef', transform: 'scale(1.25 .75)' }, [
      nested, element('text', { x: '3', y: '9' }, ['edge']),
    ])
    const music = element('g', {}, [clef, element('rect', { width: '10', height: '4' })])
    // A prepared ancestor containing a selected class must be traversed.
    music.preparedMusicInk = { boxes: new SvgGeometry(music, textMeasurer()).pieces(music), classes: ['staff-clef'] }
    const root = element('g', { transform: 'translate(10 20)', 'font-size': '15', 'font-weight': 'bold' }, [
      element('g', { class: 'staff' }, [music,
        element('g', { class: 'verse' }, [element('text', {}, ['mutable'])]),
        element('g', { class: 'mNum' }, [element('rect', { width: '2', height: '3' })]),
      ]),
    ])
    const geometry = new SvgGeometry(root, textMeasurer(), borrowed)
    if (compiled) geometry.compileStatic(root, node => hasClass(node, 'verse'), ['verse'])
    for (const offset of [0, 7, -2]) {
      if (offset) translate(root, offset, -1)
      const reference = new SvgGeometry(root, textMeasurer())
      const selected = reference.pieces(select(root)!).map(box => ({
        left: box.left * .75, right: box.right * .75, top: box.top * .75, bottom: box.bottom * .75,
      }))
      const partition = geometry.partitionScaledWithoutClasses(root, ['mNum', 'staff-clef'], .75, ['staff-clef'])
      expect(partition.selected).toEqual(selected)
      expect(partition.selected.every(box => partition.boundary.includes(box))).toBe(true)
      expect(partition.selected.every(box => !partition.without.includes(box))).toBe(true)
      expect(partition.selected.length).toBe(selected.length)
      partition.selected[0]!.left = -999
      expect(geometry.partitionScaledWithoutClasses(root, ['mNum', 'staff-clef'], .75, ['staff-clef']).selected).toEqual(selected)
    }
  }
})


it('uses numeric music class summaries without materializing wrappers for unrelated filters', () => {
  let materialized = 0
  const box = Object.freeze({ left: 2, right: 6, top: -1, bottom: 8 })
  const run = element('g')
  run.preparedMusicInk = { boxes: [box], classes: ['note'] }
  run.geometryChildren = () => {
    materialized++
    return [element('g', { class: 'note secondary', id: 'virtual-note' }, [
      { ...element('g'), numericInk: [box] },
    ])]
  }
  // The summary must include every semantic class, including multi-class ones.
  run.preparedMusicInk.classes = ['note', 'secondary']
  const verse = element('g', { class: 'verse' }, [element('rect', { y: '20', width: '5', height: '2' })])
  const root = element('g', {}, [element('g', { class: 'staff' }, [
    run, element('rect', { class: 'stable ornament', x: '10', width: '2', height: '3' }), verse,
  ])])
  const geometry = new SvgGeometry(root, textMeasurer(), true)
  geometry.compileStatic(root, n => hasClass(n, 'verse'), ['verse'])
  expect(materialized).toBe(0)
  const all = geometry.pieces(root)
  expect(geometry.withoutClasses(root, ['staff-clef'])).toEqual(all)
  expect(geometry.partitionScaledWithoutClasses(root, ['staff-clef'], 1, ['staff-clef']).selected).toEqual([])
  expect(materialized).toBe(0)
  // A matching class or arbitrary predicate must still inspect the semantic
  // wrappers; summaries are only a proof that a filter cannot match.
  expect(geometry.withoutClasses(root, ['secondary'])).toEqual(all.slice(1))
  expect(materialized).toBeGreaterThan(0)
  expect(geometry.without(root, n => n.attributes.id === 'virtual-note')).toEqual(all.slice(1))
  expect(geometry.withoutClasses(root, ['ornament'])).toEqual([all[0], all[2]])
})
