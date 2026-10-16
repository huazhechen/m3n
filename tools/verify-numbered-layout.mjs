import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { build } from 'vite'

// Validate real font geometry without starting a development server.
const root = resolve(import.meta.dirname, '..')
const temp = mkdtempSync(join(tmpdir(), 'm3n-layout-'))
const output = join(root, '.tmp')
let browser
try {
  const entry = join(temp, 'entry.ts')
  writeFileSync(entry, [
    `export {parseM3NDocument} from ${JSON.stringify(join(root, 'packages/notation/src/index.ts'))};`,
    `export * from ${JSON.stringify(join(root, 'packages/numbered-notation/src/index.ts'))};`,
  ].join('\n'))
  await build({
    configFile: false,
    logLevel: 'error',
    build: {
      outDir: join(temp, 'bundle'), emptyOutDir: true, minify: false,
      lib: { entry, name: 'm3n', formats: ['iife'], fileName: () => 'bundle.js' },
    },
  })
  const executablePath = process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser'].find(existsSync)
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  await page.setContent('<main></main>')
  await page.addScriptTag({ path: join(temp, 'bundle/bundle.js') })
  const scores = readdirSync(join(root, 'src/scores'))
    .filter(file => file.endsWith('.m3n'))
    .map(file => ({ file, source: readFileSync(join(root, 'src/scores', file), 'utf8') }))
  scores.push(
    { file: 'regression-lyrics', source: '{4/4}\nN: ' + Array(12).fill('(1 2) (3 4) 5 6 |').join(' ') + '\nL: ' + '“春天，花开！”'.repeat(12) + '\nL2: ' + 'internationalization '.repeat(12) },
    { file: 'regression-relations', source: '{6/8}\nN: ||: {lg}(1d 2d 3d) [1d3d5d:h]{hold} 1{ac(7d)}{/} | {cresc}1^.{/} :||\n---\nN: {rest=2} | 1{fermata} 2 3 |||' },
  )
  const report = await page.evaluate(async (scores) => {
    await m3n.prepareNumberedNotationFonts()
    const issues = [], times = []
    let checks = 0
    for (const { file, source } of scores) for (const width of [320, 600, 800, 1000]) for (const paged of [false, true]) {
      const before = performance.now()
      const scoreDocument = m3n.parseM3NDocument(source)
      let pages
      try {
        pages = m3n.NumberedNotationScore.create(scoreDocument).render({ width, paged })
      } catch (error) {
        issues.push({ file, width, paged, error: String(error) })
        continue
      }
      times.push(performance.now() - before)
      document.querySelector('main').innerHTML = pages.join('')
      await document.fonts.ready
      checks++
      const outside = [], overlap = []
      for (const svg of document.querySelectorAll('svg')) {
        const view = svg.viewBox.baseVal
        for (const element of svg.querySelectorAll('text,line,path,circle,rect')) {
          if (element.closest('defs') || element.parentNode === svg && element.tagName === 'rect') continue
          const box = element.getBBox()
          if (box.width === 0 || box.height === 0) continue
          if (box.x < view.x - 1 || box.x + box.width > view.x + view.width + 1 || box.y < view.y - 1 || box.y + box.height > view.y + view.height + 1) {
            outside.push({ tag: element.tagName, text: element.textContent, id: element.closest('[data-m3n-id]')?.getAttribute('data-m3n-id'), box: [box.x, box.y, box.width, box.height] })
          }
        }
        const lyrics = [...svg.querySelectorAll('text[data-m3n-role="lyric"]')]
          .filter(element => element.textContent.trim().replaceAll('\u200B', ''))
        for (let i = 0; i < lyrics.length; i++) for (let j = i + 1; j < lyrics.length; j++) {
          const a = lyrics[i].getBBox(), b = lyrics[j].getBBox()
          if (Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5) {
            overlap.push([lyrics[i].textContent, lyrics[j].textContent])
          }
        }
      }
      if (outside.length || overlap.length) issues.push({ file, width, paged, outside: outside.slice(0, 3), outsideCount: outside.length, overlap: overlap.slice(0, 3), overlapCount: overlap.length })
    }
    times.sort((a, b) => a - b)
    return { checks, issues, timing: { p50: times[Math.floor(times.length * .5)], p95: times[Math.floor(times.length * .95)], max: times.at(-1) } }
  }, scores)
  mkdirSync(output, { recursive: true })
  writeFileSync(join(output, 'numbered-layout-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ checks: report.checks, issues: report.issues.length, timing: report.timing, examples: report.issues.slice(0, 8) }, null, 2))
  await page.evaluate(async () => {
    const scoreDocument = m3n.parseM3NDocument('{title=简谱回归示例} {key=D} {6/8} {90qpm}\nN: ||: {lg}(1 2 3) (4 5 6){/} | 1e^.{fermata} :||\nL1: 春天，花开满园\nL2: 清风拂过田野\nB: 1d 3d 5d | [1d3d5d:h]^. |||')
    document.querySelector('main').innerHTML = m3n.NumberedNotationScore.create(scoreDocument).render({ width: 800, paged: false }).join('')
    await document.fonts.ready
  })
  await page.locator('main').screenshot({ path: join(output, 'numbered-layout-example.png') })
  assert.equal(report.issues.length, 0, JSON.stringify(report.issues.slice(0, 10), null, 2))
} finally {
  await browser?.close()
  rmSync(temp, { recursive: true, force: true })
}
