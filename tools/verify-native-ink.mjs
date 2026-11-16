import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { chromium } from '@playwright/test'

// Independent browser audit of the painted SVG, not its layout helper bounds.
// No server and no reference-engine coordinate fitting.
const root = resolve(import.meta.dirname, '..'), temp = mkdtempSync(join(tmpdir(), 'm3n-ink-'))
const output = join(root, '.tmp/native-ink', new Date().toISOString().replaceAll(':', '-'))
const supplied = process.argv.find(a => a.startsWith('--sources='))?.slice(10)
const collisionAudit = process.argv.includes('--collisions')
const filter = process.argv.find(a => a.startsWith('--score='))?.slice(8)
const sources = supplied ? JSON.parse(readFileSync(resolve(supplied), 'utf8')) : Object.fromEntries(readdirSync(join(root, 'src/scores')).filter(f => f.endsWith('.m3n')).map(f => [f, readFileSync(join(root, 'src/scores', f), 'utf8')]))
let browser
try {
  mkdirSync(output, { recursive: true })
  writeFileSync(join(output, 'sources.json'), JSON.stringify(sources, null, 2))
  const entry = join(temp, 'entry.ts')
  writeFileSync(entry, `export {auditNativeInkCollisions} from ${JSON.stringify(join(root, 'tools/lib/native-ink-collisions.mjs'))};\nexport {parseM3NDocument} from ${JSON.stringify(join(root, 'packages/notation/src/index.ts'))};\nexport {prepareNumberedNotationFonts} from ${JSON.stringify(join(root, 'packages/numbered-notation/src/index.ts'))};\nexport {NativeNumberedNotationScore} from ${JSON.stringify(join(root, 'packages/numbered-notation/src/native-score.ts'))};`)
  await build({ configFile: false, logLevel: 'error', resolve: { alias: [
    { find: '@m3n/notation', replacement: join(root, 'packages/notation/src/index.ts') },
    { find: '@m3n/jpfun', replacement: join(root, 'packages/jpfun/src/core.ts') },
    { find: 'txml/txml', replacement: join(root, 'node_modules/txml/dist/txml.mjs') },
    { find: 'txml', replacement: join(root, 'node_modules/txml/dist/index.mjs') },
  ] }, build: { outDir: join(temp, 'bundle'), emptyOutDir: true, minify: false, lib: { entry, name: 'audit', formats: ['iife'], fileName: () => 'bundle.js' } } })
  const executablePath = process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser'].find(existsSync)
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setContent('<main></main>')
  await page.addScriptTag({ path: join(temp, 'bundle/bundle.js') })
  await page.evaluate(async () => { await audit.prepareNumberedNotationFonts(); await document.fonts.ready })
  const reports = []
  for (const [file, source] of Object.entries(sources).filter(([f]) => !filter || f.includes(filter))) {
    for (const width of [320, 600, 800, 1000]) for (const paged of [false, true]) for (const uniformSystemHeight of [false, true]) {
      const result = await page.evaluate(({ source, width, paged, uniformSystemHeight, collisionAudit }) => {
        try {
          document.querySelector('main').innerHTML = audit.NativeNumberedNotationScore.create(audit.parseM3NDocument(source)).render({ width, paged, uniformSystemHeight, measureNumbers: true }).join('')
          const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'), violations = [], collisions = [], clipping = []
          let primitives = 0, systems = 0, collisionCandidates = 0, collisionLabels = 0
          for (const system of document.querySelectorAll('g.system')) {
            systems++
            let top = Infinity, bottom = -Infinity
            for (const node of system.querySelectorAll('path,line,rect,circle,ellipse,text')) {
              primitives++
              const style = getComputedStyle(node), matrix = node.ownerSVGElement.getCTM().inverse().multiply(node.getCTM())
              let box
              if (node.tagName === 'text') {
                ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
                const m = ctx.measureText(node.textContent), anchor = node.getAttribute('text-anchor')
                const x = Number(node.getAttribute('x')) - (anchor === 'middle' ? m.width / 2 : anchor === 'end' ? m.width : 0), y = Number(node.getAttribute('y'))
                box = { x: x - m.actualBoundingBoxLeft, y: y - m.actualBoundingBoxAscent, width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight, height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent }
              } else box = node.getBBox()
              const half = style.stroke !== 'none' ? parseFloat(style.strokeWidth) / 2 : 0
              const a = new DOMPoint(box.x - half, box.y - half).matrixTransform(matrix), b = new DOMPoint(box.x + box.width + half, box.y + box.height + half).matrixTransform(matrix)
              top = Math.min(top, a.y, b.y); bottom = Math.max(bottom, a.y, b.y)
              const pageWidth = node.ownerSVGElement.viewBox.baseVal.width
              if (a.x < -0.01 || b.x > pageWidth + 0.01) clipping.push({ system: system.id, tag: node.tagName, role: node.closest('[data-m3n-role]')?.getAttribute('data-m3n-role'), text: node.textContent, actual: [a.x, b.x], pageWidth })
              const reservedTop = Number(system.getAttribute('data-m3n-top')), reservedBottom = Number(system.getAttribute('data-m3n-bottom'))
              if (a.y < reservedTop - 0.01 || b.y > reservedBottom + 0.01) violations.push({ system: system.id, tag: node.tagName, role: node.closest('[data-m3n-role]')?.getAttribute('data-m3n-role'), text: node.textContent, actual: [a.y, b.y], reserved: [reservedTop, reservedBottom] })
            }
          }
          if (collisionAudit) for (const system of document.querySelectorAll('g.system')) {
            const checked = audit.auditNativeInkCollisions(system)
            collisionCandidates += checked.candidates; collisionLabels += checked.labels
            for (const collision of checked.collisions) collisions.push({ system: system.id, ...collision })
          }
          return { systems, primitives, violations, clipping, ...(collisionAudit ? { collisions, collisionCandidates, collisionLabels } : {}) }
        } catch (e) { return { error: String(e) } }
      }, { source, width, paged, uniformSystemHeight, collisionAudit })
      reports.push({ file, width, paged, uniformSystemHeight, ...result })
    }
  }
  const summary = { cases: reports.length, clipping: reports.reduce((n, r) => n + (r.clipping?.length ?? 0), 0), errors: reports.filter(r => r.error).length, violations: reports.reduce((n, r) => n + (r.violations?.length ?? 0), 0), failingCases: reports.filter(r => r.violations?.length).length, ...(collisionAudit ? { collisionCandidates: reports.reduce((n, r) => n + (r.collisionCandidates ?? 0), 0), collisionLabels: reports.reduce((n, r) => n + (r.collisionLabels ?? 0), 0), collisions: reports.reduce((n, r) => n + (r.collisions?.length ?? 0), 0), collisionCases: reports.filter(r => r.collisions?.length).length } : {}) }
  writeFileSync(join(output, 'report.json'), JSON.stringify({ summary, reports }, null, 2))
  console.log(JSON.stringify({ output, ...summary }))
  if (summary.errors || summary.violations || summary.clipping || summary.collisions) process.exitCode = 1
} finally { await browser?.close(); rmSync(temp, { recursive: true, force: true }) }
