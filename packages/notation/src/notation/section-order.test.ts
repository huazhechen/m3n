import { describe, expect, it } from 'vitest'
import { analyzeM3N } from './analysis.js'
import { measurePlaybackPasses } from './repeats.js'
import { compileScorePerformance } from '../performance.js'
import { formatM3N } from '../m3n-format.js'

const source='{title=乐段顺序}{2/4}{order=A,A,B,A,C1,B,A,C2}\n===A\nN: 1 2 ||\nL1: 甲乙\nL2: 丙丁\nL3: 戊己\nL4: 庚辛\n===B\nN: 3 4 ||\nL: 副歌\n===C1\nN: 5 6 ||\n===C2\nN: 7 1e |||'

describe('explicit section order',()=>{
 it('stores each section once and plays the requested visit order',()=>{
  const result=analyzeM3N(source)
  expect(result.diagnostics).toEqual([])
  expect(result.score.order).toEqual(['A','A','B','A','C1','B','A','C2'])
  expect(result.score.parts.get('score')!.melody.filter(m=>m.events.length)).toHaveLength(4)
  expect(compileScorePerformance(result.score).notes.map(note=>note.pitch)).toEqual([60,62,60,62,64,65,60,62,67,69,64,65,60,62,71,72])
  const measures=result.score.parts.get('score')!.melody.filter(m=>m.events.length)
  const passes=measurePlaybackPasses(measures)
  expect(measures.map(m=>[...passes.get(m)!])).toEqual([[1,2,3,4],[1,2],[1],[1]])
  const first=measures[0]!.events[0]!
  expect(result.interaction.lyricsByEvent.get(first)!.map(l=>l.text)).toEqual(['甲','丙','戊','庚'])

 })

 it('keeps order through formatting',()=>{
  const formatted=formatM3N(source)
  expect(analyzeM3N(formatted).score.order).toEqual(analyzeM3N(source).score.order)
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
  expect(compileScorePerformance(result.score).notes.filter(note => note.channel === 1).map(note => note.pitch)).toEqual([48,50,52,53,48,50])
 })

 it('counts local paired repeats inside each named visit, including complementary pickups', () => {
  const result = analyzeM3N('{2/4}{order=A,B,A}\n===A\nN: ||: 1 | 2 3 | 4 :||\n===B\nN: 5 6 |||')
  expect(result.diagnostics).toEqual([])
  expect(result.score.parts.get('score')!.melody.filter(m => m.events.length).map(m => m.orderPasses)).toEqual([[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4], [1]])
  expect(compileScorePerformance(result.score).notes.map(note=>note.pitch)).toEqual([60,62,64,65,60,62,64,65,67,69,60,62,64,65,60,62,64,65])
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
  expect(compileScorePerformance(result.score).notes.map(note=>note.pitch)).toEqual([60,62,60,62,64,65])
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
 expect(compileScorePerformance(result.score).notes.map(note=>note.pitch))
  .toEqual([60,62,64,65,60,62,64,67,69,71,60,62,64,65,60,62,64,67])
})

it('rejects a house whose repeat starts in another named section', () => {
 const result=analyzeM3N('{2/4}{order=A,B}\n===A\nN: ||: 1 2 |\n===B\n---V1\nN: 3 4 :||\n---V2\nN: 5 6 |||')
 expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'M3N_SECTION_ORDER',message:expect.stringContaining('同一乐段')}))
})

it('selects trailing houses by section visit without replaying the common melody locally', () => {
 const result=analyzeM3N('{2/4}{order=A,B,A,A}\n===A\nN: 1 2 |\nL: 甲乙\n---V1,V3\nN: 3 4 ||\nL: 丙丁\n---V2\nN: 5 6 ||\nL: 戊己\n===B\nN: 7 1e |||')
 expect(result.diagnostics).toEqual([])
 expect(result.score.parts.get('score')!.melody.filter(m=>m.events.length).map(m=>m.orderPasses)).toEqual([[1,2,3],[1,3],[2],[1]])
 expect(compileScorePerformance(result.score).notes.map(note=>note.pitch)).toEqual([60,62,64,65,71,72,60,62,67,69,60,62,64,65])
})

it.each([
 ['---V1', '---V2', '缺漏'],
 ['---V1,V2', '---V2,V3', '重叠'],
 ['---V1,V3,V4', '---V2', '超出'],
])('rejects invalid visit-ending coverage %s / %s', (first, second, message) => {
 const result=analyzeM3N(`{2/4}{order=A,A,A}\n===A\nN: 1 2 |\n${first}\nN: 3 4 ||\n${second}\nN: 5 6 |||`)
 expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'M3N_SECTION_ORDER',message:expect.stringContaining(message)}))
})

it('checks the pickup against every selected house and rejects an incomplete interior house bar', () => {
 const valid='{2/4}{order=A,A}\n===A\nN: 1 | 2 3 |\n---V1\nN: 4 ||\n---V2\nN: 5 |||'
 expect(analyzeM3N(valid).diagnostics).toEqual([])
 expect(analyzeM3N(valid.replace('N: 5 |||','N: (5) |||')).diagnostics).toContainEqual(expect.objectContaining({code:'M3N_SECTION_ORDER'}))
 expect(analyzeM3N(valid.replace('N: 4 ||','N: (4) | 5 ||')).diagnostics).toContainEqual(expect.objectContaining({code:'M3N_METER_INCOMPLETE_MIDDLE'}))
})
