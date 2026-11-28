import { chromium, webkit, devices } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
import { chromiumLaunchOptions } from './lib/chromium-options.mjs'

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const output = resolve(argument('output') ?? '.tmp/staff-font-design')
const origin = 'http://staff-font-design.local'
mkdirSync(output, { recursive: true })
writeFileSync(join(output, 'entry.ts'), `
export { initialize } from ${JSON.stringify(resolve('tools/numbered-spacing-layout.mjs'))}
import { search, measure } from ${JSON.stringify(resolve('tools/staff-width-layout.mjs'))}
import { analyzeM3N } from '@m3n/notation'
import { prepareStaffScore } from '@m3n/score-renderer/staff'
export async function parity(source) {
  globalThis.__m3nProductionWidthPolicy = true
  const original = CanvasRenderingContext2D.prototype.measureText
  let result, geometry
  CanvasRenderingContext2D.prototype.measureText = () => { throw new Error('Staff search consulted Canvas') }
  try {
    result = await search(source, { prune: true })
    const render = await prepareStaffScore(analyzeM3N(source).score, { width: result.best.width })
    geometry = render.layoutInfo()
    if (render(true).some(svg => svg.dataset.m3nMetrics !== 'font-design')) throw new Error('Missing design metrics')
  } finally { CanvasRenderingContext2D.prototype.measureText = original }
  const audit = await measure(source, result.best.width, true)
  return { width: result.best.width, pages: result.best.pageCount, rows: result.best.rows,
    geometry, candidates: result.candidates.map(({timings, ...candidate}) => candidate),
    outside: audit.outside, overlaps: audit.overlaps }
}
`)
execFileSync(process.execPath, ['tools/build-numbered-audit-bundle.mjs', output, '--external-fonts', '--minify'], { stdio: 'inherit' })
const fonts = JSON.parse(readFileSync('tools/fonts/library/manifest.json', 'utf8')).fonts
const fixtures = ['src/scores/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n', 'src/scores/turkish_march_01.m3n', 'tools/fixtures/grand-staff-density.m3n']
const report = { complete: false, entries: [] }
const save = () => writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
for (const engine of ['chromium', 'webkit']) {
  const browser = await (engine === 'chromium' ? chromium.launch(chromiumLaunchOptions())
    : webkit.launch({ headless: true, executablePath: argument('webkit-executable') }))
  try {
    for (const form of ['desktop', 'tablet']) {
      const context = await browser.newContext(form === 'tablet' ? { ...devices['iPad Mini'] } : {})
      try {
        const page = await context.newPage()
        await page.route(origin + '/**', route => {
          const path = new URL(route.request().url()).pathname
          if (path === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><html style="font-synthesis:none"><body></body></html>' })
          if (path.startsWith('/audit-assets/')) return route.fulfill({ path: join(output, 'bundle', path), contentType: 'font/ttf' })
          const font = fonts.find(font => path === '/fonts/' + font.file)
          assert(font, `Unexpected request: ${path}`)
          return route.fulfill({ path: join('tools/fonts/library', font.file), contentType: 'font/ttf' })
        })
        await page.goto(origin)
        await page.addScriptTag({ content: readFileSync(join(output, 'bundle/bundle.js'), 'utf8') })
        await page.evaluate(fonts => m3n.initialize(fonts), fonts.map(font => ({ ...font, url: origin + '/fonts/' + font.file })))
        for (const fixture of fixtures) {
          const result = await page.evaluate(source => m3n.parity(source), readFileSync(fixture, 'utf8'))
          report.entries.push({ engine, form, fixture, result }); save()
          assert.equal(result.outside.length + result.overlaps.length, 0, `${engine} ${form} ${fixture} ink`)
          const previous = report.entries.find(entry => entry.fixture === fixture)
          assert.deepEqual(result, previous.result, `${engine} ${form} ${fixture} layout diverged`)
          console.log(`${engine} ${form} ${fixture}: ${result.width}px / ${result.pages}p / ${result.rows} rows`)
        }
      } finally { await context.close() }
    }
  } finally { await browser.close() }
}
report.complete = true; save()
