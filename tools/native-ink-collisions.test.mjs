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
  await page.addScriptTag({ content: readFileSync(new URL('./lib/staff-ink-collisions.mjs', import.meta.url), 'utf8').replace(/^import .*\n/, '').replaceAll('export function', 'function') })
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
test('staff audit detects repeat dots against notes and rests using the current bar class', async () => {
  for (const kind of ['note', 'rest']) {
    const result = await page.evaluate(kind => {
      document.querySelector('main').innerHTML = `<svg width="120" height="100"><g class="system">
        <line class="staff-line" x1="0" y1="45" x2="100" y2="45" stroke="black"/>
        <g class="${kind}" id="music"><rect x="30" y="40" width="10" height="10"/></g>
        <g class="staff-bar" id="repeat"><circle cx="35" cy="45" r="2"/></g>
        </g></svg>`
      const system = document.querySelector('g.system'), failed = auditStaffInkCollisions(system)
      system.querySelector('circle').setAttribute('cx', '20')
      return { failed, clear: auditStaffInkCollisions(system), restored: !system.querySelector('[data-m3n-role]') }
    }, kind)
    assert.equal(result.failed.collisions.length, 1)
    assert.ok([result.failed.collisions[0].a, result.failed.collisions[0].b].some(side => side.kind === 'bar'))
    assert.equal(result.clear.collisions.length, 0)
    assert.equal(result.restored, true)
  }
})
test('staff audit detects a measure-opening cancellation against the previous bar', async () => {
  const result = await page.evaluate(() => {
    document.querySelector('main').innerHTML = `<svg width="120" height="100"><g class="system">
      <g class="staff-bar" id="previous-bar"><path d="M40 30 V70" fill="none" stroke="black"/></g>
      <g class="staff-signature" id="cancellation"><path d="M40 37 V58 M44 34 V55 M40 43 L44 41 M40 51 L44 49" fill="none" stroke="black" stroke-width="1.2"/></g>
      </g></svg>`
    const system = document.querySelector('g.system')
    const failed = auditStaffInkCollisions(system)
    system.querySelector('.staff-signature').setAttribute('transform', 'translate(4 0)')
    return { failed, clear: auditStaffInkCollisions(system) }
  })
  assert.equal(result.failed.collisions.length, 1)
  assert.ok(result.failed.collisions[0].opaquePixelsAt2x > 0)
  assert.equal(result.clear.collisions.length, 0)
})
test('staff audit checks independent music and ending hooks but permits beam joins', async () => {
  const audit = svg => page.evaluate(svg => {
    document.querySelector('main').innerHTML = `<svg width="120" height="100"><g class="system">${svg}</g></svg>`
    const system = document.querySelector('g.system')
    const result = auditStaffInkCollisions(system)
    return { ...result, restored: !system.querySelector('[data-m3n-role]') }
  }, svg)
  const note = '<g class="note" id="a"><rect x="30" y="40" width="10" height="10"/></g>'
  const music = await audit(note + '<g class="chord" id="b"><rect x="35" y="40" width="10" height="10"/></g>')
  assert.equal(music.collisions.length, 1)
  assert.equal(music.restored, true)
  const ending = await audit(note + '<g class="ending voltaBracket" id="ending"><path d="M35 35 V55" stroke="black"/></g>')
  assert.equal(ending.collisions.length, 1)
  const beam = await audit('<g class="note"><path data-m3n-join="stem-a" d="M30 60 V40" stroke="black"/></g><g class="beam" data-m3n-join="stem-a"><rect x="30" y="40" width="20" height="2"/></g>')
  assert.equal(beam.collisions.length, 0)
  const multiRest = await audit('<g class="rest"><path d="M10 60 H50" stroke="black"/><g class="rest"><text x="25" y="40">4</text></g></g>')
  assert.equal(multiRest.collisions.length, 0)
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

test('checks complete system ink without rejecting disjoint shapes in overlapping boxes', async () => {
  const result = await page.evaluate(() => {
    const host = document.querySelector('main')
    host.innerHTML = '<svg width="120" height="100"><g class="system" id="first"><path data-m3n-join="local-join" d="M0 40 H80 V60" fill="none" stroke="black" stroke-width="2"/></g><g class="system" id="second"><rect data-m3n-join="local-join" x="20" y="50" width="10" height="10"/></g></svg>'
    const clear = auditNativeInkCollisions(host.querySelector('svg'), { groupSelector: 'g.system' })
    host.querySelector('rect').setAttribute('y', '39')
    const crossed = auditNativeInkCollisions(host.querySelector('svg'), { groupSelector: 'g.system' })
    return { clear, crossed }
  })
  assert.equal(result.clear.candidates, 1)
  assert.equal(result.clear.collisions.length, 0)
  assert.equal(result.crossed.collisions.length, 1)
})

test('includes a section frame and consolidates a lyric fragment with its prefix', async () => {
  const framed = await check('<g class="note"><rect x="10" y="10" width="5" height="5"/></g><g data-m3n-role="annotation-frame"><rect x="10" y="10" width="30" height="30" fill="none" stroke="black"/><text data-m3n-role="annotation" x="20" y="30" font-size="12">A</text></g>')
  assert.equal(framed.collisions.length, 1)
  const lyric = await check('<g data-m3n-role="lyric-fragment"><text data-m3n-role="lyric-prefix" x="10" y="50">1.</text><text data-m3n-role="lyric" x="30" y="50">word</text><line x1="30" y1="53" x2="60" y2="53" stroke="black"/></g>')
  assert.equal(lyric.labels, 1)
  assert.equal(lyric.collisions.length, 0)
})


test('all independent object categories collide regardless of role or DOM order', async () => {
  const wrappers = ['class="note"', 'data-m3n-role="bar"', 'data-m3n-role="beam"', 'data-m3n-role="control"', 'data-m3n-relation="slur"', 'data-m3n-role="annotation"', 'data-m3n-role="new-role"', '']
  for (let i = 0; i < wrappers.length; i++) for (let j = i; j < wrappers.length; j++) {
    const shape = (role, x) => `<g ${role}><rect x="${x}" y="40" width="10" height="10"/></g>`
    assert.equal((await check(shape(wrappers[i], 30) + shape(wrappers[j], 35))).collisions.length, 1, `${wrappers[i]} / ${wrappers[j]}`)
    assert.equal((await check(shape(wrappers[j], 45) + shape(wrappers[i], 30))).collisions.length, 0)
  }
})

test('nested unknown owners do not absorb an independently owned note', async () => {
  for (const [x, overlaps] of [[35, 1], [45, 0]]) {
    const result = await check(`<g data-m3n-role="new-role"><g class="note"><rect x="30" y="40" width="10" height="10"/></g><rect x="${x}" y="45" width="10" height="10"/></g>`)
    assert.equal(result.collisions.length, overlaps)
  }
})

test('stroke joins use their full painted bounds and the SVG miter limit', async () => {
  for (const [limit, overlaps] of [[4, 0], [12, 1]]) {
    const result = await check(`<g class="note"><rect x="39" y="12" width="2" height="3"/></g><path d="M30 70 L40 20 L50 70" fill="none" stroke="black" stroke-width="4" stroke-miterlimit="${limit}"/>`)
    assert.equal(result.collisions.length, overlaps)
  }
})

test('paint geometry includes transforms, polygons, fill rules, text strokes and visibility', async () => {
  const cases = [
    ['<polygon points="30,40 50,40 50,60 30,60"/>', true],
    ['<polyline points="30,40 50,60" fill="none" stroke="black" stroke-width="3"/>', true],
    ['<rect x="-10" y="-10" width="20" height="20" transform="translate(40 50) rotate(45)"/>', true],
    ['<path d="M20 30 H60 V70 H20 Z M30 40 H50 V60 H30 Z" fill-rule="evenodd"/>', false],
    ['<rect x="30" y="40" width="20" height="20" opacity="0"/>', false],
    ['<rect x="30" y="40" width="20" height="20" opacity=".2"/>', true],
    ['<rect x="30" y="40" width="20" height="20" fill-opacity="0"/>', false],
    ['<rect x="30" y="40" width="20" height="20" fill="transparent"/>', false],
    ['<g display="none"><rect x="30" y="40" width="20" height="20"/></g>', false],
    ['<rect x="30" y="40" width="20" height="20" visibility="hidden"/>', false],
    ['<defs><rect x="30" y="40" width="20" height="20"/></defs>', false],
  ]
  for (const [ink, collision] of cases) {
    const result = await check(ink + '<rect x="38" y="48" width="4" height="4"/>')
    assert.equal(result.collisions.length, Number(collision), ink)
  }
})

test('declared joins exempt only the joining primitives, retaining every other overlap', async () => {
  const stem = '<path data-m3n-join="s" d="M35 65 V40" stroke="black"/>'
  const beam = '<g data-m3n-role="beam" data-m3n-join="s"><rect x="30" y="40" width="30" height="3"/></g>'
  assert.equal((await check(`<g class="note">${stem}</g>${beam}`)).collisions.length, 0)
  assert.equal((await check(`<g class="note">${stem}<rect x="35" y="40" width="10" height="10"/></g>${beam}`)).collisions.length, 1)
  assert.equal((await check(`<g class="note">${stem}</g>${beam}<rect x="50" y="40" width="5" height="5"/>`)).collisions.length, 1)
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
