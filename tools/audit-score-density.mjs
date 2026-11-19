import { build } from 'vite'
import { chromium } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Offline comparison using current source, browser font measurements and web margins.
const root = resolve(import.meta.dirname, '..')
const out = resolve(root, '.tmp/density-audit')
mkdirSync(out, { recursive: true })
const entry = resolve(out, 'entry.ts')
writeFileSync(entry, `
export { parseM3NDocument } from '${root}/packages/notation/src/index.ts';
export { prepareNumberedNotationFonts } from '${root}/packages/numbered-notation/src/index.ts';
export { layoutNativeScore } from '${root}/packages/numbered-notation/src/native-layout.ts';
export { nativeHorizontalSpacing } from '${root}/packages/numbered-notation/src/native-horizontal.ts';
export { renderNativePages } from '${root}/packages/numbered-notation/src/native-svg.ts';
export { renderScoreInto } from '${root}/src/lib/render-score.ts';
export { auditNativeInkCollisions } from '${root}/tools/lib/native-ink-collisions.mjs';
`)
await build({ configFile: false, logLevel: 'error', resolve: { alias: {
  '@m3n/notation': resolve(root, 'packages/notation/src/index.ts'),
  '@m3n/numbered-notation': resolve(root, 'packages/numbered-notation/src/index.ts'),
} }, build: { outDir: resolve(out, 'bundle'), lib: { entry, name: 'density', formats: ['iife'], fileName: () => 'bundle.js' } } })
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser'].find(existsSync), headless: true, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 760, height: 1100 } })
  await page.setContent('<main></main>')
  await page.addScriptTag({ path: resolve(out, 'bundle/bundle.js') })
  await page.evaluate(async () => { await density.prepareNumberedNotationFonts(); await document.fonts.ready })
  const reports = []
  for (const file of readdirSync(resolve(root, 'src/scores')).filter(f => f.endsWith('.m3n'))) {
    const source = readFileSync(resolve(root, 'src/scores', file), 'utf8')
    const cases = await page.evaluate(async ({ source }) => {
      const doc = density.parseM3NDocument(source)
      const stats = values => {
        const sorted = [...values].sort((a, b) => a - b)
        return { min: sorted[0] ?? null, p10: sorted[Math.floor((sorted.length - 1) * .1)] ?? null, median: sorted[Math.floor((sorted.length - 1) * .5)] ?? null, mean: values.reduce((a, b) => a + b, 0) / (values.length || 1), max: sorted.at(-1) ?? null }
      }
      const cases = [...new Set([doc.preferredWidth ?? 720, 700])].flatMap(width => [false, true].map(paged => {
        const layout = density.layoutNativeScore(doc, { width, paged, pageMargin: 0 })
        const rows = layout.systems.map(system => {
          const glyphs = system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs)).filter(g => g.staff === 'melody')
          const gaps = glyphs.slice(1).flatMap((g, i) => glyphs[i].lane === g.lane ? [g.x - (g.musicLeft ?? g.left) - glyphs[i].x - (glyphs[i].musicRight ?? glyphs[i].right)] : [])
          const available = width - (system.arcContinuationLeft !== undefined ? 22 * .45 * 1.2 - (glyphs[0]?.musicLeft ?? 0) : 0)
          return { index: system.index + 1, measures: system.measures.length, notes: glyphs.length, density: density.nativeHorizontalSpacing(system.measures, layout.options).minimumWidth / available, gaps: stats(gaps), top: system.top, bottom: system.bottom, page: system.page }
        })
        const verticalGaps = rows.slice(1).flatMap((r, i) => r.page === rows[i].page ? [r.top - rows[i].bottom] : [])
        const markup = density.renderNativePages(layout)
        if (doc.title.includes('Valsentino') && width === 700) document.querySelector('main').innerHTML = markup.join('')
        return { title: doc.title, width, paged, pages: layout.pages.length, systems: rows.length, heights: layout.pages.map(p => p.height), coreGaps: layout.pages.map(p => p.coreGap), density: stats(rows.map(r => r.density)), notesPerRow: stats(rows.map(r => r.notes)), verticalGaps: stats(verticalGaps), rows, ...(doc.title.includes('Valsentino') ? { markup } : {}) }
      }))
      if (doc.title.includes('Valsentino')) {
        for (const c of cases) {
          await density.renderScoreInto(document.querySelector('main'), { scoreDocument: doc, width: c.width, paged: c.paged })
          const normalized = document.createElement('div')
          normalized.innerHTML = c.markup.join('')
          c.identicalToWeb = normalized.innerHTML === document.querySelector('main').innerHTML
          if (!c.identicalToWeb) throw new Error('Audit layout differs from web output')
          c.collisions = [...document.querySelectorAll('g.system')].flatMap(s => density.auditNativeInkCollisions(s).collisions)
        }
        const probes = [540, 600, 650, 660, 680, 690, 695, 700, 705, 710, 720].map(width => {
          const l = density.layoutNativeScore(doc, { width, paged: true, pageMargin: 0 })
          return { width, pages: l.pages.length, rows: l.systems.length, coreGaps: l.pages.map(p => p.coreGap) }
        })
        cases[0].widthProbes = probes
      }
      return cases
    }, { source })
    reports.push({ file, cases })
    console.log(`${file}: ${cases.map(c => `${c.width}/${c.paged ? 'paged' : 'continuous'}=${c.pages}p,${c.systems}r,${c.density.mean.toFixed(3)}`).join(' ')}`)
    for (const c of cases) if (c.markup) {
      for (const [i, svg] of c.markup.entries()) writeFileSync(resolve(out, `valsentino-${c.width}-${c.paged ? 'paged' : 'continuous'}-${i + 1}.svg`), svg)
      await page.setContent(`<style>body{margin:0;background:white}svg{display:block}</style>${c.markup.join('')}`)
      await page.screenshot({ path: resolve(out, `valsentino-${c.width}-${c.paged ? 'paged' : 'continuous'}.png`), fullPage: true })
      delete c.markup
    }
  }
  writeFileSync(resolve(out, 'report.json'), JSON.stringify({ date: new Date().toISOString(), pageMargin: 0, reports }, null, 2))
} finally { await browser.close() }
