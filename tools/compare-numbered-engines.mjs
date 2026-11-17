import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { build } from 'vite'
import { createHash } from 'node:crypto'

// jpFun remains the production baseline until this independent comparison passes.
// No development server, runtime fallback, network request or baseline regeneration.
const root = resolve(import.meta.dirname, '..')
const temp = mkdtempSync(join(tmpdir(), 'm3n-parity-'))
const baselineRef = process.argv.find(argument => argument.startsWith('--baseline-ref='))?.slice('--baseline-ref='.length)
const candidateRef = process.argv.find(argument => argument.startsWith('--candidate-ref='))?.slice('--candidate-ref='.length)
const baselineCommit = execFileSync('git', ['rev-parse', `${baselineRef ?? 'HEAD'}^{commit}`], { cwd: root, encoding: 'utf8' }).trim()
const candidateCommit = execFileSync('git', ['rev-parse', `${candidateRef ?? 'HEAD'}^{commit}`], { cwd: root, encoding: 'utf8' }).trim()
const candidateDirty = !candidateRef && Boolean(execFileSync('git', ['status', '--porcelain', '--', 'packages/numbered-notation', 'tools/compare-numbered-engines.mjs'], { cwd: root, encoding: 'utf8' }).trim())
const runId = `${new Date().toISOString().replaceAll(':', '-')}-${process.pid}`
const output = join(root, '.tmp', process.argv.includes('--self-check') ? 'numbered-parity-self-check' : 'numbered-parity', runId)
const pixels = process.argv.includes('--pixels') || process.argv.includes('--require-parity')
const allWidths = process.argv.includes('--all-widths')
const screenshots = process.argv.includes('--screenshots')
const selfCheck = process.argv.includes('--self-check')
const widths = allWidths ? [320, 600, 800, 1000] : [800]
const modes = allWidths ? [false, true] : [false]
const scoreFilter = process.argv.find(argument => argument.startsWith('--score='))?.slice(8)
const renderOptionsPath = process.argv.find(argument => argument.startsWith('--render-options='))?.slice(17)
const renderOptions = renderOptionsPath ? JSON.parse(readFileSync(resolve(renderOptionsPath), 'utf8')) : {}
const sourcesPath = process.argv.find(argument => argument.startsWith('--sources='))?.slice(10)
// Snapshot inputs before asynchronous work, so concurrent score edits cannot
// change a running matrix or invalidate a before/after comparison.
const sources = sourcesPath ? JSON.parse(readFileSync(resolve(sourcesPath), 'utf8')) : Object.fromEntries(
  readdirSync(join(root, 'src/scores')).filter(file => file.endsWith('.m3n')).map(file => [file, readFileSync(join(root, 'src/scores', file), 'utf8')]))
let browser
try {
  mkdirSync(output, { recursive: true })
  writeFileSync(join(output, 'sources.json'), JSON.stringify(sources, null, 2))
  // Capture both implementations before building, without touching live scores.
  const currentRoot = join(temp, 'current'), snapshotHashes = {}
  for (const pkg of ['jpfun', 'numbered-notation', 'notation']) {
    const target = join(currentRoot, 'packages', pkg, 'src')
    mkdirSync(target, { recursive: true })
    cpSync(join(root, 'packages', pkg, 'src'), target, { recursive: true })
    for (const file of readdirSync(target, { recursive: true }).filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'))) {
      snapshotHashes[`packages/${pkg}/src/${file}`] = createHash('sha256').update(readFileSync(join(target, file))).digest('hex')
    }
  }
  const referenceRoot = baselineRef ? join(temp, 'baseline') : currentRoot
  if (baselineRef) {
    mkdirSync(referenceRoot)
    const archive = execFileSync('git', ['archive', baselineCommit, 'packages/jpfun', 'packages/numbered-notation', 'tsconfig.package.json'], { cwd: root, maxBuffer: 20 * 1024 * 1024 })
    execFileSync('tar', ['-xf', '-', '-C', referenceRoot], { input: archive })
  }
  const candidateRoot = candidateRef ? join(temp, 'candidate') : currentRoot
  if (candidateRef) {
    mkdirSync(candidateRoot)
    const candidateArchive = execFileSync('git', ['archive', candidateCommit, 'packages/numbered-notation', 'tsconfig.package.json'], { cwd: root, maxBuffer: 20 * 1024 * 1024 })
    execFileSync('tar', ['-xf', '-', '-C', candidateRoot], { input: candidateArchive })
  }
  const entry = join(temp, 'entry.ts')
  writeFileSync(entry, [
    `export {captureNumberedGeometry} from ${JSON.stringify(join(root, 'tools/lib/numbered-svg-metrics.mjs'))};`,
    `export {parseM3NDocument} from ${JSON.stringify(join(currentRoot, 'packages/notation/src/index.ts'))};`,
    `export {NumberedNotationScore,prepareNumberedNotationFonts} from ${JSON.stringify(join(referenceRoot, 'packages/numbered-notation/src/index.ts'))};`,
    `export {NativeNumberedNotationScore} from ${JSON.stringify(join(candidateRoot, 'packages/numbered-notation/src/native-score.ts'))};`,
  ].join('\n'))
  await build({ configFile: false, logLevel: 'error', resolve: { alias: [
    { find: '@m3n/jpfun', replacement: join(referenceRoot, 'packages/jpfun/src/core.ts') },
    { find: '@m3n/notation', replacement: join(currentRoot, 'packages/notation/src/index.ts') },
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
  for (const [file, source] of Object.entries(sources).filter(([file]) => !scoreFilter || file.includes(scoreFilter))) {
    for (const width of widths) for (const paged of modes) {
      const result = await page.evaluate(async ({ source, width, paged, selfCheck, renderOptions }) => {
        const score = comparison.parseM3NDocument(source)
        const metrics = comparison.captureNumberedGeometry
        for (const [id, engine] of [['baseline', comparison.NumberedNotationScore], ['candidate', selfCheck ? comparison.NumberedNotationScore : comparison.NativeNumberedNotationScore]]) {
          const host = document.getElementById(id)
          host.style.width = `${width}px`
          try { host.innerHTML = engine.create(score).render({ ...renderOptions, width, paged }).join('') }
          catch (error) { return { title: score.title, error: `${id}: ${error}` } }
        }
        await document.fonts.ready
        const baseline = metrics(document.getElementById('baseline')), candidate = metrics(document.getElementById('candidate'))
        const differingLines = Math.max(baseline.systems.length, candidate.systems.length) - baseline.systems.filter((system, i) => JSON.stringify(system.ids) === JSON.stringify(candidate.systems[i]?.ids)).length
        const oldNotes = new Map(baseline.systems.flatMap(system => system.notes).map(note => [`${note.id}:${note.head}`, note]))
        const shifts = candidate.systems.flatMap(system => system.notes).flatMap(note => {
          const old = oldNotes.get(`${note.id}:${note.head}`)
          return old ? [{ id: note.id, dx: note.x - old.x, dy: note.y - old.y, digitMatches: note.digit === old.digit }] : []
        })
        return { title: score.title, baseline, candidate, differingLines,
          digitMismatches: shifts.filter(shift => !shift.digitMatches).length,
          maxXShift: Math.max(0, ...shifts.map(shift => Math.abs(shift.dx))), maxYShift: Math.max(0, ...shifts.map(shift => Math.abs(shift.dy))),
          sampleShifts: shifts.filter(shift => Math.abs(shift.dx) > 0.5 || Math.abs(shift.dy) > 0.5).slice(0, 6),
          matches: differingLines === 0 && shifts.length === oldNotes.size && candidate.systems.reduce((n, system) => n + system.notes.length, 0) === oldNotes.size && baseline.pageCount === candidate.pageCount && Math.abs(baseline.height - candidate.height) <= 0.5 && shifts.every(shift => shift.digitMatches && Math.abs(shift.dx) <= 0.5 && Math.abs(shift.dy) <= 0.5) }
      }, { source, width, paged, selfCheck, renderOptions })
      const name = `${file}-${width}-${paged ? 'paged' : 'continuous'}`
      result.sourceHash = createHash('sha256').update(source).digest('hex')
      result.geometryMatches = result.matches ?? false
      if (pixels && !result.error) {
        const images = []
        for (const id of ['baseline', 'candidate']) {
          // Rasterize at the same viewport origin. Translating vector paths
          // across a wide side-by-side canvas can change Skia edge rounding,
          // even for byte-identical SVGs; cropping afterwards cannot undo it.
          await page.evaluate(id => {
            document.querySelector('main').style.display = 'block'
            for (const host of document.querySelectorAll('main > section')) host.style.display = host.id === id ? 'block' : 'none'
          }, id)
          const buffer = await page.locator(`#${id}`).screenshot()
          writeFileSync(join(output, `${name}-${id}.png`), buffer)
          images.push(buffer.toString('base64'))
        }
        await page.evaluate(() => {
          document.querySelector('main').style.display = 'flex'
          for (const host of document.querySelectorAll('main > section')) host.style.display = 'block'
        })
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
            const data = context.getImageData(0, 0, width, height)
            canvas.width = canvas.height = 0
            return data
          })
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
          const context = canvas.getContext('2d'), diff = context.createImageData(width, height)
          let changed = 0, maxChannelDifference = 0
          const before = canvases[0].data, after = canvases[1].data, output = diff.data
          for (let i = 0; i < diff.data.length; i += 4) {
            const delta = Math.max(Math.abs(before[i] - after[i]), Math.abs(before[i + 1] - after[i + 1]),
              Math.abs(before[i + 2] - after[i + 2]), Math.abs(before[i + 3] - after[i + 3]))
            maxChannelDifference = Math.max(maxChannelDifference, delta)
            if (delta) changed++
            output[i] = 255; output[i + 1] = delta ? 0 : 255; output[i + 2] = delta ? 100 : 255; output[i + 3] = 255
          }
          context.putImageData(diff, 0, 0)
          const heatmap = canvas.toDataURL('image/png').split(',')[1]
          canvas.width = canvas.height = 0
          return { width, height, changed, ratio: changed / (width * height), maxChannelDifference,
            sameSize: decoded[0].width === decoded[1].width && decoded[0].height === decoded[1].height,
            heatmap }
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
  const summary = { renderOptions, referenceImplementation: baselineRef ? `git:${baselineCommit}` : 'current-working-tree-snapshot', candidateImplementation: candidateRef ? `git:${candidateCommit}` : 'current-working-tree-snapshot', domainImplementation: 'current-working-tree-snapshot', snapshotHashes, baselineCommit, candidateCommit, candidateDirty, candidatePageSpacing: selfCheck ? 'baseline' : 'natural', pixelAudit: pixels, geometryMatching: reports.filter(report => report.geometryMatches).length, checks: reports.length, matching: reports.filter(report => report.matches).length, differing: reports.filter(report => !report.matches).length, reports }
  writeFileSync(join(output, 'report.json'), JSON.stringify(summary, null, 2))
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
  writeFileSync(join(output, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>jpFun 与自研排版对照</title><style>body{font:16px sans-serif;margin:24px}article{border-top:1px solid #aaa;margin:24px 0}img{max-width:100%;height:auto}pre{white-space:pre-wrap}</style><h1>jpFun（左）与自研候选（右，自然行距）</h1><p>${summary.checks} 组，${summary.matching} 组一致，${summary.differing} 组存在差异。像素审计：${pixels ? '已启用，逐通道零差异' : '未启用'}。两版均采用当前自然分页规则；指定历史参考版本时，旧行为的差异也照实记录。坐标容差 0.5px；几何一致不等于像素一致，仍须检查字形与关系线。</p>${reports.map(report => `<article><h2>${escape(report.title || report.file)} · ${report.width}px · ${report.paged ? '分页' : '连续'}</h2><pre>${escape(JSON.stringify({error:report.error,geometryMatches:report.geometryMatches,digitMismatches:report.digitMismatches,pixelMatches:report.pixelMatches,pixels:report.pixels,baselineSystems:report.baseline?.systems.length,candidateSystems:report.candidate?.systems.length,differingLines:report.differingLines,maxXShift:report.maxXShift,maxYShift:report.maxYShift,baselineLineGaps:report.baseline?.lineGaps,candidateLineGaps:report.candidate?.lineGaps},null,2))}</pre>${report.pixels ? `<p><a href="${escape(`${report.file}-${report.width}-${report.paged ? 'paged' : 'continuous'}`)}-diff.png">像素差异图</a></p>` : ''}${report.screenshot ? `<a href="${escape(report.screenshot)}"><img loading="lazy" src="${escape(report.screenshot)}"></a>` : ''}</article>`).join('')}</html>`)
  console.log(JSON.stringify({ checks: summary.checks, pixelAudit: pixels, geometryMatching: summary.geometryMatching, matching: summary.matching, differing: summary.differing, report: join(output, 'index.html') }, null, 2))
  if ((selfCheck || process.argv.includes('--require-parity')) && summary.differing) process.exitCode = 1
} finally { await browser?.close(); rmSync(temp, { recursive: true, force: true }) }
