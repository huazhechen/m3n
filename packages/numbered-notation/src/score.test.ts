// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { ASTFunctionNode, compileScore, getLayoutBounds, isVisualTemporalNode, type VisualTemporalNode } from '@m3n/jpfun'
import { m3nToMei, parseM3NDocument, scoreEventIds, type ScoreDocument } from '@m3n/notation'
import { NumberedNotationScore, type NumberedNotationRenderOptions } from './score.js'
import { projectNumberedScore } from './projection.js'

const options = { paged: false, width: 800 }
function render(source: string | ScoreDocument, settings: Partial<NumberedNotationRenderOptions> = {}) {
  const document = typeof source === 'string' ? parseM3NDocument(source) : source
  const score = NumberedNotationScore.create(document)
  const pages = score.render({ ...options, ...settings })
  const root = new DOMParser().parseFromString(`<main>${pages.join('')}</main>`, 'text/html')
  return { pages, root, score, document }
}
function numbers(root: Document, id: string) {
  return [...root.querySelectorAll(`g.note[data-m3n-id="${id}"] text`)].map(text => text.textContent).join('')
}
function lyrics(root: Document, id: string, row = 1) {
  return [...root.querySelectorAll(`text[data-m3n-role="lyric"][data-m3n-id="${id}"][data-m3n-rendition="${row}"]`)].map(text => text.textContent?.replaceAll('\u200B', '')).join('')
}
function geometry(document: ScoreDocument, settings = options) {
  const projection = projectNumberedScore(document, settings)
  return compileScore(projection.source, { autoWrap: true, alignRelations: true })
}

function mainPitches(node: VisualTemporalNode): { name: string; acc: string; octave: number }[] {
  const compound = node as VisualTemporalNode & { host?: VisualTemporalNode; members?: readonly VisualTemporalNode[]; name?: string; acc?: string; octave?: number }
  if (compound.name !== undefined) return [{ name: compound.name, acc: compound.acc ?? '', octave: compound.octave ?? 0 }]
  if (compound.host) return mainPitches(compound.host) // Grace notes do not replace the main pitch.
  return (compound.members ?? []).filter(member => !member.T.isZero()).flatMap(mainPitches)
}

const corpusFiles = readdirSync(resolve(process.cwd(), '../../src/scores')).filter(name => name.endsWith('.m3n')).sort()

describe('jpFun numbered notation adapter', () => {
  it('retains extended harmony symbols through the shared domain projection', () => {
    const { root, score } = render('{key=D}{4/4}\nN: 1 2 3 4 | 5 6 7 1e | 1e 7 6 5 | 4 3 2 1 |||\nC: Imaj7 | Dm7 | G/B | N.C. |')
    const labels = [...root.querySelectorAll('text')].map(text => text.textContent).join('')
    for (const symbol of ['Imaj7', 'Dm7', 'G/B', 'N.C.']) expect(labels).toContain(symbol)
    expect(score.diagnostics.filter(item => item.severity === 'error')).toEqual([])
  })
  it('engraves compound tempo with a dotted quarter while retaining QPM in the domain', () => {
    const { root, document } = render('{6/8}{120qpm}\nN: (1 2 3) (4 5 6) |||')
    expect(document.tempo).toBe(120)
    expect([...root.querySelectorAll('text')].some(text => text.textContent === '= 80')).toBe(true)
    const projected = projectNumberedScore(document, options)
    expect(projected.source).toContain('@tempo(120,size=16px,font="M3N Numbers",unit=4,dots=1)')
  })
  it('uses the vendored engine and embedded font with stable interactive measure structure', () => {
    const { pages, root } = render('{title=测试曲} {key=D} {3/4} {90qpm}\nN: ||: 1 2 3 | 4 5 6 :|||\nL: 春天来了花开')
    expect(root.querySelector('svg')?.getAttribute('data-engine')).toBe('jpfun')
    expect(root.querySelector('g.system g.measure #m3n-e-1')).not.toBeNull()
    expect(root.querySelector('.measure')?.getAttribute('data-m3n-measure-start')).not.toBeNull()
    expect(pages[0]).toContain('data:font/ttf;base64,')
    expect(pages[0]).not.toContain('shuzi_b_bian')
    expect(root.body.textContent).toContain('测试曲')
  })

  it('renders solely from ScoreDocument without reading its source text', () => {
    const document = parseM3NDocument('{2/4}\nN: 1 2 | 3 4 |||\nL: 春天来了')
    const before = render(document).pages
    document.source = 'unrelated content'
    expect(render(document).pages).toEqual(before)
  })

  it('shares every MEI event ID, including bass and tuplet children', () => {
    const { root, document } = render('{4/4}\nN: [123:2] 4 5 | 6 7 1e 2e |||\nB: 1 2 3 4 | 5 6 7 1e |||')
    const mei = m3nToMei(document.source, document)
    for (const id of scoreEventIds(document).values()) {
      expect(mei.sourceMap.some(item => item.xmlId === id)).toBe(true)
      expect(root.querySelector(`[data-m3n-id="${id}"]`)).not.toBeNull()
    }
    expect(root.querySelector('#m3n-e-1-n3')).not.toBeNull()
    const ids = [...root.querySelectorAll('[id]')].map(node => node.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('aligns both voices when the melody supplies opening and closing repeat anchors', () => {
    const document = parseM3NDocument('{6/8}\nN: ||: (1 2 3) (4 5 6) | 1e^. :||\nB: 1d 3d 5d | [1d3d5d:h]^. |||')
    const result = geometry(document)
    expect(result.lowering.duration.toNumber()).toBe(6)
    const first = result.layout.objects.filter(node => node.T.compare(0) > 0 && node.t.isZero())
    expect(first).toHaveLength(2)
    expect(first[0]!.box.x + first[0]!.box.anchor).toBeCloseTo(first[1]!.box.x + first[1]!.box.anchor)
  })

  it('keeps event IDs stable when the export excludes the bass staff', () => {
    const source = '{2/4}\nN: 1 2 | 3 4 |||\nB: 1d 2d | 3d 4d |||'
    const withBass = render(source), withoutBass = render(source, { includeBass: false })
    expect(withoutBass.root.querySelector('#m3n-e-5')).not.toBeNull()
    expect(withoutBass.root.querySelector('#m3n-e-3')).toBeNull()
    expect(withBass.root.querySelector('#m3n-e-3')).not.toBeNull()
  })

  it('renders long rests without sustain marks or duplicate DOM IDs', () => {
    const { root } = render('{4/4}\nN: 0^ 1 2 |||\nL: 春天')
    expect(numbers(root, 'm3n-e-1')).toBe('00')
    expect(root.querySelectorAll('#m3n-e-1')).toHaveLength(1)
    expect(lyrics(root, 'm3n-e-2')).toBe('春')
    expect(lyrics(root, 'm3n-e-3')).toBe('天')
  })

  it('renders all sustained beats and retains exact very short and dotted durations', () => {
    const { root, document } = render('{4/4}\nN: 1^^^ | ((((2)))) 3. |||')
    expect(root.querySelectorAll('g.note[data-m3n-id="m3n-e-1"]')).toHaveLength(8)
    expect(root.querySelectorAll('g.note[data-m3n-id="m3n-e-1"] line')).toHaveLength(7)
    const result = geometry(document)
    const expected = [...document.parts.values()][0]!.melody.flatMap(m => m.events).reduce((sum, event) => sum + event.beats, 0)
    expect(result.lowering.duration.toNumber()).toBeCloseTo(expected)
    expect(root.querySelectorAll('circle').length).toBeGreaterThan(0)
  })

  it.each(['(1 2) 3 4 5', '(1.) ((2)) 3 4 5', '((1 2 3 4)) 5 6 7'])('preserves fractional durations in %s', notes => {
    const document = parseM3NDocument(`{4/4}\nN: ${notes} |||`)
    const expected = [...document.parts.values()][0]!.melody.flatMap(measure => measure.events).reduce((sum, event) => sum + event.beats, 0)
    expect(geometry(document).lowering.duration.toNumber()).toBeCloseTo(expected)
  })

  it.each(['fermata', 'tip', 'str', 'hold', 'brk', 'breath', 'tr', 'f1', 'f5'])('retains the %s postfix', name => {
    const plain = render('{4/4}\nN: 1 2 3 4 |||').root.querySelector('#m3n-e-1')!.innerHTML
    const marked = render(`{4/4}\nN: 1{${name}} 2 3 4 |||`)
    expect(marked.root.querySelector('#m3n-e-1')!.innerHTML).not.toBe(plain)
    expect(marked.score.diagnostics.filter(item => item.code === 'NUMBERED_UNSUPPORTED_MARK')).toEqual([])
    for (const object of geometry(marked.document).layout.objects) {
      const box = getLayoutBounds(object)
      expect(box.w).toBeLessThan(800)
    }
  })

  it.each(['1e', '1ee', '[1e3e:h]', '1ee{ac(7e)}'])('keeps the filled staccato wedge above octave dots and below other marks on %s', pitch => {
    const source = `{2/4}\nN: {p} {dim=text} ${pitch}{tr}{f1}{tip} 2{/} |||`
    const { document, root } = render(source)
    const note = geometry(document).layout.objects.find(node => !node.T.isZero())!
    const members = (note as VisualTemporalNode & { members: readonly VisualTemporalNode[] }).members
    const wedge = members.find(member => (member.ast as ASTFunctionNode & { definition?: { name: string } }).definition?.name === 'staccatissimo')!
    expect(wedge).toBeDefined()
    const wedgeBox = getLayoutBounds(wedge)
    for (const member of members.slice(1).filter(member => member !== wedge)) {
      const box = getLayoutBounds(member)
      expect(box.y + box.h).toBeLessThan(wedgeBox.y)
    }
    const circles = [...root.querySelectorAll('#m3n-e-1 circle')]
    const octaveDots = circles.filter(circle => Number(circle.getAttribute('r')) === 22 * 0.075)
    expect(octaveDots).toHaveLength(pitch === '1e' ? 1 : 2)
    expect(circles).toHaveLength(octaveDots.length + (pitch.includes('{ac') ? 1 : 0))
    expect(root.querySelector('#m3n-e-1 path[fill="#000"][stroke="none"]')).not.toBeNull()
    const octaveTop = Math.min(...octaveDots.map(circle => Number(circle.getAttribute('cy')) - Number(circle.getAttribute('r'))))
    expect(wedgeBox.y + wedgeBox.h).toBeLessThan(octaveTop)
  })

  it('uses a filled wedge for staccato while preserving the open accent chevron', () => {
    const { root } = render('{2/4}\nN: 1e{tip} 1e{str} |||')
    const wedge = root.querySelector('#m3n-e-1 path')!
    const accent = root.querySelector('#m3n-e-2 path')!
    expect(wedge.getAttribute('fill')).toBe('#000')
    expect(wedge.getAttribute('d')).toMatch(/Z$/)
    expect(accent.getAttribute('fill')).toBe('none')
    expect(accent.getAttribute('stroke')).toBe('#000')
    expect(accent.getAttribute('d')).not.toMatch(/Z$/)
  })

  it('retains text directives, section labels and chord annotations together', () => {
    const source = '{4/4}\n===练习\nN: {text=说明} {chord=C} 1 2 3 4 |||'
    const { root } = render(source)
    expect(root.body.textContent).toContain('练习')
    expect(root.body.textContent).toContain('说明')
    expect(root.body.textContent).toContain('C')
  })

  it('retains octave intervals and transposes each chord pitch visually', () => {
    const base = render('{4/4}\nN: [135:h] 2 3 4 |||')
    const shifted = render('{4/4}\nN: {8va}[135:h] 2 3 4{/} |||')
    expect(shifted.root.querySelector('#m3n-e-1')!.querySelectorAll('circle').length).toBeGreaterThan(base.root.querySelector('#m3n-e-1')!.querySelectorAll('circle').length)
    expect(numbers(shifted.root, 'm3n-e-1')).toBe('135')
  })

  it('anchors long chord ties to the chord instead of its final low sustain dash', () => {
    const result = geometry(parseM3NDocument('{4/4}\nN: [1d3d5d:h]^^~ | [1d3d5d:h]^^ |||'))
    const tie = result.lowering.attachments.find(attachment => 'endPoints' in attachment) as unknown as { endPoints: { ast: { callName: string } }[] }
    expect(tie.endPoints.map(node => node.ast.callName)).toEqual(['up', 'up'])
    const hairpinResult = geometry(parseM3NDocument('{4/4}\nN: {cresc}[1d3d5d:h]^^{/} |||'))
    const hairpin = hairpinResult.lowering.attachments.find(attachment => 'endPoints' in attachment) as unknown as { endPoints: VisualTemporalNode[] }
    expect(hairpin.endPoints.map(node => node.t.toNumber())).toEqual([0, 3])
  })

  it.each([
    ['two-beat notes', '{2/4}\nN: 6^~ | 6^ |||', 'note'],
    ['four-beat notes across an explicit break', '{4/4}\nN: 6^^^~ | {br}6^^^ |||', 'note'],
    ['a decorated sustained note', '{2/4}\nN: 6e^~{fermata} | 6e^ |||', 'up'],
    ['a tuplet ending in a rest', '{2/4}\nN: [660:2]~ | 6^ |||', 'note'],
  ])('anchors sustained-note ties on the pitched glyph: %s', (_name, source, kind) => {
    const document = parseM3NDocument(source)
    const events = [...document.parts.values()].flatMap(part => part.melody.flatMap(measure => measure.events))
    for (const width of [320, 800]) for (const paged of [false, true]) {
      const projection = projectNumberedScore(document, { width, paged })
      const result = geometry(document, { width, paged })
      const tie = result.lowering.attachments.find(attachment => 'endPoints' in attachment) as unknown as { endPoints: VisualTemporalNode[] }
      const start = tie.endPoints[0]!
      const ast = start.ast as ASTFunctionNode
      const event = events[0]!
      const binding = [...projection.bindings.values()].find(binding => binding.event === event && binding.slot === (event.tieFromTupletIndex ?? 0))!
      expect(ast.callName).toBe(kind)
      expect(ast.labelable?.()?.label).toBe(binding.label)
      expect(mainPitches(start).map(pitch => pitch.name)).toEqual(['6'])
    }
  })

  it.each([320, 600, 800, 1000].flatMap(width => [false, true].map(paged => ({ width, paged }))))('starts Andy’s 明白 tie on 6 instead of the sustain dash at width $width, paged=$paged', ({ width, paged }) => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/andy_01.m3n'), 'utf8')
    const { root, document } = render(source, { width, paged })
    const event = [...document.parts.values()].flatMap(part => part.melody.flatMap(measure => measure.events))
      .find(event => event.sourceStart === source.indexOf('6^~ | 6^'))!
    const id = scoreEventIds(document).get(event)!
    expect(lyrics(root, id)).toBe('白')
    const result = geometry(document, { width, paged })
    const projection = projectNumberedScore(document, { width, paged })
    const labels = [...projection.bindings.values()].filter(binding => binding.event === event).map(binding => binding.label)
    const tie = (result.lowering.attachments as unknown as { endPoints?: VisualTemporalNode[] }[])
      .find(attachment => attachment.endPoints?.some(node => labels.includes((node.ast as ASTFunctionNode).labelable?.()?.label ?? '')))!
    const start = tie.endPoints![0]!
    const ast = start.ast as ASTFunctionNode
    expect(ast.labelable?.()?.label).toBe(labels[0])
    expect(ast.callName).toBe('note')
    expect(mainPitches(start).map(pitch => pitch.name)).toEqual(['6'])
  })

  it('preserves underlined lyric groups without underlining neighboring syllables', () => {
    const { root } = render('{4/4}\nN: 1 2 3 4 |||\nL: (起来，)春(天里)好')
    const groups = [...root.querySelectorAll('text[data-m3n-underlined="true"]')]
    expect(groups.map(node => node.textContent)).toEqual(['起来，', '天里'])
    expect(root.querySelector('text[data-m3n-id="m3n-e-2"][data-m3n-underlined]')).toBeNull()
  })

  it('preserves tempo, key and meter changes at their musical positions', () => {
    const { root } = render('{key=C} {4/4} {90qpm}\nN: 1 2 3 4 | {120qpm} {key=Bb} {3/4} 5 6 7 |||')
    expect(root.body.textContent).toContain('90')
    expect(root.body.textContent).toContain('120')
    expect(root.body.textContent).toContain('B')
    expect(root.body.textContent).toContain('3')
  })

  it('places section names above directions, harmony and music while keeping annotations linked to their event', () => {
    const document = parseM3NDocument('{4/4}\n===训练\nN: {text=练习说明} {cresc}1{tr} 2 3 4{/} |||')
    document.parts.values().next().value!.melody[0]!.events[0]!.chord = 'Am'
    const { root } = render(document)
    const annotations = [...root.querySelectorAll('text[data-m3n-role="annotation"]')]
    expect(annotations.map(node => node.textContent)).toEqual(['Am', '练习说明', '训练'])
    expect(annotations.map(node => node.getAttribute('font-weight'))).toEqual(['normal', 'normal', '700'])
    for (const node of annotations) expect(node.getAttribute('data-m3n-id')).toBe('m3n-e-1')
    const y = (text: string) => Number(annotations.find(node => node.textContent === text)!.getAttribute('y'))
    expect(y('训练')).toBeLessThan(y('练习说明'))
    expect(y('练习说明')).toBeLessThan(y('Am'))
    const result = geometry(document)
    const direction = result.layout.attachments.at(-2)!.box
    const music = result.layout.attachments.slice(0, -3).filter(item => item.regions.length)
    expect(music.length).toBeGreaterThan(0)
    for (const item of music) expect(direction.y + direction.h).toBeLessThan(item.box.y)
  })

  it.each([320, 600, 800, 1000].flatMap(width => [false, true].map(paged => ({ width, paged }))))('orders harmonica exercise annotations outside musical symbols at width $width, paged=$paged', settings => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n'), 'utf8')
    const document = parseM3NDocument(source)
    const result = geometry(document, settings)
    const labels = result.layout.attachments.filter(item => item.sourceSpan && result.maskedSource.slice(item.sourceSpan.start, item.sourceSpan.end).startsWith('@text('))
    expect(labels.length).toBe(30)
    const text = (item: typeof labels[number]) => result.maskedSource.slice(item.sourceSpan!.start, item.sourceSpan!.end)
    const section = labels.find(item => text(item).includes('"机能训练"'))!.box
    const instruction = labels.find(item => text(item).includes('"快速吹吸切换"'))!.box
    expect(section.y + section.h).toBeLessThan(instruction.y)
    for (const label of labels) for (const symbol of result.layout.attachments.filter(item => !labels.includes(item))) {
      const overlaps = label.regions.some(a => symbol.regions.some(b => a.line === b.line && a.track === b.track
        && a.x < b.x + b.w && b.x < a.x + a.w))
      if (overlaps) expect(label.box.y + label.box.h).toBeLessThan(symbol.box.y)
    }
    const { root } = render(document, settings)
    expect(root.querySelectorAll('text[data-m3n-role="annotation"]')).toHaveLength(labels.length)
  })

  it.each([false, true])('fills every harmonica exercise system at width 1000, paged=%s', paged => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n'), 'utf8')
    const { layout } = geometry(parseM3NDocument(source), { width: 1000, paged })
    const musicLines = new Set(layout.objects.filter(node => !node.T.isZero()).map(node => node.layoutLine))
    for (const line of musicLines) {
      const nodes = layout.objects.filter(node => node.layoutLine === line)
      expect(Math.min(...nodes.map(node => node.box.x)), `system ${line} left edge`).toBeCloseTo(32)
      expect(Math.max(...nodes.map(node => node.box.x + node.box.w)), `system ${line} right edge`).toBeCloseTo(968)
    }
  })

  it.each([320, 600, 800, 1000].flatMap(width => [false, true].map(paged => ({ width, paged }))))('aligns harmonica tuplet brackets within each system at width $width, paged=$paged', settings => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n'), 'utf8')
    const result = geometry(parseM3NDocument(source), settings)
    const brackets = result.layout.attachments.filter(item => item.sourceSpan
      && result.maskedSource.slice(item.sourceSpan.start, item.sourceSpan.end).startsWith('@tuplet('))
    expect(brackets.length).toBeGreaterThan(20)
    for (const line of new Set(brackets.flatMap(item => item.regions.map(region => region.line)))) {
      const tops = brackets.flatMap(item => item.regions.filter(region => region.line === line).map(region => region.y))
      expect(Math.max(...tops) - Math.min(...tops), `system ${line} tuplet alignment`).toBeLessThan(0.01)
    }
  })

  it('renders the number of complete-bar rests and excludes them from interval endpoints', () => {
    const { root, score } = render('{4/4}\nN: {lg}1 2 3 4{/} | {rest=2} | 4 3 2 1 |||')
    expect(root.querySelectorAll('g.measure')).toHaveLength(3)
    expect(root.body.textContent).toContain('2')
    expect(score.diagnostics.filter(d => d.severity === 'error')).toEqual([])
  })

  it('renders leading grace notes and keeps them inside the main event group', () => {
    const { root } = render('{4/4}\nN: 1{ac(7d)} 2{ap((35))} 3 4 |||')
    expect(numbers(root, 'm3n-e-1')).toContain('7')
    expect(numbers(root, 'm3n-e-2')).toContain('35')
    expect(root.querySelector('#m3n-e-1')?.querySelectorAll('text').length).toBe(2)
  })

  it('expands tuplets sequentially with per-note lyrics and a shared playback identity', () => {
    const { root } = render('{4/4}\nN: [123:2] 4 5 |||\nL: 春夏秋冬天')
    expect(lyrics(root, 'm3n-e-1')).toBe('春夏秋')
    expect(numbers(root, 'm3n-e-1')).toBe('123')
    expect(root.querySelectorAll('[id^="m3n-e-1-n"]')).toHaveLength(3)
  })

  it('keeps lyrics on the first tied event and skips instrumental passages', () => {
    const tied = render('{4/4}\nN: 1~ 1 2 3 |||\nL: 春天地')
    expect(lyrics(tied.root, 'm3n-e-1')).toBe('春')
    expect(lyrics(tied.root, 'm3n-e-2')).toBe('')
    expect(lyrics(tied.root, 'm3n-e-3')).toBe('天')
    const instrumental = render('{4/4}\nN: {inst}1 2{/} 3 4 |||\nL: 春天')
    expect(lyrics(instrumental.root, 'm3n-e-3')).toBe('春')
  })

  it.each([320, 600, 800, 1000].flatMap(width => [false, true].map(paged => ({ width, paged }))))('engraves instrumental range parentheses across systems and pages at width $width, paged=$paged', ({ width, paged }) => {
    const source = '{4/4}\nN: {inst}1d^ (2 3) 4 | ' + Array(28).fill('1 2 3 4 |').join(' ') + ' {br}[135:h]^ 0^ {/} | 5 6 7 1e |||\nL: 春天花开'
    const document = parseM3NDocument(source)
    const projection = projectNumberedScore(document, { width, paged })
    expect(projection.source.match(/@paren\(/g)).toHaveLength(1)
    const result = geometry(document, { width, paged })
    const attachment = result.layout.attachments.find(attachment => attachment.sourceSpan
      && projection.source.slice(attachment.sourceSpan.start, attachment.sourceSpan.end).startsWith('@paren('))!
    const events = [...projection.bindings.values()].filter(binding => binding.event && binding.event.sourceEnd <= document.intervals[0]!.end!)
    const labels = new Set(events.map(binding => binding.label))
    const hosts = result.layout.objects.filter(node => node.ast instanceof ASTFunctionNode && labels.has(node.ast.labelable?.()?.label ?? ''))
    const lines = [...new Set(hosts.map(node => node.layoutLine))]
    expect(lines.length).toBeGreaterThan(1)
    expect(attachment.regions).toHaveLength(lines.length * 2)
    for (const line of lines) {
      const notes = hosts.filter(node => node.layoutLine === line)
      const [left, right] = attachment.regions.filter(region => region.line === line)
      expect(left!.x + left!.w).toBeLessThan(Math.min(...notes.map(node => node.box.x)))
      expect(right!.x).toBeGreaterThan(Math.max(...notes.map(node => node.box.x + node.box.w)))
      expect(left!.x).toBeGreaterThanOrEqual(32 - 1e-6)
      expect(right!.x + right!.w).toBeLessThanOrEqual(width - 32 + 1e-6)
    }
    if (paged && width === 320) expect(result.layout.pages.length).toBeGreaterThan(1)
    const { root } = render(document, { width, paged })
    expect([...root.querySelectorAll('text[data-m3n-role="lyric"]')].map(node => node.textContent).join('')).toBe('春天花开')
  })

  it('merges nested and adjacent instrumental markings without bracketing unmarked instrumental music or merged legato', () => {
    const source = '{4/4}\nN: {inst}1 {inst}2{/inst} 3{/inst} {inst}4{/inst} | {lg}5 6{/lg} {lg}7 1e{/lg} |||'
    const document = parseM3NDocument(source)
    const projection = projectNumberedScore(document, options)
    const bindings = [...projection.bindings.values()]
    expect(projection.source.match(/@paren\(/g)).toHaveLength(1)
    expect(projection.source).toContain(`@paren(${bindings[0]!.label},${bindings[3]!.label})`)
    expect(projectNumberedScore(parseM3NDocument('N: 1 2 3 4 |'), options).source).not.toContain('@paren(')
    expect(geometry(document).diagnostics).toEqual([])
  })

  it('retains empty lyric slots and playback pass metadata across repeat verses', () => {
    const { root } = render('{2/4}\nN: ||: 1 2 | 3 4 :|||\nL1: 春天\nL2: 花开满园')
    expect(root.querySelector('text[data-m3n-id="m3n-e-3"][data-m3n-rendition="1"]')).not.toBeNull()
    expect(lyrics(root, 'm3n-e-3', 1)).toBe('')
    expect(lyrics(root, 'm3n-e-3', 2)).toBe('满')
    expect(root.querySelector('text[data-m3n-rendition="2"]')?.getAttribute('data-m3n-passes')).toContain('2')
  })

  it.each([320, 600, 800, 1000].flatMap(width => [false, true].map(paged => ({ width, paged }))))('collapses empty chorus rows in the Internationale at width $width, paged=$paged', ({ width, paged }) => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/the_internationale_01.m3n'), 'utf8')
    const { root } = render(source, { width, paged })
    const chorusSystems = [...root.querySelectorAll('g.system')].filter(system => {
      const rows = [...system.querySelectorAll('text[data-m3n-role="lyric"]')]
      return rows.some(node => node.getAttribute('data-m3n-rendition') === '1' && node.textContent?.replaceAll('\u200B', '').trim())
        && rows.filter(node => node.getAttribute('data-m3n-rendition') !== '1').every(node => !node.textContent?.replaceAll('\u200B', '').trim())
    })
    expect(chorusSystems.length).toBeGreaterThan(1)
    for (const system of chorusSystems) {
      const rows = [...system.querySelectorAll('text[data-m3n-role="lyric"]')]
      expect(new Set(rows.map(node => Number(node.getAttribute('y')))).size).toBe(1)
      for (const row of rows.filter(node => node.getAttribute('data-m3n-rendition') !== '1')) {
        expect(row.getAttribute('data-m3n-passes')).toBe(row.getAttribute('data-m3n-rendition'))
      }
    }
    const projection = projectNumberedScore(parseM3NDocument(source), { width, paged })
    const compact = compileScore(projection.source, { autoWrap: true, alignRelations: true })
    const original = compileScore(projection.source.replaceAll(',compactlyrics=true', ''), { autoWrap: true, alignRelations: true })
    if (!paged) expect(compact.layout.bounds.h).toBeLessThan(original.layout.bounds.h)
    else expect(compact.layout.pages.length).toBeLessThanOrEqual(original.layout.pages.length)
  })

  it.each([320, 600, 800, 1000].flatMap(width => [false, true].map(paged => ({ width, paged }))))('labels each continuous ANDY passage once at width $width, paged=$paged', ({ width, paged }) => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/andy_01.m3n'), 'utf8')
    const { root, score } = render(source, { width, paged })
    expect(score.diagnostics.filter(item => item.severity === 'error')).toEqual([])
    const allPrefixes = [...root.querySelectorAll('text[data-m3n-role="lyric-prefix"]')]
    expect(allPrefixes.map(node => [node.textContent, lyrics(root, node.getAttribute('data-m3n-id')!, Number(node.getAttribute('data-m3n-rendition')))])).toEqual([
      ['1.', '多'], ['2.4.', '我'], ['3.', '真'], ['2.4.', '几'],
    ])
    for (const syllable of ['希', '暂', '躁']) {
      const lyric = [...root.querySelectorAll('text[data-m3n-role="lyric"]')].find(node => node.textContent === syllable)!
      expect(lyric.getAttribute('data-m3n-passes')).toBe('2-4')
    }
    const shared = allPrefixes.find(node => node.textContent === '2.4.')!
    expect(shared).toBeDefined()
    const eventId = shared.getAttribute('data-m3n-id')!
    const prefixes = [...root.querySelectorAll(`text[data-m3n-role="lyric-prefix"][data-m3n-id="${eventId}"]`)]
    expect(prefixes.map(node => node.textContent)).toEqual(['1.', '2.4.', '3.'])
    const syllables = [1, 2, 3].map(row => root.querySelector(`text[data-m3n-role="lyric"][data-m3n-id="${eventId}"][data-m3n-rendition="${row}"]`)!)
    expect(syllables.map(node => node.textContent)).toEqual(['多', '我', '真'])
    expect(new Set(syllables.map(node => node.getAttribute('x'))).size).toBe(1)
    expect(shared.getAttribute('data-m3n-passes')).toBe('2-4')
    for (const [index, prefix] of prefixes.entries()) {
      expect(Number(prefix.getAttribute('x'))).toBeLessThan(Number(syllables[index]!.getAttribute('x')))
      expect(prefix.getAttribute('y')).toBe(syllables[index]!.getAttribute('y'))
    }
  })

  it('attaches verse labels to the first visible syllable after skipped slots', () => {
    const { root } = render('{2/4}\nN: 1 2 :|||{x3}\nL1: %甲\nL2: (乙丙)丁\nL3: {L2}\n---\nN: 3 4 |||\nL: 戊己')
    const prefixes = [...root.querySelectorAll('text[data-m3n-role="lyric-prefix"]')]
    expect(prefixes.map(node => [node.textContent, node.getAttribute('data-m3n-id')])).toEqual([
      ['1.', 'm3n-e-2'], ['2.3.', 'm3n-e-1'],
    ])
    expect(lyrics(root, 'm3n-e-1', 2)).toBe('乙丙')
    expect(root.querySelector('text[data-m3n-role="lyric-prefix"][data-m3n-underlined]')).toBeNull()
    expect(root.querySelector('text[data-m3n-id="m3n-e-3"][data-m3n-role="lyric-prefix"]')).toBeNull()
  })

  it('carries a pending verse label across a phrase containing only skipped slots', () => {
    const { root } = render('{2/4}\nN: ||: 1 2 |\nL1: %%\nL2: 甲乙\nL3: {L2}\n---\nN: 3 4 :|||{x3}\nL1: 丙丁\nL2: 戊己\nL3: {L2}')
    const prefixes = [...root.querySelectorAll('text[data-m3n-role="lyric-prefix"]')]
    expect(prefixes.map(node => [node.textContent, node.getAttribute('data-m3n-id')])).toEqual([
      ['2.3.', 'm3n-e-1'], ['1.', 'm3n-e-3'],
    ])
  })

  it.each([
    ['changed verse grouping', '---\nN: 3 4 |\nL1: 庚辛\nL2: {L1}\nL3: 壬癸\n---', ''],
    ['music without lyrics', '---\nN: 3 4 |\n---', ''],
    ['instrumental music', '---\nN: {inst}3 4{/} |\n---', ''],
    ['whole-bar rests', '---\nN: {rest=2} |\n---', ''],
    ['a new section', '===新段', ''],
    ['a new repeat', '---', '||:'],
  ])('restarts verse labels after %s', (_reason, boundary, opening) => {
    const { root } = render(`{2/4}\nN: 1 2 |\nL1: 甲乙\nL2: 丙丁\nL3: {L2}\n${boundary}\nN: ${opening} 5 6 :|||{x3}\nL1: 戊己\nL2: 子丑\nL3: {L2}`)
    const prefixes = [...root.querySelectorAll('text[data-m3n-role="lyric-prefix"]')]
    expect(prefixes.filter(node => node.textContent === '2.3.').map(node => lyrics(root, node.getAttribute('data-m3n-id')!, 2))).toEqual(['丙', '子'])
  })

  it('retains repeat boundaries, navigation and volta numbers without phantom measures', () => {
    const { root } = render('{2/4}\nN: ||: {segno}1 2 |\n---V1\nN: 3 4 :||\n---V2\nN: 5 6 {fine} |||')
    expect(root.querySelectorAll('g.measure')).toHaveLength(3)
    expect(root.body.textContent).toContain('1.')
    expect(root.body.textContent).toContain('2.')
    expect(root.body.textContent).toContain('Fine')
  })

  it.each([
    ['opening repeat', '||: {segno}1 2 :|| 3 4 {ds} |||', 0],
    ['mid-score with controls', '1 2 | {key=G}{3/4}{80qpm}{segno} 3 4 5 | 6 7 1e {ds} |||', 2],
    ['explicit break and tuplet', '1 2 | {br}{segno}[345:2] | 6 7 {ds} |||', 2],
    ['navigation written after the notes', '1 2 | 3 4 {segno} | 5 6 {ds} |||', 2],
    ['whole-measure rests', '1 2 | {segno}{rest=2} | 3 4 {ds} |||', 2],
  ])('renders the Segno destination at the measure opening: %s', (_name, music, targetBeat) => {
    const source = `{2/4}\nN: ${music}`
    const document = parseM3NDocument(source)
    for (const width of [320, 600, 800, 1000]) for (const paged of [false, true]) {
      const { layout, lowering } = geometry(document, { width, paged })
      const symbols = [...lowering.astToTemporal.values()].flat().filter(node => node.ast instanceof ASTFunctionNode
        && (node.ast as ASTFunctionNode & { definition?: { name: string } }).definition?.name === 'segno')
      expect(symbols).toHaveLength(1)
      const symbol = symbols[0]!
      expect(isVisualTemporalNode(symbol)).toBe(true)
      if (!isVisualTemporalNode(symbol)) continue
      const first = layout.objects.find(node => !node.T.isZero() && node.t.equals(targetBeat))!
      expect(symbol.t.toNumber()).toBe(targetBeat)
      expect(symbol.layoutLine).toBe(first.layoutLine)
      expect(symbol.box.y + symbol.box.visualAxis).toBeCloseTo(first.box.y + first.box.visualAxis)
      expect(symbol.box.x + symbol.box.w).toBeLessThan(first.box.x)
      expect(symbol.box.w).toBeGreaterThan(0)
      expect(symbol.box.h).toBeGreaterThan(0)
      const { root } = render(document, { width, paged })
      const plain = render(source.replace('{segno}', ''), { width, paged })
      expect(root.querySelectorAll('path').length).toBe(plain.root.querySelectorAll('path').length + 1)
    }
  })

  it.each(['fine', 'dc', 'ds'])('places %s before the closing bar on the music axis without raising its volta', name => {
    const source = `{2/4}\nN: ||: {segno}1 2 |\n---V1\nN: 3 4 {${name}} :||\n---V2\nN: 5 6 |||`
    const { layout, lowering } = geometry(parseM3NDocument(source))
    const symbol = [...lowering.astToTemporal.values()].flat().find(node => node.ast instanceof ASTFunctionNode
      && (node.ast as ASTFunctionNode & { definition?: { name: string } }).definition?.name === name)!
    expect(isVisualTemporalNode(symbol)).toBe(true)
    if (!isVisualTemporalNode(symbol)) return
    const lastNote = layout.objects.filter(node => !node.T.isZero())[3]!
    const bar = symbol.foldedInto as VisualTemporalNode
    expect(symbol.box.y + symbol.box.visualAxis).toBeCloseTo(lastNote.box.y + lastNote.box.visualAxis)
    expect(symbol.box.x).toBeGreaterThan(lastNote.box.x + lastNote.box.w)
    expect(symbol.box.x + symbol.box.w).toBeLessThan(bar.box.x + bar.box.anchor)
    const projection = projectNumberedScore(parseM3NDocument(source), options)
    const house = layout.attachments.find(attachment => attachment.sourceSpan
      && projection.source.slice(attachment.sourceSpan.start).startsWith('@volta('))!
    const plain = geometry(parseM3NDocument(source.replace(`{${name}}`, '')))
    const plainProjection = projectNumberedScore(parseM3NDocument(source.replace(`{${name}}`, '')), options)
    const plainHouse = plain.layout.attachments.find(attachment => attachment.sourceSpan
      && plainProjection.source.slice(attachment.sourceSpan.start).startsWith('@volta('))!
    const plainNote = plain.layout.objects.filter(node => !node.T.isZero())[3]!
    expect(lastNote.box.y + lastNote.box.visualAxis - house.box.y)
      .toBeCloseTo(plainNote.box.y + plainNote.box.visualAxis - plainHouse.box.y)
  })

  it.each([320, 600, 800, 1000])('keeps Second Waltz navigation inline through wrapping and pagination at width %s', width => {
    const document = parseM3NDocument(readFileSync(resolve(process.cwd(), '../../src/scores/second_waltz_01.m3n'), 'utf8'))
    for (const paged of [false, true]) {
      const { layout, lowering } = geometry(document, { width, paged })
      const symbols = [...lowering.astToTemporal.values()].flat().filter(node => node.ast instanceof ASTFunctionNode
        && ['fine', 'dc'].includes((node.ast as ASTFunctionNode & { definition?: { name: string } }).definition?.name ?? ''))
      expect(symbols).toHaveLength(2)
      for (const symbol of symbols) {
        expect(isVisualTemporalNode(symbol)).toBe(true)
        if (!isVisualTemporalNode(symbol)) continue
        const bar = symbol.foldedInto as VisualTemporalNode
        const previous = layout.objects.filter(node => node.track === bar.track && !node.T.isZero() && node.t.compare(bar.t) < 0).at(-1)!
        expect(symbol.layoutLine).toBe(previous.layoutLine)
        expect(symbol.box.y + symbol.box.visualAxis).toBeCloseTo(previous.box.y + previous.box.visualAxis)
        expect(symbol.box.x).toBeGreaterThan(previous.box.x + previous.box.w)
        expect(symbol.box.x + symbol.box.w).toBeLessThan(bar.box.x + bar.box.anchor)
        expect(bar.box.h).toBeCloseTo((bar.ast as ASTFunctionNode & { size: number }).size)
      }
    }
  })

  it.each([320, 600, 800, 1000])('clears the final D.S. below Andy’s last volta at width %s', width => {
    const document = parseM3NDocument(readFileSync(resolve(process.cwd(), '../../src/scores/andy_01.m3n'), 'utf8'))
    for (const paged of [false, true]) {
      const projection = projectNumberedScore(document, { width, paged })
      const { layout } = compileScore(projection.source, { autoWrap: true })
      const house = layout.attachments.filter(attachment => attachment.sourceSpan
        && projection.source.slice(attachment.sourceSpan.start).startsWith('@volta(')).at(-1)!
      const bar = layout.objects.at(-1)!
      expect(projection.source.slice(bar.ast.sourceSpan.start, bar.ast.sourceSpan.end)).toContain('@symbol(ds,')
      const end = house.regions.at(-1)!
      expect(end.line).toBe(bar.layoutLine)
      expect(end.y + end.h).toBeLessThan(bar.box.y)
    }
  })

  it.each([320, 800])('renders an internal opening repeat once, with its following measure at width %s', width => {
    const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 | {br} ||: 5 6 7 1e :|||\nB: 1d 2d 3d 4d | 5d 6d 7d 1 :|||')
    const result = geometry(document, { width, paged: false })
    const repeats = result.layout.objects.filter(node => (node.ast as { callName?: string; type?: number }).callName === 'bar' && (node.ast as { type?: number }).type === 3)
    expect(repeats).toHaveLength(2) // One per staff, sharing the same musical boundary.
    for (const repeat of repeats) {
      const next = result.layout.objects.find(node => node.track === repeat.track && node.t.equals(repeat.t) && !node.T.isZero())!
      expect(repeat.layoutLine).toBe(next.layoutLine)
      expect(repeat.box.x).toBeLessThan(next.box.x)
    }
  })

  it.each([320, 600, 800, 1000].flatMap(width => ['|', '||'].map(boundary => ({ width, boundary }))))('keeps opening repeats with their measure after $boundary at width $width', ({ width, boundary }) => {
    const source = '{4/4}\nN: ' + Array(4).fill('1 2 3 4 |').join(' ') + ` 5 6 7 1e ${boundary} ||: 1 2 3 4 | 5 6 7 1e :|||`
    const document = parseM3NDocument(source)
    const melody = [...document.parts.values()][0]!.melody
    const opening = melody.findIndex(measure => measure.left === 'rptstart')
    expect(melody[opening - 1]!.right).toBe(boundary === '||' ? 'dbl' : 'single')
    const time = melody.slice(0, opening).flatMap(measure => measure.events).reduce((sum, event) => sum + event.beats, 0)
    for (const paged of [false, true]) {
      const result = geometry(document, { width, paged })
      const bars = result.layout.objects.filter(node => (node.ast as { callName?: string }).callName === 'bar' && node.t.equals(time))
      const next = result.layout.objects.find(node => node.t.equals(time) && !node.T.isZero())!
      const opening = bars.filter(bar => (bar.ast as { type?: number }).type === 3)
      expect(opening).toHaveLength(1)
      expect(opening[0]!.layoutLine).toBe(next.layoutLine)
      const previous = result.layout.objects.filter(node => node.t.compare(time) < 0 && !node.T.isZero()).at(-1)!
      expect(bars).toHaveLength(previous.layoutLine === next.layoutLine ? 1 : 2)
    }
  })

  it('closes both staves before an explicit break and opens their repeats on the next system', () => {
    const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 || {br} ||: 5 6 7 1e :|||\nB: 1d 2d 3d 4d || 5d 6d 7d 1 :|||')
    const result = geometry(document)
    const bars = result.layout.objects.filter(node => (node.ast as { callName?: string }).callName === 'bar' && node.t.equals(4))
    expect(bars).toHaveLength(4)
    const closing = bars.filter(bar => (bar.ast as { type?: number }).type === 1)
    const opening = bars.filter(bar => (bar.ast as { type?: number }).type === 3)
    expect(closing).toHaveLength(2)
    expect(opening).toHaveLength(2)
    for (const bar of opening) {
      const next = result.layout.objects.find(node => node.track === bar.track && node.t.equals(4) && !node.T.isZero())!
      expect(bar.layoutLine).toBe(next.layoutLine)
      expect(closing.find(close => close.track === bar.track)!.layoutLine).toBe(bar.layoutLine - 1)
    }
    for (const pair of [closing, opening]) expect(pair[0]!.box.x + pair[0]!.box.anchor).toBeCloseTo(pair[1]!.box.x + pair[1]!.box.anchor)
  })

  it.each([320, 600, 800, 1000])('keeps Mario section repeats and beat groups legible at width %s', width => {
    const document = parseM3NDocument(readFileSync(resolve(process.cwd(), '../../src/scores/super_mario_01.m3n'), 'utf8'))
    const melody = [...document.parts.values()][0]!.melody
    for (const paged of [false, true]) {
      const result = geometry(document, { width, paged })
      let time = 0
      for (const measure of melody) {
        if (measure.left === 'rptstart') {
          const first = result.layout.objects.find(node => node.t.equals(time) && !node.T.isZero())!
          const repeat = result.layout.objects.find(node => node.t.equals(time) && [3, 5].includes((node.ast as { type?: number }).type ?? -1))
          expect(repeat, `missing opening repeat at beat ${time}`).toBeDefined()
          expect(repeat!.layoutLine).toBe(first.layoutLine)
        }
        time += measure.events.reduce((sum, event) => sum + event.beats, 0)
      }
      const notes = result.layout.objects.filter(node => !node.T.isZero())
      const starts = notes.filter((node, index) => index === 0 || node.layoutLine !== notes[index - 1]!.layoutLine)
      for (const start of starts) expect(start.t.denominator, `split beat at ${start.t}`).toBe(1)
      for (const boundary of [4, 44, 84]) {
        const previous = notes.filter(node => node.t.compare(boundary) < 0).at(-1)!
        const next = notes.find(node => node.t.equals(boundary))!
        const closing = result.layout.objects.find(node => node.t.equals(boundary) && (node.ast as { type?: number }).type === 0)
        if (previous.layoutLine !== next.layoutLine) expect(closing, `missing preceding bar at beat ${boundary}`).toBeDefined()
        else expect(closing).toBeUndefined()
      }
    }
  })

  it('fits Mario’s introduction and complete A section on a wide first system', () => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/super_mario_01.m3n'), 'utf8')
    const { root } = render(source, { width: 1000 })
    const measures = [...root.querySelector('g.system')!.querySelectorAll('g.note')].map(node => node.getAttribute('data-m3n-measure'))
    expect([...new Set(measures)]).toEqual(['m3n-measure-1-1', 'm3n-measure-1-2', 'm3n-measure-1-3'])
    for (const label of ['P', 'A']) expect(root.querySelector('g.system')!.textContent).toContain(label)
  })

  it('allows named sections to share a system in both staves while honoring an explicit break', () => {
    const source = '{4/4}\n===甲\nN: 1 2 3 4 |\nB: 1d^ 5d^ |\n===乙\nN: 5 6 7 1e |\nB: 4d^ 5d^ |\n===丙\nN: {br} 4 3 2 1 |||\nB: 5d^ 1d^ |||'
    const { layout } = geometry(parseM3NDocument(source), { width: 1000, paged: false })
    const before = layout.objects.filter(node => !node.T.isZero() && node.t.compare(8) < 0)
    const after = layout.objects.filter(node => !node.T.isZero() && node.t.compare(8) >= 0)
    expect(new Set(before.map(node => node.layoutLine)).size).toBe(1)
    expect(new Set(before.map(node => node.track)).size).toBe(2)
    expect(new Set(after.map(node => node.layoutLine)).size).toBe(1)
    expect(after[0]!.layoutLine).toBe(before[0]!.layoutLine + 1)
  })

  it('keeps first-verse L: after explicit numbered lyric rows', () => {
    const { root } = render('{2/4}\nN: ||: 1 2 | 3 4 :||\nL1: 春天来了\nL2: 花开满园\n---\nN: 5 6 |||\nL: 你好')
    expect(lyrics(root, 'm3n-e-5', 1)).toBe('你')
  })

  it('respects named sections and explicit breaks while reflowing with width', () => {
    const source = '{4/4}\n===甲\nN: ' + Array(12).fill('1 2 3 4 |').join(' ') + '{br} 5 6 7 1e |\n===乙\nN: 1 2 3 4 |||'
    const narrow = render(source, { width: 320 }), wide = render(source, { width: 1000 })
    expect(narrow.root.querySelectorAll('g.system').length).toBeGreaterThan(wide.root.querySelectorAll('g.system').length)
    expect(wide.root.querySelectorAll('g.system').length).toBeGreaterThanOrEqual(3)
    expect(wide.root.querySelectorAll('#m3n-e-49')).toHaveLength(1)
  })

  it('paginates complete systems and keeps every final lyric inside the page', () => {
    const source = '{4/4}\nN: ' + Array(60).fill('1 2 3 4 |').join(' ') + '\nL: ' + '春天花开'.repeat(60) + '\nL2: ' + '满园花香'.repeat(60)
    const { pages, root } = render(source, { width: 600, paged: true })
    expect(pages.length).toBeGreaterThan(1)
    expect(root.querySelectorAll('g.note')).toHaveLength(240)
    for (const svg of root.querySelectorAll('svg')) {
      const [x, y, width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number)
      expect(x).toBe(0); expect(width).toBe(600)
      for (const lyric of svg.querySelectorAll('text[data-m3n-role="lyric"]')) expect(Number(lyric.getAttribute('y'))).toBeLessThan(y! + height! - 20)
    }
  })

  it('preserves header credit priority and rejects invalid widths', () => {
    const { root } = render('{title=曲名} {singer=演唱者} {composer=作曲者} {4/4}\nN: 1 2 3 4 |||')
    expect(root.body.textContent).toContain('演唱者')
    expect(root.body.textContent).not.toContain('作曲者')
    expect(() => render('{4/4}\nN: 1 2 3 4 |||', { width: NaN })).toThrow()
  })

  it('uses the embedded number font for both header and in-score tempos', () => {
    const { root } = render('{96qpm} {4/4}\nN: 1 2 3 4 | {120qpm} 5 6 7 1e |||')
    const tempos = [...root.querySelectorAll('text')].filter(text => /^= (96|120)$/.test(text.textContent ?? ''))
    expect(new Set(tempos.map(text => text.textContent))).toEqual(new Set(['= 96', '= 120']))
    expect(tempos).toHaveLength(2)
    for (const tempo of tempos) expect(tempo.getAttribute('font-family')).toBe('M3N Numbers')
  })

  it.each([
    ['新不了情', '电影《新不了情》主题曲'],
    ['很长很长的主标题', '短副标题'],
  ])('centers title and subtitle independently: %s', (title, subtitle) => {
    const source = `{title=${title}} {subtitle=${subtitle}} {singer=演唱者} {key=D} {90qpm} {4/4}\nN: 1 2 3 4 |||`
    for (const width of [320, 600, 800, 1000]) for (const paged of [false, true]) {
      const result = geometry(parseM3NDocument(source), { width, paged })
      const headings = result.layout.objects.filter(node => node.ast instanceof ASTFunctionNode
        && node.ast.callName === 'text' && 'lines' in node.ast
        && [title, subtitle].includes((node.ast.lines as string[])[0]!))
      expect(headings).toHaveLength(2)
      for (const heading of headings) expect(Math.abs(heading.box.x + heading.box.w / 2 - width / 2)).toBeLessThan(0.05)
      expect(headings[0]!.box.y + headings[0]!.box.h).toBeLessThan(headings[1]!.box.y)
      const controls = result.layout.objects.filter(node => node.ast instanceof ASTFunctionNode
        && ['key', 'meter', 'tempo'].includes(node.ast.callName))
      expect(controls).toHaveLength(3)
      for (const control of controls) expect(control.box.y).toBeGreaterThan(headings[1]!.box.y + headings[1]!.box.h)
    }
  })

  it('renders single-event hairpins and merges consecutive legato ranges', () => {
    const single = render('{4/4}\nN: {cresc}1{/} 2 3 4 |||')
    expect(single.score.diagnostics.filter(d => d.severity === 'error')).toEqual([])
    expect(geometry(single.document).layout.attachments.length).toBeGreaterThan(0)
    const merged = geometry(parseM3NDocument('{4/4}\nN: {lg}1 2{/} {lg}3 4{/} |||'))
    const whole = geometry(parseM3NDocument('{4/4}\nN: {lg}1 2 3 4{/} |||'))
    expect(merged.layout.attachments.length).toBe(whole.layout.attachments.length)
  })

  it('reports unsupported marks instead of silently discarding them', () => {
    const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 |||')
    document.parts.values().next().value!.melody[0]!.events[0]!.postfixes.push('unknown')
    expect(render(document).score.diagnostics.some(item => item.code === 'NUMBERED_UNSUPPORTED_MARK')).toBe(true)
  })

  it.each(corpusFiles)('preserves musical content, timing and layout for %s', file => {
      const source = readFileSync(resolve(process.cwd(), '../../src/scores', file), 'utf8')
      const document = parseM3NDocument(source)
      const score = NumberedNotationScore.create(document)
      const expectedDuration = [...document.parts.values()].reduce((sum, part) => sum + Math.max(...[part.melody, part.bass].map(measures => measures.reduce((sum, measure) => sum + (measure.multiRest ?? 0) * document.meterCount * 4 / document.meterUnit + measure.events.reduce((sum, event) => sum + event.beats, 0), 0))), 0)
      expect(geometry(document).lowering.duration.toNumber(), file).toBeCloseTo(expectedDuration)
      for (const settings of [{ width: 800, paged: false }, { width: 320, paged: true }]) {
        const projection = projectNumberedScore(document, settings)
        const result = geometry(document, settings)
        const expectedSegnos = [...document.parts.values()].flatMap(part => [...part.melody, ...part.bass])
          .filter(measure => measure.navigation?.includes('segno') || measure.events.some(event => event.navigation.includes('segno'))).length
        const segnos = result.layout.objects.filter(node => node.ast instanceof ASTFunctionNode
          && (node.ast as ASTFunctionNode & { definition?: { name: string } }).definition?.name === 'segno')
        expect(segnos, `${file}: missing Segno destination`).toHaveLength(expectedSegnos)
        const nodes = new Map<string, VisualTemporalNode>()
        for (const node of result.layout.objects) {
          const selected = node.ast instanceof ASTFunctionNode ? node.ast.labelable?.() : null
          if (selected?.label) nodes.set(selected.label, node)
          for (let ast = node.ast; ast; ast = ast.parent!) {
            if (ast instanceof ASTFunctionNode && ast.label) nodes.set(ast.label, node)
          }
          if (node.ast instanceof ASTFunctionNode && (['key', 'meter', 'tempo', 'bar'].includes(node.ast.callName) || segnos.includes(node))) {
            if (node.ast.callName === 'bar' && (node.ast as { type?: number }).type !== 3) continue
            const next = result.layout.objects.find(next => next.track === node.track && next.t.equals(node.t) && !next.T.isZero())
            if (next) expect(node.layoutLine, `${file}: orphaned ${node.ast.callName}`).toBe(next.layoutLine)
            if (next && segnos.includes(node)) {
              expect(node.box.y + node.box.visualAxis).toBeCloseTo(next.box.y + next.box.visualAxis)
              expect(node.box.x + node.box.w).toBeLessThan(next.box.x)
            }
          }
        }
        let partTime = 0
        for (const part of document.parts.values()) {
          const ends = []
          for (const staff of ['melody', 'bass'] as const) {
            let time = partTime
            for (const measure of part[staff]) {
              time += (measure.multiRest ?? 0) * document.meterCount * 4 / document.meterUnit
              for (const event of measure.events) {
                const bindings = [...projection.bindings.values()].filter(binding => binding.event === event)
                const native = bindings.map(binding => nodes.get(binding.label)!)
                expect(native.every(Boolean), `${file}: missing event at ${event.sourceStart}`).toBe(true)
                expect(native[0]!.t.toNumber(), `${file}: shifted ${staff} event`).toBeCloseTo(time)
                expect(native.reduce((sum, node) => sum + node.T.toNumber(), 0), `${file}: wrong event duration`).toBeCloseTo(event.beats)
                const inherited = bindings[0]!.sustain ? result.layout.objects.filter(node => node.track === native[0]!.track
                  && node.t.compare(native[0]!.t) < 0 && mainPitches(node).some(pitch => pitch.name !== '0')).at(-1) : undefined
                if (bindings[0]!.sustain) {
                  expect(inherited, `${file}: sustain without a pitched head`).toBeDefined()
                  expect(mainPitches(native[0]!)).toEqual([])
                }
                const pitched = event.kind === 'tuplet' ? native.flatMap(mainPitches) : mainPitches(inherited ?? native[0]!)
                expect(pitched, `${file}: changed pitches at ${event.sourceStart}`).toEqual((event.kind === 'rest' ? ['0'] : event.pitches).map(pitch => {
                  const [, name, acc = '', octaves = ''] = /^([0-7])([#b=]*)([ed]*)$/.exec(pitch)!
                  return { name, acc: name === '0' ? '' : acc.replaceAll('=', 'n'), octave: name === '0' ? 0 : [...octaves].reduce((n, c) => n + (c === 'e' ? 1 : -1), event.octaveShift) }
                }))
                time += event.beats
              }
            }
            ends.push(time)
          }
          partTime = Math.max(...ends)
        }
        const pages = score.render(settings)
        const markup = pages.join('')
        expect(pages.length, file).toBeGreaterThan(0)
        expect(markup, file).not.toMatch(/(?:NaN|Infinity)/)
        for (const id of scoreEventIds(document).values()) expect(markup, `${file}: ${id}`).toContain(`data-m3n-id="${id}"`)
        const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map(match => match[1])
        expect(new Set(ids).size, file).toBe(ids.length)
        expect(score.diagnostics.filter(item => item.code.startsWith('NUMBERED_')), file).toEqual([])
      }
  }, 30000)
})
