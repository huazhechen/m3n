import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const root = resolve(import.meta.dirname, '..')
const output = resolve(argument('output') ?? '.tmp/notation-density')
const origin = 'http://notation-density.local'
if (process.argv.includes('--bundle-only')) {
  const { build } = await import('vite')
  await build({ configFile: false, logLevel: 'error', base: '/',
    define: { 'import.meta.url': JSON.stringify(`${origin}/bundle.js`) },
    build: { outDir: join(output, 'bundle'), emptyOutDir: true, minify: false,
      lib: { entry: join(root, 'tools/notation-density-layout.mjs'), name: 'notationDensity', formats: ['iife'], fileName: () => 'bundle.js' } } })
} else {
  mkdirSync(output, { recursive: true })
  // Release all bundler/font buffers before launching Chromium.
  execFileSync(process.execPath, [import.meta.filename, '--bundle-only', `--output=${output}`], { stdio: 'inherit' })
  const { chromium } = await import('@playwright/test')
  const files = (argument('scores') ?? 'huan_le_song_01,mo_li_hua_01,ni_shi_wo_xin_ai_de_gu_niang_01,flower_dance_01').split(',')
  const inputs = process.argv.includes('--all') ? ['scores', 'works', 'examples'].flatMap(scope => readdirSync(join(root, 'src', scope)).filter(file => file.endsWith('.m3n')).map(file => `${scope}/${file}`)) : files.map(file => `scores/${file}.m3n`)
  const auditLayout = !process.argv.includes('--metrics-only')
  const includeSvg = process.argv.includes('--screenshots')
  const widths = (argument('widths') ?? '528,640,768').split(',').map(Number)
  if (widths.some(width => !Number.isFinite(width) || width < 320)) throw new Error('Invalid widths')
  const sizes = argument('staff-sizes')?.split(',').map(Number) ?? [undefined]
  if (sizes.some(size => size !== undefined && (!Number.isFinite(size) || size < 16))) throw new Error('Invalid staff sizes')
  const entries = []
  const writeReport = (complete = false) => {
    const comparable = entries.filter(entry => entry.numbered.displayedEvents === entry.staff.displayedEvents)
    const ratios = comparable.map(entry => entry.staff.naturalHeight / entry.numbered.naturalHeight).sort((a, b) => a - b)
    const quantile = fraction => ratios.length ? ratios[Math.min(ratios.length - 1, Math.floor((ratios.length - 1) * fraction))] : null
    writeFileSync(join(output, 'report.json'), JSON.stringify({ complete, auditLayout,
      expectedEntries: inputs.length * widths.length * sizes.length,
      summary: { comparable: comparable.length, expanded: entries.length - comparable.length,
        medianHeightRatio: quantile(.5), p90HeightRatio: quantile(.9),
        samePageCount: comparable.filter(entry => entry.numbered.pages === entry.staff.pages).length,
        outside: entries.reduce((sum, entry) => sum + entry.numbered.outside.length + entry.staff.outside.length, 0),
        overlaps: entries.reduce((sum, entry) => sum + entry.numbered.overlaps.length + entry.staff.overlaps.length, 0) }, entries }, null, 2) + '\n')
  }
  for (const file of inputs) {
    // A fresh browser releases native font caches, which survive page reloads.
    const browser = await chromium.launch({ headless: true,
      args: ['--disable-gpu', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=256'],
      executablePath: process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/sbin/chromium'].find(existsSync) })
    try {
      const page = await browser.newPage()
      await page.route(`${origin}/**`, route => new URL(route.request().url()).pathname === '/'
        ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="zh-CN" style="font-synthesis:none"><body></body></html>' })
        : route.fulfill({ path: join(output, 'bundle/bundle.js'), contentType: 'application/javascript' }))
      await page.goto(origin)
      await page.addScriptTag({ url: `${origin}/bundle.js` })
      const source = readFileSync(join(root, 'src', file), 'utf8')
      for (const width of widths) for (const staffMusic of sizes) {
        const result = await page.evaluate(({ source, width, auditLayout, staffMusic, includeSvg }) => window.notationDensity.compare(source, width, { auditLayout, staffMusic, includeSvg }), { source, width, auditLayout, staffMusic, includeSvg })
        if (result.svg) {
          const name = `${file.replaceAll('/', '_')}-${width}${staffMusic ? `-${staffMusic}` : ''}`
          for (const [notation, svg] of Object.entries(result.svg)) writeFileSync(join(output, `${name}-${notation}.svg`), svg)
          await page.setViewportSize({ width: width * 2 + 64, height: 900 })
          await page.evaluate(({ svg, width }) => {
            document.body.style.cssText = 'margin:16px;background:white;color:black;font-family:sans-serif'
            const host = document.createElement('main')
            host.style.cssText = 'display:flex;gap:24px;align-items:flex-start'
            for (const notation of ['numbered', 'staff']) {
              const column = document.createElement('section')
              column.style.cssText = `width:${width}px;flex:none`
              const label = document.createElement('p')
              label.textContent = notation
              column.append(label)
              column.insertAdjacentHTML('beforeend', svg[notation])
              host.append(column)
            }
            document.body.replaceChildren(host)
          }, { svg: result.svg, width })
          await page.screenshot({ path: join(output, `${name}.png`), fullPage: true })
          delete result.svg
        }
        entries.push({ file, width, staffMusic, ...result })
        writeReport()
        console.log(`${file} ${width}px${staffMusic ? ` staff ${staffMusic}px` : ''}: numbered ${result.numbered.pages}p/${result.numbered.rows} rows; staff ${result.staff.pages}p/${result.staff.rows} rows`)
        if ([result.numbered, result.staff].some(value => value.outside.length || value.overlaps.length)) process.exitCode = 1
      }
    } finally { await browser.close() }
  }
  writeReport(true)
}
