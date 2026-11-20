import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPreferredWidth } from './scorebook-source.mjs'
import { chooseBestWidth, widthSearchStrategy } from './scorebook-width.mjs'

const root = resolve(import.meta.dirname, '..')
const recordPath = join(root, 'config/score-artifacts.json')
const assetPath = join(root, 'packages/numbered-notation/src/font-assets')
const fontManifestFile = 'packages/numbered-notation/src/font-resources.ts'
const hash = value => createHash('sha256').update(value).digest('hex')
const read = file => readFileSync(join(root, file))
const filesBelow = directory => readdirSync(join(root, directory), { recursive: true }).map(file => `${directory}/${file.replaceAll('\\', '/')}`)

export function sourceFiles() {
  return ['src/scores', 'src/works', 'src/examples'].flatMap(filesBelow).filter(file => file.endsWith('.m3n')).sort()
}

function rendererInputs() {
  const inputs = ['packages/notation/src', 'packages/numbered-notation/src'].flatMap(filesBelow)
    .filter(file => /\.(ts|json)$/.test(file) && !file.endsWith('.test.ts') && !file.endsWith('/font-resources.ts'))
  inputs.push('src/lib/render-score.ts', 'tools/scorebook-width.mjs', 'tools/changed-score-layout.mjs', 'tools/scorebook-layout.mjs', 'tools/prepare-score-fonts.py', 'tools/subset-builtin-pdf-font.py', 'tools/fonts/NotoSansCJKsc-Regular.otf')
  for (const file of readdirSync(assetPath).filter(file => /^(Barlow|Bravura)/.test(file))) inputs.push(`packages/numbered-notation/src/font-assets/${file}`)
  return [...new Set(inputs)].sort()
}

export function rendererFingerprint() {
  const digest = createHash('sha256')
  for (const file of rendererInputs()) digest.update(file).update(read(file))
  return digest.digest('hex')
}

function previousRecord() {
  return existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : { entries: {} }
}

export function staleScores() {
  const previous = previousRecord(), fingerprint = rendererFingerprint()
  const stale = sourceFiles().filter(file => {
    const entry = previous.entries[file]
    return previous.rendererSha256 !== fingerprint || previous.strategy !== widthSearchStrategy || previous.fontManifestSha256 !== hash(read(fontManifestFile)) || !entry || entry.sourceSha256 !== hash(read(file))
      || !existsSync(join(assetPath, entry.font)) || entry.fontSha256 !== hash(readFileSync(join(assetPath, entry.font)))
  })
  const deleted = Object.keys(previous.entries).filter(file => !existsSync(join(root, file)))
  return { previous, fingerprint, stale, deleted }
}

function python() {
  for (const command of [process.env.M3N_FONT_PYTHON, join(root, '.tmp/font-subset-env/bin/python'), 'python3'].filter(Boolean)) {
    try { execFileSync(command, ['-c', 'import fontTools, brotli; assert fontTools.__version__ == "4.68.0" and brotli.__version__ == "1.2.1"'], { stdio: 'ignore' }); return command } catch { /* Try the next installed interpreter. */ }
  }
  throw new Error('字体生成需要 fonttools==4.68.0 和 brotli==1.2.1。创建 .tmp/font-subset-env 并安装，或设置 M3N_FONT_PYTHON。')
}

export function assertFullyStaged(files, cwd = root) {
  const dirty = new Set(execFileSync('git', ['diff', '--name-only', '-z'], { cwd }).toString().split('\0'))
  for (const file of execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd }).toString().split('\0')) dirty.add(file)
  const partial = files.filter(file => dirty.has(file))
  if (partial.length) throw new Error(`这些排版输入含未暂存改动，请先完整暂存再提交：\n${partial.join('\n')}`)
}

export async function prepareScoreArtifacts({ check = false, staged = false } = {}) {
  if (staged) assertFullyStaged([...sourceFiles(), ...rendererInputs()])
  const { previous, fingerprint, stale, deleted } = staleScores()
  if (check) {
    assert(!stale.length && !deleted.length, `乐谱生成结果过期，请运行 npm run prepare:scores：\n${[...stale, ...deleted].join('\n')}`)
    console.log('Numbered widths and font subsets match every score and the renderer; staff generation is deferred.')
    return
  }
  if (!stale.length && !deleted.length) { console.log('Score artifacts are current.'); return }
  if (staged) assertFullyStaged(stale)
  const interpreter = python()
  console.log(`Preparing ${stale.length} scores: numbered width and font subset (staff generation deferred).`)
  const work = join(root, '.tmp/score-artifacts')
  mkdirSync(work, { recursive: true })
  const snapshots = new Map(stale.map(file => [file, read(file).toString()]))
  const results = new Map()
  const progressPath = join(work, 'progress.json')
  const progress = existsSync(progressPath) ? JSON.parse(readFileSync(progressPath, 'utf8')) : {}
  for (const file of stale) {
    const cached = progress[file]
    if (cached?.fingerprint === fingerprint && cached.sourceSha256 === hash(snapshots.get(file))) results.set(file, cached.result)
  }
  if (stale.length) {
    execFileSync('npm', ['run', 'build:packages'], { cwd: root, stdio: 'inherit' })
    const { build } = await import('vite')
    const { chromium } = await import('@playwright/test')
    await build({ configFile: false, logLevel: 'error', base: '/', define: { 'import.meta.url': JSON.stringify('http://score-artifacts.local/bundle.js') }, build: {
      outDir: join(work, 'bundle'), emptyOutDir: true, minify: false,
      lib: { entry: join(root, 'tools/changed-score-layout.mjs'), name: 'scoreArtifacts', formats: ['iife'], fileName: () => 'bundle.js' },
    } })
    const queue = stale.filter(file => !results.has(file))
    await Promise.all(Array.from({ length: Math.min(Math.max(1, Number(process.env.M3N_SCORE_WORKERS) || 1), queue.length) }, async () => {
      const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/sbin/chromium'].find(existsSync), headless: true })
      try {
        while (queue.length) {
          const file = queue.shift(), source = snapshots.get(file)
          const page = await browser.newPage()
          try {
            await page.route('http://score-artifacts.local/**', route => {
              const pathname = new URL(route.request().url()).pathname
              if (pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body></body></html>' })
              if (pathname === '/bundle.js') return route.fulfill({ contentType: 'application/javascript; charset=utf-8', path: join(work, 'bundle/bundle.js') })
              return route.abort()
            })
            await page.goto('http://score-artifacts.local/')
            await page.addScriptTag({ url: 'http://score-artifacts.local/bundle.js' })
            const numberedResult = await page.evaluate(source => window.scoreArtifacts.searchNumbered(source), source)
            const numbered = chooseBestWidth(numberedResult.candidates)
            assert(numbered, `${file}: no safe numbered width: ${JSON.stringify(numberedResult.candidates)}`)
            results.set(file, { numberedWidth: numbered.width, numberedPages: numbered.pageCount })
            progress[file] = { fingerprint, sourceSha256: hash(source), result: results.get(file) }
            writeFileSync(progressPath + '.tmp', JSON.stringify(progress)); renameSync(progressPath + '.tmp', progressPath)
            console.log(`${results.size}/${stale.length} ${file}: ${numbered.width}px`)
          } finally { await page.close() }
        }
      } finally { await browser.close() }
    }))
  }
  // Do not overwrite an edit made while the browser was measuring.
  for (const [file, source] of snapshots) assert.equal(read(file).toString(), source, `乐谱在生成期间发生变化：${file}`)
  assert.equal(fingerprint, rendererFingerprint(), 'Renderer changed while preparing scores; rerun the command.')
  for (const [file, result] of results) {
    const source = withPreferredWidth(snapshots.get(file), result.numberedWidth)
    writeFileSync(join(root, file), source)
  }
  execFileSync(interpreter, ['tools/prepare-score-fonts.py'], { cwd: root, stdio: 'inherit' })
  const { CJK_FONTS, LATIN_FONTS, BRAVURA_FONTS } = await import('../packages/numbered-notation/src/font-resources.ts?prepared=' + Date.now())
  const entries = { ...previous.entries }
  for (const file of deleted) delete entries[file]
  for (const file of sourceFiles()) {
    const result = results.get(file) ?? previous.entries[file]
    const source = read(file).toString()
    const chars = [...new Set(source + '演唱作词作曲音域：')].filter(c => !/\s|[\u200B\u2800]/u.test(c) && !LATIN_FONTS[0].characters.includes(c) && !BRAVURA_FONTS[0].characters.includes(c))
    const font = CJK_FONTS.filter(font => chars.every(c => font.characters.includes(c))).sort((a, b) => a.bytes - b.bytes)[0]
    assert(font, `Missing font subset: ${file}`)
    entries[file] = { ...result, sourceSha256: hash(source), font: font.file, fontSha256: hash(readFileSync(fileURLToPath(font.url))) }
  }
  assert.equal(fingerprint, rendererFingerprint(), 'Renderer changed while preparing scores; rerun the command.')
  const output = JSON.stringify({ version: 1, staffGeneration: 'deferred', rendererSha256: fingerprint, fontManifestSha256: hash(read(fontManifestFile)), strategy: widthSearchStrategy, entries }, null, 2) + '\n'
  writeFileSync(recordPath + '.tmp', output); renameSync(recordPath + '.tmp', recordPath)
  assert.equal(fingerprint, rendererFingerprint(), 'Renderer changed while preparing scores; rerun the command.')
  if (staged) execFileSync('git', ['add', '--', ...stale, 'config/score-artifacts.json', 'packages/numbered-notation/src/font-assets', 'packages/numbered-notation/src/font-resources.ts'], { cwd: root, stdio: 'inherit' })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check')
  const lock = join(root, '.tmp/score-artifacts/generation.lock')
  let locked = false
  try {
    if (!check) {
      mkdirSync(join(root, '.tmp/score-artifacts'), { recursive: true })
      if (existsSync(lock)) {
        const pid = Number(readFileSync(lock, 'utf8'))
        let alive = false
        if (pid > 0) try { process.kill(pid, 0); alive = true } catch { /* Previous generation ended. */ }
        assert(!alive, `Another score generation is running (PID ${pid}).`)
        unlinkSync(lock)
      }
      writeFileSync(lock, String(process.pid), { flag: 'wx' }); locked = true
    }
    await prepareScoreArtifacts({ check, staged: process.argv.includes('--staged') })
  } catch (error) { console.error(error.message); process.exitCode = 1 }
  finally { if (locked) unlinkSync(lock) }
}
