import assert from 'node:assert/strict'
import test from 'node:test'
import { auditVocalSlides } from './audit-vocal-slides.mts'

const scan = (notes: string, lyrics = '甲%乙', extra = '') => auditVocalSlides(`{title=测试} {key=C} {4/4}\nN: ${notes}\nL: ${lyrics}\n${extra}`).candidates

test('find XYY, preserve next lyric onset in proposed duration', () => {
  const found = scan('{lg}(1 2){/} 2')
  assert.equal(found.length, 1)
  assert.equal(found[0]!.lyrics, '甲→乙')
  assert.deepEqual(found[0]!.beats, [0.5, 0.5, 1])
  assert.equal(found[0]!.mergedBeats, 1)
  assert.equal(found[0]!.category, '二音连奏，优先复核')
})
test('reject XYX, different octave and independently lyricized notes', () => {
  assert.equal(scan('{lg}(1 2){/} 1').length, 0)
  assert.equal(scan('{lg}(1 2){/} 2e').length, 0)
  assert.equal(scan('{lg}(1 2){/} 2', '甲丙乙').length, 0)
})
test('resolve accidental carry and explicit cancellation', () => {
  assert.equal(scan('{lg}(1 2#){/} 2').length, 1)
  assert.equal(scan('{lg}(1 2#){/} 2=').length, 0)
})
test('reject tied repeated pitch; no extra instrumental attack', () => {
  assert.equal(scan('{lg}(1 2~){/} 2', '甲%+乙').length, 0)
})
test('do not remove a note with lyrics in another verse', () => {
  assert.equal(scan('||: {lg}(1 2){/} 2 :||', '甲%乙', 'L2: 天地人').length, 0)
})
test('instrumental groups have no syllable to simplify', () => {
  assert.equal(scan('{inst}{lg}(1 2){/}{/} 2', '乙').length, 0)
})
test('flag three-note runs and unslurred placeholders separately', () => {
  assert.equal(scan('{lg}(3 (2 1)){/} 1', '甲{%2}乙')[0]!.category, '三音走句，需复核旋律')
  assert.equal(scan('(1 2) 2')[0]!.category, '无连奏标记，需复核意图')
})
test('do not infer adjacency across a repeat or new section', () => {
  assert.equal(scan('{lg}(1 2){/} :|| 2').length, 0)
  const sections = auditVocalSlides('{order=A,B}\n===A\nN: {lg}(1 2){/} |\nL: 甲%\n===B\nN: 2\nL: 乙').candidates
  assert.equal(sections.length, 0)
})
