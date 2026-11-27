import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { chromium } from '@playwright/test'

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const output = resolve(argument('output') ?? '.tmp/numbered-width-review')
const base = argument('base') ?? 'http://127.0.0.1:8787/score/'
const distribution = argument('dist')
mkdirSync(output, { recursive: true })
writeFileSync(join(output, 'entry.ts'), `export * from ${JSON.stringify(resolve('tools/numbered-width-review-layout.mjs'))}\n`)
execFileSync(process.execPath, ['tools/build-numbered-audit-bundle.mjs', output], { stdio: 'inherit' })
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const bundleHash = digest(readFileSync(join(output, 'bundle/bundle.js')))
const fonts = JSON.parse(readFileSync('tools/fonts/library/manifest.json', 'utf8')).fonts
for (const font of fonts) assert.equal(digest(readFileSync(join('tools/fonts/library', font.file))), font.sha256)
const reportPath = join(output, 'report.json')
const previous = process.argv.includes('--resume') && existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : undefined
if (previous) assert.equal(previous.bundleHash, bundleHash, 'Review code changed')
const report = { revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), bundleHash, base,
  fontHashes: fonts.map(({ file, sha256 }) => ({ file, sha256 })), complete: false, entries: previous?.entries ?? [] }
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
const inputs = ['scores', 'works', 'examples'].flatMap(scope => readdirSync('src/' + scope).filter(file => file.endsWith('.m3n')).sort().map(file => `${scope}/${file}`))
  .filter(file => !argument('score') || file.includes(argument('score')))
const launch = () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true,
  args: ['--disable-gpu', '--renderer-process-limit=1', '--disable-features=SpareRendererForSitePerProcess', '--js-flags=--expose-gc --max-old-space-size=256'] })
for (const file of inputs) {
  const source = readFileSync('src/' + file, 'utf8'), sourceHash = digest(source)
  const previous = report.entries.find(entry => entry.file === file)
  if (previous) { assert.equal(previous.sourceHash, sourceHash); continue }
  let browser = await launch()
  try {
    let page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    if (distribution) await page.route(new URL('**', base).href, route => {
      const pathname = new URL(route.request().url()).pathname.slice(new URL(base).pathname.length)
      const file = join(resolve(distribution), pathname)
      if (!existsSync(file) || !/\.[a-z\d]+$/i.test(pathname)) return route.fulfill({ path: join(resolve(distribution), 'index.html'), contentType: 'text/html; charset=utf-8' })
      const contentType = pathname.endsWith('.js') ? 'application/javascript; charset=utf-8' : pathname.endsWith('.css') ? 'text/css; charset=utf-8'
        : pathname.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream'
      return route.fulfill({ path: file, contentType })
    })
    // Record the real reader before releasing its DOM and compiled engine.
    // The standalone example has no reader route, so use the library entry.
    const route = file.startsWith('examples/') ? 'scores/ban_yin_jie_kou_qin_ji_ben_gong_01' : file.slice(0, -4)
    await page.goto(new URL(route, base).href)
    await page.locator('[data-selected-width]').waitFor({ timeout: 120000 })
    const webWidth = Number(await page.locator('[data-selected-width]').first().getAttribute('data-selected-width'))
    assert.equal(await page.locator('.score-paper svg').first().getAttribute('data-m3n-metrics'), 'font-design')
    if (file.includes('ban_yin_jie_kou_qin_ji_ben_gong_01')) {
      const geometry = () => page.locator('.score-paper').evaluate(paper => ({
        pages: [...paper.querySelectorAll('svg[data-engine]')].map(svg => svg.getAttribute('viewBox')),
        rows: [...paper.querySelectorAll('g.system')].map(row => [row.id, row.getAttribute('data-m3n-top'), row.getAttribute('data-m3n-bottom')]),
        notes: [...paper.querySelectorAll('g.note')].map(note => [note.getAttribute('data-m3n-id'), note.getAttribute('transform')]),
      }))
      const before = await geometry()
      await page.locator('.score-paper').evaluate(paper => {
        window.widthMutations = []
        new MutationObserver(changes => window.widthMutations.push(...changes.map(change => change.oldValue)))
          .observe(paper, { attributes: true, attributeOldValue: true, attributeFilter: ['data-selected-width'] })
      })
      for (const enabled of [true, false]) {
        if (!await page.getByRole('dialog', { name: '乐谱设置', exact: true }).isVisible())
          await page.getByRole('button', { name: '乐谱设置', exact: true }).click()
        await page.getByRole('switch', { name: '小节号', exact: true }).click()
        await page.locator(`.score-paper[data-measure-numbers="${enabled}"]:not([aria-busy="true"])`).waitFor()
        assert.deepEqual(await geometry(), before, 'Measure number toggle changed reader geometry')
        assert.deepEqual(await page.evaluate(() => window.widthMutations), [], 'Measure number toggle reran width search')
      }
    }
    const webFonts = await page.evaluate(() => [...document.fonts].map(face => ({ family: face.family, weight: face.weight, status: face.status })))
    // Closing a page alone can retain its renderer and compiled engine. Release
    // the entire reader process before creating the independent audit browser.
    await browser.close()
    browser = await launch()
    page = await browser.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__review-fonts/*', route => route.fulfill({ path: join('tools/fonts/library', new URL(route.request().url()).pathname.split('/').at(-1)), contentType: 'font/ttf', headers: { 'Access-Control-Allow-Origin': '*' } }))
    await page.addScriptTag({ content: readFileSync(join(output, 'bundle/bundle.js'), 'utf8') })
    await page.evaluate(fonts => m3n.initialize(fonts), fonts.map(font => ({ ...font, url: new URL('__review-fonts/' + font.file, base).href })))
    const result = await page.evaluate(source => m3n.review(source), source)
    if (!file.startsWith('examples/')) assert.equal(result.production.width, webWidth, `Reader/offline mismatch: ${file}`)
    assert.equal(result.selected.pageCount, result.production.pageCount, 'Pruned/unpruned pages differ')
    assert(Math.abs(result.selected.totalCost - result.production.totalCost) < 1e-8, 'Pruned/unpruned costs differ')
    const validationIssues = []
    for (const audit of result.audits) {
      if (audit.outside.length || audit.overlaps.length) validationIssues.push({ width: audit.width,
        outside: audit.outside, overlaps: audit.overlaps })
      const candidate = result.candidates.find(candidate => candidate.width === audit.width)
      assert.equal(audit.pageCount, candidate.pageCount)
      assert(Math.abs(audit.totalCost - candidate.totalCost) < 1e-8)
    }
    assert.equal(errors.length, 0, errors.join('\n'))
    report.entries.push({ file, title: source.match(/\{title=([^}]+)\}/)?.[1] ?? file, sourceHash,
      webWidth: file.startsWith('examples/') ? null : webWidth, webFonts, validationIssues, ...result })
    save()
    console.log(`${report.entries.length}/${inputs.length} ${file}: selected ${result.selected.width}, minimum same-page ${result.minimum.width}, complete winner ${result.globalBest.width}`)
  } finally { await browser.close() }
}
report.complete = true
save()
