import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { build } from 'vite'

// Compare actual SVG from the same engine, with zero geometry/text tolerance.
// No server or frozen score fixtures: read the current bundled scores each run.
const root = resolve(import.meta.dirname, '..')
const temp = mkdtempSync(join(tmpdir(), 'm3n-format-render-'))
let browser
try {
  const entry = join(temp, 'entry.ts')
  writeFileSync(entry, [
    `export {formatM3N,parseM3NDocument,normalizeSectionBarlines} from ${JSON.stringify(join(root, 'packages/notation/src/index.ts'))};`,
    `export {NumberedNotationScore,prepareNumberedNotationFonts} from ${JSON.stringify(join(root, 'packages/numbered-notation/src/index.ts'))};`,
  ].join('\n'))
  await build({ configFile: false, logLevel: 'error', resolve: { alias: [
    { find: '@m3n/notation', replacement: join(root, 'packages/notation/src/index.ts') },
    { find: 'txml/txml', replacement: join(root, 'node_modules/txml/dist/txml.mjs') },
    { find: 'txml', replacement: join(root, 'node_modules/txml/dist/index.mjs') },
  ] }, build: { outDir: join(temp, 'bundle'), emptyOutDir: true, minify: false,
    lib: { entry, name: 'formatAudit', formats: ['iife'], fileName: () => 'bundle.js' } } })
  const executablePath = process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser'].find(existsSync)
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage()
  await page.setContent('<main></main>')
  await page.addScriptTag({ path: join(temp, 'bundle/bundle.js') })
  await page.evaluate(() => formatAudit.prepareNumberedNotationFonts())
  const sourcesPath = process.argv.find(argument => argument.startsWith('--sources='))?.slice(10)
  const scoreFilter = process.argv.find(argument => argument.startsWith('--score='))?.slice(8)
  const sources = sourcesPath ? JSON.parse(readFileSync(resolve(sourcesPath), 'utf8')) : Object.fromEntries(readdirSync(join(root, 'src/scores')).filter(file => file.endsWith('.m3n'))
    .map(file => [file, readFileSync(join(root, 'src/scores', file), 'utf8')]))
  // Explicitly exercise the regressions as well as current music.
  sources['regression:ties-rests-breaks-text'] = '{title=A  B} {4/4}\nN: {text=keep  spaces}1~ 1 0 0 | {br}3 (4) 5. 3 |||'
  sources['regression:equivalent-groups'] = '{4/4}\nN: ((1)) ((2)) ((3)) ((4)) (5^) 6 7 |||'
  sources['regression:ordinary-double-bar'] = '{2/4}\nN: 1 2 || // ordinary phrase\n---\nN: 3 4 |||'
  const output = join(root, '.tmp/format-rendering')
  mkdirSync(output, { recursive: true })
  writeFileSync(join(output, 'sources.json'), JSON.stringify(sources, null, 2))
  const failures = []
  let checks = 0
  for (const [file, source] of Object.entries(sources).filter(([file]) => !scoreFilter || file.includes(scoreFilter))) {
    const result = await page.evaluate(({ source }) => {
      const formatted = formatAudit.formatM3N(source)
      const before = formatAudit.parseM3NDocument(formatAudit.normalizeSectionBarlines(source)), after = formatAudit.parseM3NDocument(formatted)
      const failures = []
      for (const name of ['NumberedNotationScore']) {
        for (const width of [320, 600, 800, 1000]) for (const paged of [false, true]) {
          const options = { width, paged }
          const original = formatAudit[name].create(before).render(options)
          const changed = formatAudit[name].create(after).render(options)
          if (JSON.stringify(original) !== JSON.stringify(changed)) {
            const a = JSON.stringify(original), b = JSON.stringify(changed)
            let index = 0
            while (index < a.length && a[index] === b[index]) index += 1
            failures.push({ engine: name, width, paged, index, before: a.slice(Math.max(0, index - 80), index + 160), after: b.slice(Math.max(0, index - 80), index + 160) })
          }
        }
      }
      return failures
    }, { source })
    checks += 8
    console.log(`${file}: ${result.length ? `${result.length} differences` : 'identical'}`)
    failures.push(...result.map(item => ({ file, ...item })))
  }
  writeFileSync(join(output, 'report.json'), JSON.stringify({ checks, failures }, null, 2))
  console.log(JSON.stringify({ checks, differences: failures.length, report: join(output, 'report.json'), examples: failures.slice(0, 8) }, null, 2))
  if (failures.length) process.exitCode = 1
} finally {
  await browser?.close()
  rmSync(temp, { recursive: true, force: true })
}
