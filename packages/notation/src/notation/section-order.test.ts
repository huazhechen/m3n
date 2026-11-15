import { describe, expect, it } from 'vitest'
import { analyzeM3N } from './analysis.js'
import { measurePlaybackPasses } from './repeats.js'
import { scoreHeaderLayout } from '../score-header-layout.js'
import { formatM3N } from '../m3n-format.js'

const source='{title=乐段顺序}{2/4}{order=A,A,B,A,C1,B,A,C2}\n===A\nN: 1 2 ||\nL1: 甲乙\nL2: 丙丁\nL3: 戊己\nL4: 庚辛\n===B\nN: 3 4 ||\nL: 副歌\n===C1\nN: 5 6 ||\n===C2\nN: 7 1e |||'

describe('explicit section order',()=>{
 it('prints each section once and emits a native playback expansion',()=>{
  const result=analyzeM3N(source)
  expect(result.diagnostics).toEqual([])
  expect(result.score.order).toEqual(['A','A','B','A','C1','B','A','C2'])
  expect(result.conversion.mei.match(/<measure\b/g)).toHaveLength(4)
  expect(result.conversion.mei).toContain('plist="#m3n-order-section-1 #m3n-order-section-1 #m3n-order-section-2 #m3n-order-section-1 #m3n-order-section-3 #m3n-order-section-2 #m3n-order-section-1 #m3n-order-section-4"')
  const measures=result.score.parts.get('score')!.melody.filter(m=>m.events.length)
  const passes=measurePlaybackPasses(measures)
  expect(measures.map(m=>[...passes.get(m)!])).toEqual([[1,2,3,4],[1,2],[1],[1]])
  const first=measures[0]!.events[0]!
  expect(result.interaction.lyricsByEvent.get(first)!.map(l=>l.text)).toEqual(['甲','丙','戊','庚'])
  expect(result.conversion.mei.match(/metNoteQuarterUp/g)).toHaveLength(1)
  const ids = [...result.conversion.mei.matchAll(/xml:id="([^"]+)"/g)].map(match => match[1])
  expect(new Set(ids).size).toBe(ids.length)
  expect(result.conversion.mei.match(/<keySig/g)).toHaveLength(1)
  expect(result.conversion.mei.match(/meter.count=/g)).toHaveLength(1)
  expect(result.conversion.mei).toMatch(/<tempo[^>]+midi.bpm="120"\/>/)
  expect(result.conversion.headerMetadata).toContainEqual(expect.objectContaining({kind:'order',value:'演奏顺序：A → A → B → A → C1 → B → A → C2'}))
 })

 it('keeps order through formatting and wraps its header within a narrow page',()=>{
  const formatted=formatM3N(source)
  expect(analyzeM3N(formatted).score.order).toEqual(analyzeM3N(source).score.order)
  const layout=scoreHeaderLayout(analyzeM3N(source).conversion.headerMetadata,320)
  const lines=layout.lines.filter(l=>l.value.startsWith('演奏顺序')||l.value.startsWith('→'))
  expect(lines.length).toBeGreaterThan(1)
  expect(layout.height).toBeGreaterThan(lines.at(-1)!.y)
 })

 it.each([
  ['{2/4}{order=A}\n===A\nN: {rest=2} |||','普通音符'],
  ['{2/4}{order=A,Z}\n===A\nN: 1 2 |||','未定义'],
  ['{2/4}{order=A}\n===A\nN: 1 2 ||\n===B\nN: 3 4 |||','未引用'],
  ['{2/4}{order=A}\n===A\nN: 1 2 ||\n===A\nN: 3 4 |||','重复'],
  ['{2/4}{order=A,,A}\n===A\nN: 1 2 |||','非空'],
  ['{2/4}{order=A}{order=A}\n===A\nN: 1 2 |||','重复声明'],
  ['{2/4}{order=A}\nN: 1 2 |||','必须有名称'],
  ['{2/4}\n===A\nN: {order=A}1 2 |||','文档首部'],
  ['{2/4}{order=A}\n===A\nN: 1 2 {dc} |||','不与 D.S.'],
  ['{2/4}{order=A,B}\n===A\nN: 1 |\n===B\nN: (2) |||','完整小节'],
  ['{2/4}{order=A,B}\n===A\nN: 1 2~ ||\n===B\nN: 2 1 |||','末尾不能延音'],
  ['{2/4}{order=A,B}\n===A\nN: {lg}1 2 ||\n===B\nN: 3 4{/} |||','不能跨越'],
 ])('diagnoses ambiguous or invalid orders: %s',(input,message)=>{
  expect(analyzeM3N(input).diagnostics).toContainEqual(expect.objectContaining({code:'M3N_SECTION_ORDER',message:expect.stringContaining(message),severity:'error'}))
 })

 it('assigns accompaniment and its visit counts to the same sections', () => {
  const result = analyzeM3N('{2/4}{order=A,B,A}\n===A\nN: 1 2 ||\nB: 1d 2d |\n===B\nN: 3 4 |||\nB: 3d 4d |')
  expect(result.diagnostics).toEqual([])
  expect(result.score.parts.get('score')!.bass.filter(m => m.events.length).map(m => [m.sectionName, m.orderPasses])).toEqual([['A', [1, 2]], ['B', [1]]])
  expect(result.conversion.mei.match(/<staff n="2"/g)).toHaveLength(2)
 })

 it('counts local paired repeats inside each named visit, including complementary pickups', () => {
  const result = analyzeM3N('{2/4}{order=A,B,A}\n===A\nN: ||: 1 | 2 3 | 4 :||\n===B\nN: 5 6 |||')
  expect(result.diagnostics).toEqual([])
  expect(result.score.parts.get('score')!.melody.filter(m => m.events.length).map(m => m.orderPasses)).toEqual([[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4], [1]])
  expect(result.conversion.mei).toContain('plist="#m3n-order-section-1 #m3n-order-section-1 #m3n-order-section-2 #m3n-order-section-1 #m3n-order-section-1"')
 })

 it('accepts complementary global pickups and checks every visit across section boundaries', () => {
  expect(analyzeM3N('{2/4}{order=Intro,A,A,Coda}\n===Intro\nN: (1) |\n===A\nN: 2 3 |\n===Coda\nN: 4. |||').diagnostics).toEqual([])
  const valid = '{3/8}{order=A,A1,A,A2}\n===A\nN: ((3e 2#e)) | ((3e 2#e 3e 7 2e 1e)) |\n===A1\nN: 6 |\n===A2\nN: 6 |||'
  expect(analyzeM3N(valid).diagnostics).toEqual([])
  expect(analyzeM3N('{4/4}{order=A,B,A,A,C}\n===A\nN: 1 | 2 3 4 5 |\n===B\nN: 6 7 1e |\n===C\nN: 2e 1e 7 |||').diagnostics).toEqual([])
  expect(analyzeM3N(valid.replace('A,A1,A,A2', 'A,A1,A1,A,A2')).diagnostics).toContainEqual(expect.objectContaining({code:'M3N_SECTION_ORDER'}))
 })

 it('keeps a heading line break out of the order name and preserves it through formatting', () => {
  const input = '{2/4}{order=A,B,A}\n===A{br}\nN: 1 2 |\n===B\nN: 3 4 |||'
  const result = analyzeM3N(input)
  expect(result.diagnostics).toEqual([])
  expect(result.score.parts.get('score')!.melody[0]!.events[0]).toMatchObject({sectionLabel:'A',sectionLabelBreakAfter:true})
  expect(analyzeM3N(formatM3N(input)).score.order).toEqual(['A','B','A'])
  expect(formatM3N(input)).toContain('===A{br}')
 })

 it('retains ordinary repeat behavior when order is absent',()=>{
  const result=analyzeM3N('{2/4}\n===A\nN: ||: 1 2 :||\n===B\nN: 3 4 |||')
  expect(result.diagnostics).toEqual([])
  expect(result.score.order).toBeUndefined()
  expect(result.conversion.mei).not.toContain('m3n-order-section')
 })
})

it('requires pickups to belong to a named section', () => {
 const result=analyzeM3N('{2/4}{order=A,A,B}\nN: (5d) |\n===A\nN: 1 2 ||\n===B\nN: 3. |||')
 expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'M3N_SECTION_ORDER',message:expect.stringContaining('弱起须写在所属乐段开头')}))
 expect(result.score.order).toEqual(['A','A','B'])
})

it('validates pickup complements against itinerary endpoints rather than printed endpoints', () => {
 const result=analyzeM3N('{3/8}{order=A,B,C,B}\n===A\nN: ((1 2)) | 3 (4) ||\n===B\nN: 5 ||\n===C\nN: (6) | 7 (1e) ||')
 expect(result.diagnostics).toEqual([])
})

it('resets local houses on every outer visit and preserves complementary pickups', () => {
 const result=analyzeM3N('{2/4}{order=A,B,A}\n===A\nN: ||: 1 | 2 3 |\n---V1\nN: 4 :||\n---V2\nN: 5 ||\n===B\nN: 6 7 |||')
 expect(result.diagnostics).toEqual([])
 expect(result.score.parts.get('score')!.melody.filter(m=>m.events.length).map(m=>m.orderPasses))
  .toEqual([[1,2,3,4],[1,2,3,4],[1,2],[1,2],[1]])
 // Playback is unfolded per named visit, with each house selected locally.
 expect([...result.conversion.mei.matchAll(/<note[^>]*pname="([^"]+)"/g)].map(m=>m[1]))
  .toEqual(['c','d','e','f','c','d','e','g','a','b','c','d','e','f','c','d','e','g'])
})

it('rejects a house whose repeat starts in another named section', () => {
 const result=analyzeM3N('{2/4}{order=A,B}\n===A\nN: ||: 1 2 |\n===B\n---V1\nN: 3 4 :||\n---V2\nN: 5 6 |||')
 expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'M3N_SECTION_ORDER',message:expect.stringContaining('同一乐段')}))
})
