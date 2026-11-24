import { describe, expect, it } from 'vitest'
import { element, hasClass, SvgGeometry, textMeasurer, translate, xml } from './layout-svg.js'

describe('staff geometry traversal', () => {
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
