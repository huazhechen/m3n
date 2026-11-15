import { describe,it,expect } from 'vitest'
import { analyzeM3N } from './analysis.js'
import { formatM3N } from '../m3n-format.js'
import { scoreEventIds } from '../score-event-ids.js'
const example='{2/4}\nN: ||: 1 2 | 3 4 :||\nL1: 甲乙 | 丙丁\nL2: 戊己 | 庚辛壬\nNs[2]: 2: (5 6) 7 |'
describe('alternative melodies',()=>{
 it('keeps main music written once, maps changed lyric counts and preserves source offsets through formatting and workers',()=>{
  for (const source of [example,example.replaceAll('\n','\r\n'),formatM3N(example)]) {
   const a=analyzeM3N(source)
   expect(a.diagnostics).toEqual([])
   expect(a.score.parts.get('score')!.melody.filter(m=>m.events.length)).toHaveLength(2)
   const alt=a.score.alternatives![0]!
   expect(alt.passes).toEqual([2]);expect(alt.measure.events.map(e=>e.beats)).toEqual([.5,.5,1])
   expect(alt.measure.events.map(event=>source.slice(event.sourceStart,event.sourceEnd))).toEqual(['5','6','7'])
   expect(alt.measure.events.map(event=>a.interaction.lyricsByEvent.get(event)?.map(l=>l.text).join(''))).toEqual(['庚','辛','壬'])
   expect(structuredClone(a.score).alternatives![0]!.host).toBeDefined()
   const mei=a.getMei()
   expect(mei).toContain('m3n-e-a1-1-rend2');expect(mei).not.toContain('<expansion')
   const ids=[...mei.matchAll(/xml:id="([^"]+)"/g)].map(m=>m[1]);expect(new Set(ids).size).toBe(ids.length)
   expect(a.interaction.sourceMap).toContainEqual(expect.objectContaining({xmlId:scoreEventIds(a.score).get(alt.measure.events[0]!),sourceStart:alt.measure.events[0]!.sourceStart}))
  }
 })
 it('supports instrumental section-order visits and inherited key, tempo and meter',()=>{
  const a=analyzeM3N('{key=G}{3/4}{80qpm}{order=A,B,A}\n===A\nN: 1 2 3 ||\nNs[2]: 1: 4 5 6 |\n===B\nN: 7^ 1e |||')
  expect(a.diagnostics).toEqual([])
  expect(a.score.alternatives![0]!.measure.events[0]).toMatchObject({key:'G',tempo:80,meterCount:3})
  expect(a.getMei()).toContain('m3n-e-a1-1-rend2')
 })
 it('keeps shared lyrics on all visits even when pass one uses alternative music',()=>{
  const a=analyzeM3N('{2/4}\nN: ||: 1 2 | 3 4 :||\nL: 甲乙 | 丙丁\nNs[1]: 2: 5 6 |')
  expect(a.diagnostics).toEqual([])
  const host=a.score.alternatives![0]!.host, alt=a.score.alternatives![0]!.measure
  expect(host.events.map(e=>a.interaction.lyricsByEvent.get(e)?.map(l=>l.text).join(''))).toEqual(['丙','丁'])
  expect(alt.events.map(e=>a.interaction.lyricsByEvent.get(e)?.map(l=>l.text).join(''))).toEqual(['丙','丁'])
 })
 it('inherits changed meter at the selected measure and supports consecutive replacement bars',()=>{
  const a=analyzeM3N('{2/4}\nN: ||: 1 2 | {3/4}3 4 5 | 6 7 1e :||\nNs[2]: 2: 4 5 6 | 1 2 3 |')
  expect(a.diagnostics).toEqual([])
  expect(a.score.alternatives).toHaveLength(2)
  expect(a.score.alternatives![1]!.measure.events[0]!.meterCount).toBe(3)
 })
 it.each([
  ['Ns[3]: 2: 5 6 |','遍次'],['Ns[2]: 3: 5 6 |','范围'],['Ns[2]: 2: 5 |','总时值'],
  ['Ns[2]: 2: 5 6 |\nNs[2]: 2: 6 7 |','重复指定'],['Ns[2]: 2: ||: 5 6 :||','结构反复'],
  ['Ns[2]: 2: {key=D}5 6 |','谱中设置'],['Ns[2]: 2: 5 6~ |','延音'],['Ns[2]: 2: 5 6 | 7 1e |','范围'],
 ])('diagnoses unsafe replacement %s',(row,word)=>{
  const a=analyzeM3N('{2/4}\nN: ||: 1 2 | 3 4 :||\n'+row)
  expect(a.diagnostics).toContainEqual(expect.objectContaining({code:'M3N_ALTERNATIVE',message:expect.stringContaining(word)}))
 })
})

it('allows a complete tied phrase within consecutive replacement bars', () => {
 const a=analyzeM3N('{2/4}\nN: ||: 1 2~ | 2 3 :||\nNs[2]: 1: 4 5~ | 5 6 |')
 expect(a.diagnostics).toEqual([])
 expect(a.score.alternatives).toHaveLength(2)
})

it('keeps phrase boundaries inside a bar when another complete bar has an alternative', () => {
 const a=analyzeM3N('{4/4}\nN: ||: 1 2\nL1: 甲乙\nL2: 丙丁\n---\nN: 3 4 | 5 6 7 1e :||\nL1: 戊己 | 庚辛壬癸\nL2: 子丑 | 寅卯辰巳\nNs[2]: 2: 2e 3e 4e 5e |')
 expect(a.diagnostics).toEqual([])
 const events=a.score.parts.get('score')!.melody[0]!.events
 expect(events.map(e=>a.interaction.lyricsByEvent.get(e)?.filter(l=>l.text).map(l=>l.text))).toEqual([['甲','丙'],['乙','丁'],['戊','子'],['己','丑']])
})
