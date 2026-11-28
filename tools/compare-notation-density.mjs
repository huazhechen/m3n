import { densityLimits, densityRegressionFailures } from './lib/density-regression.mjs'
import { browserTestFontAssets } from './lib/browser-test-font-assets.mjs'
import { browserPages } from './lib/browser-pages.mjs'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const root = resolve(import.meta.dirname, '..')
const output = resolve(argument('output') ?? '.tmp/notation-density')
// Fixed-width end-to-end guardrails retain real fonts, lyrics and beam geometry.
// Keep the existing height ceilings; musical size is calibrated to 28px em / 7px spaces.
// lyric/music sizes, ink audits and the numbered optimal-width gate stay fixed.
const autoStaffWidth = process.argv.includes('--auto-staff-width')
const regression = process.argv.includes('--regression')
const coreGap = argument('core-gap') === undefined ? undefined : Number(argument('core-gap'))
if (coreGap !== undefined && (!Number.isFinite(coreGap) || coreGap < 0)) throw new Error('Invalid core gap')

if (regression && (['scores', 'widths', 'staff-sizes', 'core-gap'].some(name => argument(name))
    || process.argv.includes('--all') || process.argv.includes('--metrics-only') || autoStaffWidth)) {
  throw new Error('--regression uses fixed fixtures and widths and full ink audits')
}
const origin = 'http://notation-density.local'
// Keep the same font bytes and fallback behavior, but serve them as binary
// assets instead of parsing the full CJK font as JavaScript in every page.
const fonts = browserTestFontAssets(root, undefined, { origin, allowFullCjk: true })
if (process.argv.includes('--bundle-only')) {
  const { build } = await import('vite')
  await build({ plugins: [fonts.plugin], configFile: false, logLevel: 'error', base: '/',
    define: { 'import.meta.url': JSON.stringify(`${origin}/bundle.js`) },
    build: { outDir: join(output, 'bundle'), emptyOutDir: true, minify: true,
      lib: { entry: join(root, 'tools/notation-density-layout.mjs'), name: 'notationDensity', formats: ['iife'], fileName: () => 'bundle.js' } } })
} else {
  mkdirSync(output, { recursive: true })
  // Release all bundler/font buffers before launching Chromium.
  execFileSync(process.execPath, [import.meta.filename, '--bundle-only', `--output=${output}`], { stdio: 'inherit' })
  const files = (regression ? Object.keys(densityLimits).join(',') : argument('scores') ?? 'huan_le_song_01,mo_li_hua_01,ni_shi_wo_xin_ai_de_gu_niang_01,flower_dance_01').split(',')
  const sourceInputs = process.argv.includes('--all') ? ['scores', 'works', 'examples'].flatMap(scope => readdirSync(join(root, 'src', scope)).filter(file => file.endsWith('.m3n')).map(file => `${scope}/${file}`)) : files.map(file => `scores/${file}.m3n`)
  const inputs = sourceInputs.map(file => ({ file, path: join(root, 'src', file),
    limit: file.includes('ban_yin_jie_kou_qin_ji_ben_gong_01')
      ? { ...densityLimits.ban_yin_jie_kou_qin_ji_ben_gong_01, lineEnds: ['m3n-measure-1-26'] }
      : densityLimits[file.slice(7, -4)],
    width: regression && file.includes('ban_yin_jie_kou_qin_ji_ben_gong_01') ? 768 : undefined }))
  if (regression) inputs.push({ file: 'fixtures/grand-staff-density.m3n',
    path: join(root, 'tools/fixtures/grand-staff-density.m3n'),
    limit: { staffHeight: 600, numberedHeight: 600, staffRows: 3, numberedRows: 3, heightRatio: 2 } })
  const auditLayout = !process.argv.includes('--metrics-only')
  const includeSvg = process.argv.includes('--screenshots')
  const includePdf = process.argv.includes('--pdfs')
  const profile = process.argv.includes('--profile')
  const widths = (regression ? '640' : argument('widths') ?? '528,640,768').split(',').map(Number)
  if (widths.some(width => !Number.isFinite(width) || width < 320)) throw new Error('Invalid widths')
  const sizes = argument('staff-sizes')?.split(',').map(Number) ?? [undefined]
  if (sizes.some(size => size !== undefined && (!Number.isFinite(size) || size < 16))) throw new Error('Invalid staff sizes')
  const entries = []
  const writeReport = (complete = false) => {
    const comparable = entries.filter(entry => entry.numbered.displayedEvents === entry.staff.displayedEvents)
    const ratios = comparable.map(entry => entry.staff.naturalHeight / entry.numbered.naturalHeight).sort((a, b) => a - b)
    const quantile = fraction => ratios.length ? ratios[Math.min(ratios.length - 1, Math.floor((ratios.length - 1) * fraction))] : null
    writeFileSync(join(output, 'report.json'), JSON.stringify({ complete, auditLayout,
      expectedEntries: inputs.reduce((sum, input) => sum + (autoStaffWidth || input.width ? 1 : widths.length) * sizes.length, 0),
      summary: { comparable: comparable.length, expanded: entries.length - comparable.length,
        medianHeightRatio: quantile(.5), p90HeightRatio: quantile(.9),
        samePageCount: comparable.filter(entry => entry.numbered.pages === entry.staff.pages).length,
        sameRowCount: comparable.filter(entry => entry.numbered.rows === entry.staff.rows).length,
        withinOneRow: comparable.filter(entry => Math.abs(entry.numbered.rows - entry.staff.rows) <= 1).length,
        absoluteRowDifference: comparable.reduce((sum, entry) => sum + Math.abs(entry.numbered.rows - entry.staff.rows), 0),
        numberedRows: comparable.reduce((sum, entry) => sum + entry.numbered.rows, 0),
        staffRows: comparable.reduce((sum, entry) => sum + entry.staff.rows, 0),
        outside: entries.reduce((sum, entry) => sum + entry.numbered.outside.length + entry.staff.outside.length, 0),
        overlaps: entries.reduce((sum, entry) => sum + entry.numbered.overlaps.length + entry.staff.overlaps.length, 0) }, entries }, null, 2) + '\n')
  }
  for await (const { input: { file, path: inputPath, limit, width: fixedWidth }, page } of browserPages(inputs)) {
      await page.route(`${origin}/**`, async route => {
        if (await fonts.fulfill(route)) return
        if (new URL(route.request().url()).pathname === '/') {
          await route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="zh-CN" style="font-synthesis:none"><body></body></html>' })
        } else await route.fulfill({ path: join(output, 'bundle/bundle.js'), contentType: 'application/javascript' })
      })
      await page.goto(origin)
      await page.addScriptTag({ url: `${origin}/bundle.js` })
      const source = readFileSync(inputPath, 'utf8')
      const measuredWidths = autoStaffWidth ? [await page.evaluate(source => window.notationDensity.preferredStaffWidth(source), source)] : fixedWidth ? [fixedWidth] : widths
      for (const width of measuredWidths) for (const staffMusic of sizes) {
        const result = await page.evaluate(({ source, width, auditLayout, staffMusic, includeSvg, profile, includePdf, coreGap }) => window.notationDensity.compare(source, width, { auditLayout, staffMusic, includeSvg, profile, includePdf, coreGap }), { source, width, auditLayout, staffMusic, includeSvg, profile, includePdf, coreGap })
        if (result.pdf) {
          for (const [notation, bytes] of Object.entries(result.pdf)) {
            const name = `${file.replaceAll('/', '_')}-${width}${staffMusic ? `-${staffMusic}` : ''}`
            writeFileSync(join(output, `${name}-${notation}.pdf`), Buffer.from(bytes))
          }
          delete result.pdf
        }
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
        if (regression) {
          const failures = densityRegressionFailures(result, limit, width)
          if (failures.length) {
            result.regressionFailures = failures
            console.error(`Density regression: ${file}: ${failures.join(', ')}`)
            process.exitCode = 1
          }
        }
        entries.push({ file, width, staffMusic, ...(coreGap === undefined ? {} : { coreGap }), ...result })
        writeReport()
        console.log(`${file} ${width}px${staffMusic ? ` staff ${staffMusic}px` : ''}: numbered ${result.numbered.pages}p/${result.numbered.rows} rows; staff ${result.staff.pages}p/${result.staff.rows} rows`)
        for (const notation of ['numbered', 'staff']) {
          const { outside, overlaps } = result[notation]
          if (!outside.length && !overlaps.length) continue
          console.error(`Ink audit failed: ${file} ${width}px ${notation}: ${outside.length} outside, ${overlaps.length} overlaps`)
          console.error(JSON.stringify({ outside, overlaps }, null, 2))
          process.exitCode = 1
        }
      }
  }
  writeReport(true)
}
