import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { build } from 'vite'

// jpFun remains the production baseline until this independent comparison passes.
// No development server, runtime fallback, network request or baseline regeneration.
const root = resolve(import.meta.dirname, '..')
const temp = mkdtempSync(join(tmpdir(), 'm3n-parity-'))
const baselineRef = 'dbfda72'
const baselineCommit = execFileSync('git', ['rev-parse', `${baselineRef}^{commit}`], { cwd: root, encoding: 'utf8' }).trim()
const candidateCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const candidateDirty = Boolean(execFileSync('git', ['status', '--porcelain', '--', 'packages/numbered-notation', 'tools/compare-numbered-engines.mjs'], { cwd: root, encoding: 'utf8' }).trim())
const runId = new Date().toISOString().replaceAll(':', '-')
const output = join(root, '.tmp', process.argv.includes('--self-check') ? 'numbered-parity-self-check' : 'numbered-parity', runId)
const pixels = process.argv.includes('--pixels') || process.argv.includes('--require-parity')
const allWidths = process.argv.includes('--all-widths')
const screenshots = process.argv.includes('--screenshots')
const selfCheck = process.argv.includes('--self-check')
const widths = allWidths ? [320, 600, 800, 1000] : [800]
const modes = allWidths ? [false, true] : [false]
const scoreFilter = process.argv.find(argument => argument.startsWith('--score='))?.slice(8)
let browser
try {
  mkdirSync(output, { recursive: true })
  const archive = execFileSync('git', ['archive', baselineCommit, 'packages/jpfun', 'packages/numbered-notation', 'tsconfig.package.json'], { cwd: root, maxBuffer: 20 * 1024 * 1024 })
  execFileSync('tar', ['-xf', '-', '-C', temp], { input: archive })
  const entry = join(temp, 'entry.ts')
  writeFileSync(entry, [
    `export {parseM3NDocument} from ${JSON.stringify(join(root, 'packages/notation/src/index.ts'))};`,
    `export {NumberedNotationScore,prepareNumberedNotationFonts} from ${JSON.stringify(join(temp, 'packages/numbered-notation/src/index.ts'))};`,
    `export {NativeNumberedNotationScore} from ${JSON.stringify(join(root, 'packages/numbered-notation/src/native-score.ts'))};`,
  ].join('\n'))
  await build({ configFile: false, logLevel: 'error', resolve: { alias: [
    { find: '@m3n/jpfun', replacement: join(temp, 'packages/jpfun/src/core.ts') },
    { find: '@m3n/notation', replacement: join(root, 'packages/notation/src/index.ts') },
    { find: 'txml/txml', replacement: join(root, 'node_modules/txml/dist/txml.mjs') },
    { find: 'txml', replacement: join(root, 'node_modules/txml/dist/index.mjs') },
  ] }, build: { outDir: join(temp, 'bundle'), emptyOutDir: true, minify: false,
    lib: { entry, name: 'comparison', formats: ['iife'], fileName: () => 'bundle.js' } } })
  const executablePath = process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser'].find(existsSync)
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage({ viewport: { width: 2040, height: 900 }, deviceScaleFactor: 1 })
  await page.setContent('<style>body{margin:0;background:white}main{display:flex;align-items:flex-start;gap:20px}section{flex:none}svg{display:block}</style><main><section id="baseline"></section><section id="candidate"></section></main>')
  await page.addScriptTag({ path: join(temp, 'bundle/bundle.js') })
  await page.evaluate(() => comparison.prepareNumberedNotationFonts())
  const reports = []
  for (const file of readdirSync(join(root, 'src/scores')).filter(file => file.endsWith('.m3n') && (!scoreFilter || file.includes(scoreFilter)))) {
    const source = readFileSync(join(root, 'src/scores', file), 'utf8')
    for (const width of widths) for (const paged of modes) {
      const result = await page.evaluate(async ({ source, width, paged, selfCheck }) => {
        const score = comparison.parseM3NDocument(source)
        const metrics = (root) => {
          const pages = [...root.querySelectorAll('svg')]
          const systems = [...root.querySelectorAll('g.system')].map(system => {
            const digits = [...system.querySelectorAll('g.note text')].filter(node => node.getAttribute('font-size') === '22' && /^[0-7]$/.test(node.textContent))
            const notes = digits.map(node => {
              const box = node.getBBox(), p = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(node.getCTM())
              const group = node.closest('.note')
              const head = [...group.querySelectorAll('text')].filter(text => text.getAttribute('font-size') === '22' && /^[0-7]$/.test(text.textContent)).indexOf(node)
              return { id: group.id, head, x: p.x, y: p.y }
            })
            const melody = notes.filter(note => !note.id.includes('bass'))
            return { ids: notes.map(note => `${note.id}:${note.head}`).sort(), notes, axis: melody[0]?.y ?? 0,
              measures: [...new Set([...system.querySelectorAll('g.note')].map(node => node.getAttribute('data-m3n-measure')))] }
          })
          return { pageCount: pages.length, height: pages.reduce((sum, svg) => sum + svg.viewBox.baseVal.height, 0),
            systems, lineGaps: systems.slice(1).map((system, i) => system.axis - systems[i].axis) }
        }
        for (const [id, engine] of [['baseline', comparison.NumberedNotationScore], ['candidate', selfCheck ? comparison.NumberedNotationScore : comparison.NativeNumberedNotationScore]]) {
          const host = document.getElementById(id)
          host.style.width = `${width}px`
          try { host.innerHTML = engine.create(score).render({ width, paged }).join('') }
          catch (error) { return { title: score.title, error: `${id}: ${error}` } }
        }
        await document.fonts.ready
        const baseline = metrics(document.getElementById('baseline')), candidate = metrics(document.getElementById('candidate'))
        const differingLines = Math.max(baseline.systems.length, candidate.systems.length) - baseline.systems.filter((system, i) => JSON.stringify(system.ids) === JSON.stringify(candidate.systems[i]?.ids)).length
        const oldNotes = new Map(baseline.systems.flatMap(system => system.notes).map(note => [`${note.id}:${note.head}`, note]))
        const shifts = candidate.systems.flatMap(system => system.notes).flatMap(note => {
          const old = oldNotes.get(`${note.id}:${note.head}`)
          return old ? [{ id: note.id, dx: note.x - old.x, dy: note.y - old.y }] : []
        })
        return { title: score.title, baseline, candidate, differingLines,
          maxXShift: Math.max(0, ...shifts.map(shift => Math.abs(shift.dx))), maxYShift: Math.max(0, ...shifts.map(shift => Math.abs(shift.dy))),
          sampleShifts: shifts.filter(shift => Math.abs(shift.dx) > 0.5 || Math.abs(shift.dy) > 0.5).slice(0, 6),
          matches: differingLines === 0 && shifts.length === oldNotes.size && candidate.systems.reduce((n, system) => n + system.notes.length, 0) === oldNotes.size && baseline.pageCount === candidate.pageCount && Math.abs(baseline.height - candidate.height) <= 0.5 && shifts.every(shift => Math.abs(shift.dx) <= 0.5 && Math.abs(shift.dy) <= 0.5) }
      }, { source, width, paged, selfCheck })
      const name = `${file}-${width}-${paged ? 'paged' : 'continuous'}`
      result.geometryMatches = result.matches ?? false
      if (pixels && !result.error) {
        const images = []
        for (const id of ['baseline', 'candidate']) {
          const buffer = await page.locator(`#${id}`).screenshot()
          writeFileSync(join(output, `${name}-${id}.png`), buffer)
          images.push(buffer.toString('base64'))
        }
        result.pixels = await page.evaluate(async images => {
          const decoded = await Promise.all(images.map(base64 => new Promise((resolve, reject) => {
            const image = new Image()
            image.onload = () => resolve(image)
            image.onerror = reject
            image.src = `data:image/png;base64,${base64}`
          })))
          const width = Math.max(...decoded.map(image => image.width)), height = Math.max(...decoded.map(image => image.height))
          const canvases = decoded.map(image => {
            const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
            const context = canvas.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0)
            return context.getImageData(0, 0, width, height)
          })
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
          const context = canvas.getContext('2d'), diff = context.createImageData(width, height)
          let changed = 0, maxChannelDifference = 0
          for (let i = 0; i < diff.data.length; i += 4) {
            const delta = Math.max(...[0, 1, 2, 3].map(c => Math.abs(canvases[0].data[i + c] - canvases[1].data[i + c])))
            maxChannelDifference = Math.max(maxChannelDifference, delta)
            if (delta) changed++
            diff.data.set(delta ? [255, 0, 100, 255] : [255, 255, 255, 255], i)
          }
          context.putImageData(diff, 0, 0)
          return { width, height, changed, ratio: changed / (width * height), maxChannelDifference,
            sameSize: decoded[0].width === decoded[1].width && decoded[0].height === decoded[1].height,
            heatmap: canvas.toDataURL('image/png').split(',')[1] }
        }, images)
        writeFileSync(join(output, `${name}-diff.png`), Buffer.from(result.pixels.heatmap, 'base64'))
        delete result.pixels.heatmap
        result.pixelMatches = result.pixels.sameSize && result.pixels.changed === 0
        result.matches = result.geometryMatches && result.pixelMatches
      }
      if (screenshots && !result.error) await page.locator('main').screenshot({ path: join(output, `${name}.png`) })
      reports.push({ file, width, paged, screenshot: screenshots && !result.error ? `${name}.png` : undefined, ...result })
      if (reports.length % 88 === 0) console.log(`Compared ${reports.length} cases`)
    }
  }
  if (!reports.length) throw new Error('No scores matched the requested filter')
  const summary = { baselineCommit, candidateCommit, candidateDirty, pixelAudit: pixels, geometryMatching: reports.filter(report => report.geometryMatches).length, checks: reports.length, matching: reports.filter(report => report.matches).length, differing: reports.filter(report => !report.matches).length, reports }
  writeFileSync(join(output, 'report.json'), JSON.stringify(summary, null, 2))
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
  writeFileSync(join(output, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>jpFun 与自研排版对照</title><style>body{font:16px sans-serif;margin:24px}article{border-top:1px solid #aaa;margin:24px 0}img{max-width:100%;height:auto}pre{white-space:pre-wrap}</style><h1>jpFun（左）与自研候选（右）</h1><p>${summary.checks} 组，${summary.matching} 组一致，${summary.differing} 组存在差异。像素审计：${pixels ? '已启用，逐通道零差异' : '未启用'}。坐标容差 0.5px；几何一致不等于像素一致，仍须检查字形与关系线。</p>${reports.map(report => `<article><h2>${escape(report.title || report.file)} · ${report.width}px · ${report.paged ? '分页' : '连续'}</h2><pre>${escape(JSON.stringify({error:report.error,geometryMatches:report.geometryMatches,pixelMatches:report.pixelMatches,pixels:report.pixels,baselineSystems:report.baseline?.systems.length,candidateSystems:report.candidate?.systems.length,differingLines:report.differingLines,maxXShift:report.maxXShift,maxYShift:report.maxYShift,baselineLineGaps:report.baseline?.lineGaps,candidateLineGaps:report.candidate?.lineGaps},null,2))}</pre>${report.pixels ? `<p><a href="${escape(`${report.file}-${report.width}-${report.paged ? 'paged' : 'continuous'}`)}-diff.png">像素差异图</a></p>` : ''}${report.screenshot ? `<a href="${escape(report.screenshot)}"><img loading="lazy" src="${escape(report.screenshot)}"></a>` : ''}</article>`).join('')}</html>`)
  console.log(JSON.stringify({ checks: summary.checks, pixelAudit: pixels, geometryMatching: summary.geometryMatching, matching: summary.matching, differing: summary.differing, report: join(output, 'index.html') }, null, 2))
  if (process.argv.includes('--require-parity') && summary.differing) process.exitCode = 1
} finally { await browser?.close(); rmSync(temp, { recursive: true, force: true }) }
