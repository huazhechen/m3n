import { chromiumLaunchOptions } from './lib/chromium-options.mjs'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { chromium } from '@playwright/test'

const root = resolve(import.meta.dirname, '..')
const output = resolve(process.argv.find(value => value.startsWith('--output='))?.slice(9) ?? '.tmp/optimal-notation-pages')
mkdirSync(output, { recursive: true })
execFileSync(process.execPath, ['tools/compare-notation-density.mjs', '--bundle-only', `--output=${output}`], { cwd: root, stdio: 'inherit' })
const available = ['scores', 'works', 'examples'].flatMap(scope => readdirSync(join(root, 'src', scope))
  .filter(file => file.endsWith('.m3n')).map(file => `${scope}/${file}`))
const selected = process.argv.find(value => value.startsWith('--scores='))?.slice(9).split(',')
const inputs = selected ? available.filter(file => selected.includes(file) || selected.includes(file.split('/').at(-1).replace(/\.m3n$/, ''))) : available
if (selected?.some(name => !inputs.some(file => file === name || file.split('/').at(-1).replace(/\.m3n$/, '') === name))) throw new Error('Unknown --scores entry')
const origin = 'http://optimal-notation.local', entries = []
const save = complete => {
  const comparable = entries.filter(entry => entry.numbered.displayedEvents === entry.staff.displayedEvents)
  const differences = entries.filter(entry => entry.numbered.pages !== entry.staff.pages)
  writeFileSync(join(output, 'report.json'), JSON.stringify({ complete, scope: selected ? 'selected' : 'all', expectedEntries: inputs.length,
    summary: { audited: entries.length, comparable: comparable.length,
      differentPages: differences.length,
      comparableDifferentPages: differences.filter(entry => entry.numbered.displayedEvents === entry.staff.displayedEvents).length,
      expandedDifferentPages: differences.filter(entry => entry.numbered.displayedEvents !== entry.staff.displayedEvents).length,
      outside: entries.reduce((sum, entry) => sum + entry.staff.outside.length + entry.numbered.outside.length, 0),
      overlaps: entries.reduce((sum, entry) => sum + entry.staff.overlaps.length + entry.numbered.overlaps.length, 0) },
    differences: differences.map(({ file, numbered, staff }) => ({ file, numbered, staff })), entries }, null, 2) + '\n')
}
for (const file of inputs) {
  const browser = await chromium.launch(chromiumLaunchOptions())
  try {
    const page = await browser.newPage()
    await page.route(`${origin}/**`, route => new URL(route.request().url()).pathname === '/'
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="zh-CN" style="font-synthesis:none"><body></body></html>' })
      : route.fulfill({ path: join(output, 'bundle/bundle.js'), contentType: 'application/javascript' }))
    await page.goto(origin)
    await page.addScriptTag({ url: `${origin}/bundle.js` })
    const result = await page.evaluate(source => window.notationDensity.optimalPages(source), readFileSync(join(root, 'src', file), 'utf8'))
    entries.push({ file, ...result })
    save(false)
    console.log(`${file}: numbered ${result.numbered.pages}p @${result.numbered.width}px; staff ${result.staff.pages}p @${result.staff.width}px`)
    if ([result.numbered, result.staff].some(value => value.outside.length || value.overlaps.length)) process.exitCode = 1
  } finally { await browser.close() }
}
save(true)
