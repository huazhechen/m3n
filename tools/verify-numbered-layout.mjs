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
const screenshots = process.argv.includes('--screenshots')
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
    { file: 'regression-controls-chords-lyrics', source: '{4/4}\nN: 1 2 3 4 | {key=G} {2/4} {80qpm} [1d3d5d:h]^~ | [1d3d5d:h]^ |\nB: 1d 2d 3d 4d | 5d^ | 5d^ |\n---\nN: ||: {4/4} 1 2 3 4 :|||\nB: 1d^ 5d^ |||\nL: (起来，)春(天里)好' },
  )
  const report = await page.evaluate(async (scores) => {
    await m3n.prepareNumberedNotationFonts()
    const issues = [], times = [], summaries = []
    let checks = 0
    for (const { file, source } of scores) for (const width of [320, 600, 800, 1000]) for (const paged of [false, true]) {
      const before = performance.now()
      const scoreDocument = m3n.parseM3NDocument(source)
      let pages
      try {
        const score = m3n.NumberedNotationScore.create(scoreDocument)
        pages = score.render({ width, paged })
        if (width === 800 && !paged) summaries.push({ file, title: scoreDocument.title, events: [...scoreDocument.parts.values()].reduce((sum, part) => sum + [...part.melody, ...part.bass].reduce((sum, measure) => sum + measure.events.length, 0), 0), diagnostics: score.diagnostics })
      } catch (error) {
        issues.push({ file, width, paged, error: String(error) })
        continue
      }
      times.push(performance.now() - before)
      document.querySelector('main').innerHTML = pages.join('')
      await document.fonts.ready
      checks++
      const texts = [...document.querySelectorAll('svg text')]
      for (const [text, size] of [[scoreDocument.title, '32'], [scoreDocument.subtitle, '16']]) {
        if (!text) continue
        const heading = texts.find(node => node.textContent === text && node.getAttribute('font-size') === size)
        const box = heading?.getBBox()
        if (!box || Math.abs(box.x + box.width / 2 - width / 2) > 0.5) {
          issues.push({ file, width, paged, heading: text, center: box ? box.x + box.width / 2 : null })
        }
        if (scoreDocument.subtitle && box) for (const other of heading.ownerSVGElement.querySelectorAll('text')) {
          if (other === heading) continue
          const otherBox = other.getBBox()
          if (Math.min(box.x + box.width, otherBox.x + otherBox.width) - Math.max(box.x, otherBox.x) > 0.5
            && Math.min(box.y + box.height, otherBox.y + otherBox.height) - Math.max(box.y, otherBox.y) > 0.5) {
            issues.push({ file, width, paged, heading: text, overlap: other.textContent })
          }
        }
      }
      for (const tempo of texts.filter(node => /^= \d+(?:\.\d+)?$/.test(node.textContent))) {
        if (tempo.getAttribute('font-family') !== 'M3N Numbers') {
          issues.push({ file, width, paged, tempo: tempo.textContent, font: tempo.getAttribute('font-family') })
        }
      }
      const annotations = texts.filter(node => node.getAttribute('data-m3n-role') === 'annotation')
      for (const annotation of annotations) {
        const note = annotation.ownerSVGElement.querySelector(`g.note[data-m3n-id="${annotation.getAttribute('data-m3n-id')}"]`)
        const box = annotation.getBBox(), host = note?.getBBox()
        if (!host || box.y + box.height > host.y + 1) issues.push({ file, width, paged, annotation: annotation.textContent, host: note?.id })
      }
      if (file === 'ban_yin_jie_kou_qin_ji_ben_gong_01.m3n') {
        for (const [section, instruction] of [['机能训练', '快速吹吸切换'], ['音阶模进训练', '音阶(替代音)']]) {
          const a = annotations.find(node => node.textContent === section)?.getBBox()
          const b = annotations.find(node => node.textContent === instruction)?.getBBox()
          if (!a || !b || a.y + a.height >= b.y) issues.push({ file, width, paged, section, instruction, order: 'incorrect' })
        }
        if (width === 1000) for (const system of document.querySelectorAll('g.system')) {
          const right = Math.max(...[...system.querySelectorAll('g.measure')].map(measure => Number(measure.getAttribute('data-m3n-measure-end'))))
          if (Math.abs(right - (width - 32)) > 0.5) issues.push({ file, width, paged, system: system.id, right, alignment: 'incomplete' })
        }
      }
      if (file === 'super_mario_01.m3n' && width >= 800) {
        const first = document.querySelector('g.system')
        const measures = [...new Set([...first.querySelectorAll('g.note')].map(node => node.getAttribute('data-m3n-measure')))]
        if (measures.join(',') !== 'm3n-measure-1-1,m3n-measure-1-2,m3n-measure-1-3') issues.push({ file, width, paged, shortIntroduction: measures })
      }
      const outside = [], overlap = [], noteOverlap = []
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
        const lyrics = [...svg.querySelectorAll('text[data-m3n-role="lyric"],text[data-m3n-role="lyric-prefix"]')]
          .filter(element => element.textContent.trim().replaceAll('\u200B', ''))
        for (let i = 0; i < lyrics.length; i++) for (let j = i + 1; j < lyrics.length; j++) {
          const a = lyrics[i].getBBox(), b = lyrics[j].getBBox()
          if (Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5) {
            overlap.push([lyrics[i].textContent, lyrics[j].textContent])
          }
        }
        const digits = [...svg.querySelectorAll('g.note text')].filter(element => /^[0-7]$/.test(element.textContent))
        for (let i = 0; i < digits.length; i++) for (let j = i + 1; j < digits.length; j++) {
          const a = digits[i].getBBox(), b = digits[j].getBBox()
          if (Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5) {
            noteOverlap.push([digits[i].closest('.note').id, digits[j].closest('.note').id])
          }
        }
      }
      if (outside.length || overlap.length || noteOverlap.length) issues.push({ file, width, paged, outside: outside.slice(0, 3), outsideCount: outside.length, overlap: overlap.slice(0, 3), overlapCount: overlap.length, noteOverlap: noteOverlap.slice(0, 3), noteOverlapCount: noteOverlap.length })
    }
    times.sort((a, b) => a - b)
    return { checks, issues, scores: summaries.map(score => ({ ...score, checks: 8, issues: issues.filter(issue => issue.file === score.file).length })), timing: { p50: times[Math.floor(times.length * .5)], p95: times[Math.floor(times.length * .95)], max: times.at(-1) } }
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
  if (screenshots) {
    const auditOutput = join(output, 'numbered-audit')
    mkdirSync(auditOutput, { recursive: true })
    for (const { file, source } of scores) for (const [width, paged] of [[800, false], [320, true]]) {
      await page.evaluate(async ({ source, width, paged }) => {
        const main = document.querySelector('main')
        main.style.width = `${width}px`
        main.innerHTML = m3n.NumberedNotationScore.create(m3n.parseM3NDocument(source)).render({ width, paged }).join('')
        await document.fonts.ready
      }, { source, width, paged })
      await page.locator('main').screenshot({ path: join(auditOutput, `${file}-${width}.png`) })
    }
    const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
    writeFileSync(join(auditOutput, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>简谱逐曲检查</title><style>body{font-family:serif;margin:24px;background:#eee}article{margin:24px 0;background:white;padding:16px}figure{display:flex;align-items:flex-start;gap:16px;margin:0}img{max-width:100%;height:auto}a{display:block;max-width:72%}a+ a{max-width:28%}</style><h1>简谱逐曲检查</h1><p>800px 连续排版与 320px 分页；点击查看原图。几何结果见 manifest.json。</p>${report.scores.map(score => `<article><h2>${escape(score.title || score.file)}</h2><p>${escape(score.file)} · ${score.events} 个事件 · ${score.issues ? `${score.issues} 个问题` : '几何检查通过'}</p><figure><a href="${score.file}-800.png"><img loading="lazy" src="${score.file}-800.png" alt="800px 连续"></a><a href="${score.file}-320.png"><img loading="lazy" src="${score.file}-320.png" alt="320px 分页"></a></figure></article>`).join('')}</html>`)
    writeFileSync(join(auditOutput, 'manifest.json'), JSON.stringify(report, null, 2))
    console.log(`逐曲截图：${join(auditOutput, 'index.html')}`)
  }
  assert.equal(report.issues.length, 0, JSON.stringify(report.issues.slice(0, 10), null, 2))
} finally {
  await browser?.close()
  rmSync(temp, { recursive: true, force: true })
}
