import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { chromium } from '@playwright/test'

let browser, page
before(async () => {
  const executablePath = process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser'].find(existsSync)
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  page = await browser.newPage()
  await page.setContent('<main></main>')
  await page.addScriptTag({ content: readFileSync(new URL('./lib/native-ink-collisions.mjs', import.meta.url), 'utf8').replace('export function', 'function') })
  await page.addScriptTag({ content: readFileSync(new URL('./lib/numbered-svg-metrics.mjs', import.meta.url), 'utf8').replace('export function', 'function') })
})
after(async () => { await browser?.close() })
const check = svg => page.evaluate(svg => {
  document.querySelector('main').innerHTML = `<svg width="120" height="100" viewBox="0 0 120 100"><g class="system">${svg}</g></svg>`
  return auditNativeInkCollisions(document.querySelector('g.system'))
}, svg)

test('detects real painted text overlap with music', async () => {
  const result = await check('<g class="note" id="note"><rect x="30" y="40" width="30" height="30"/></g><text data-m3n-role="annotation" x="40" y="60" font-size="16">p</text>')
  assert.equal(result.collisions.length, 1)
  assert.ok(result.collisions[0].opaquePixelsAt2x > 0)
})
test('rejects an empty curve-box intersection while detecting ink crossing the curve', async () => {
  const curve = '<g data-m3n-relation="slur"><path d="M0 60 Q50 -20 100 60" fill="none" stroke="black" stroke-width="2"/></g>'
  const clear = await check(curve + '<text data-m3n-role="annotation" x="40" y="55" font-size="16">pp</text>')
  assert.equal(clear.candidates, 1)
  assert.equal(clear.collisions.length, 0)
  const crossed = await check(curve + '<text data-m3n-role="annotation" x="40" y="27" font-size="16">pp</text>')
  assert.equal(crossed.collisions.length, 1)
})
test('respects real gaps in a dashed line', async () => {
  const result = await check('<g data-m3n-relation="octave"><line x1="0" y1="20" x2="100" y2="20" stroke="black" stroke-width="2" stroke-dasharray="4 8"/></g><rect data-m3n-role="annotation" x="5" y="19" width="6" height="2"/>')
  assert.equal(result.candidates, 1)
  assert.equal(result.collisions.length, 0)
})

test('includes a section frame and consolidates a lyric fragment with its prefix', async () => {
  const framed = await check('<g class="note"><rect x="10" y="10" width="5" height="5"/></g><g data-m3n-role="annotation-frame"><rect x="10" y="10" width="30" height="30" fill="none" stroke="black"/><text data-m3n-role="annotation" x="20" y="30" font-size="12">A</text></g>')
  assert.equal(framed.collisions.length, 1)
  const lyric = await check('<g data-m3n-role="lyric-fragment"><text data-m3n-role="lyric-prefix" x="10" y="50">1.</text><text data-m3n-role="lyric" x="30" y="50">word</text><line x1="30" y1="53" x2="60" y2="53" stroke="black"/></g>')
  assert.equal(lyric.labels, 1)
  assert.equal(lyric.collisions.length, 0)
})

test('checks music, beams, marks and relations across alternative lanes', async () => {
  const main = '<g data-m3n-lane="melody"><g class="note"><rect x="20" y="20" width="20" height="20"/></g></g>'
  for (const content of [
    '<g class="note"><rect x="25" y="25" width="20" height="20"/></g>',
    '<g data-m3n-role="beam"><line x1="15" y1="30" x2="60" y2="30" stroke="black" stroke-width="2"/></g>',
    '<g data-m3n-role="mark" data-m3n-mark="tip"><circle cx="30" cy="30" r="3"/></g>',
    '<g data-m3n-relation="slur"><path d="M20 35 Q30 15 40 35" fill="none" stroke="black" stroke-width="2"/></g>',
  ]) {
    const result = await check(main + `<g data-m3n-lane="alternative:2">${content}</g>`)
    assert.equal(result.collisions.length, 1)
  }
  const clear = await check(main + '<g data-m3n-lane="alternative:2"><g class="note"><rect x="25" y="50" width="20" height="20"/></g></g>')
  assert.equal(clear.collisions.length, 0)
})

const restMetrics = (id = 'm3n-rest-1-0', count = '12', x = 30, y = 40, measure = 'm3n-measure-1-1', extra = '') => page.evaluate(({id,count,x,y,measure,extra}) => {
  document.querySelector('main').innerHTML = `<svg viewBox="0 0 120 100"><g class="system"><g class="note" id="${id}" data-m3n-measure="${measure}"><text font-size="22" x="${x}" y="${y}">${count}</text></g>${extra}</g></svg>`
  return captureNumberedGeometry(document.querySelector('main'))
}, {id,count,x,y,measure,extra})

test('rest comparison ignores engine serials while retaining the printed count and measured position', async () => {
  const expected = await restMetrics()
  assert.deepEqual(await restMetrics('m3n-rest-1-1-melody'), expected)
  assert.equal(expected.systems[0].notes.length, 1)
  for (const [id,count,x,y,measure] of [
    ['m3n-rest-1-0','13',30,40,'m3n-measure-1-1'],
    ['m3n-rest-1-0','12',31,40,'m3n-measure-1-1'],
    ['m3n-rest-1-0','12',30,41,'m3n-measure-1-1'],
    ['m3n-rest-1-0','12',30,40,'m3n-measure-1-2'],
    ['m3n-rest-1-0','',30,40,'m3n-measure-1-1'],
  ]) assert.notDeepEqual(await restMetrics(id,count,x,y,measure), expected)
  assert.notDeepEqual(await restMetrics('m3n-rest-1-0','0'), expected)
  assert.equal((await restMetrics('m3n-rest-1-0','8')).systems[0].notes.length, 1)
})

test('compares every simultaneous rest separately and rejects missing measure identity', async () => {
  const extra = '<g class="note" id="m3n-rest-1-1-bass" data-m3n-measure="m3n-measure-1-1"><text font-size="22" x="30" y="80">12</text></g>'
  const result = await restMetrics('m3n-rest-1-1-melody','12',30,40,'m3n-measure-1-1',extra)
  assert.equal(new Set(result.systems[0].ids).size, 2)
  assert.equal(result.systems[0].notes.length, 2)
  assert.notDeepEqual(await restMetrics(), result)
  await assert.rejects(restMetrics('m3n-rest-1-0','12',30,40,''), /no measure identity/)
})

test('counts inline pass controls once and still detects their music collisions', async () => {
  const control = '<g data-m3n-role="control" data-m3n-control="passes"><text data-m3n-role="alternative-passes" x="30" y="40" font-size="16">3.</text></g>'
  const clear = await check(control)
  assert.equal(clear.labels, 1)
  assert.equal(clear.collisions.length, 0)
  const crossed = await check(control + '<g class="note"><rect x="30" y="20" width="20" height="25"/></g>')
  assert.equal(crossed.labels, 1)
  assert.equal(crossed.collisions.length, 1)
  assert.ok(crossed.collisions[0].opaquePixelsAt2x > 0)
})
