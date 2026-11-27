import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { libraryFontBundle } from './library-bundles.ts'

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
  const inputs = ['packages/notation/src', 'packages/numbered-notation/src', 'packages/score-renderer/src/staff'].flatMap(filesBelow)
    .filter(file => /\.(ts|json)$/.test(file) && !file.endsWith('.test.ts') && !file.endsWith('/font-resources.ts'))
  inputs.push('src/lib/scorebook-front.ts', 'tools/lib/numbered-width-measurement.mjs', 'tools/scorebook-layout.mjs', 'tools/scorebook-width.mjs', 'tools/lib/score-geometry.mjs', 'tools/lib/ink-overlap-pairs.mjs', 'tools/lib/svg-ink-bounds.mjs', 'tools/prepare-score-fonts.py', 'tools/prepare-staff-glyphs.py', 'tools/subset-builtin-pdf-font.py', 'tools/fonts/NotoSansCJKsc-Regular.otf')
  for (const file of readdirSync(assetPath).filter(file => /^(Barlow|Bravura)/.test(file))) inputs.push(`packages/numbered-notation/src/font-assets/${file}`)
  inputs.push('config/scorebook/editorial-plan.json')
  inputs.push('tools/prepare-library-fonts.py')
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
    return previous.rendererSha256 !== fingerprint || previous.fontManifestSha256 !== hash(read(fontManifestFile)) || !entry || entry.sourceSha256 !== hash(read(file))
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
  const { previous, stale, deleted } = staleScores()
  if (check) {
    assert(!stale.length && !deleted.length, `乐谱生成结果过期，请运行 npm run prepare:scores：\n${[...stale, ...deleted].join('\n')}`)
    await libraryFontBundle()
    console.log('Font subsets and shared library TTFs match every score; width selection runs in the browser.')
    return
  }
  if (!stale.length && !deleted.length) {
    try { await libraryFontBundle() }
    catch { execFileSync(python(), ['tools/prepare-library-fonts.py'], { cwd: root, stdio: 'inherit' }) }
    if (staged) execFileSync('git', ['add', '--', 'tools/fonts/library'], { cwd: root })
    console.log('Score artifacts are current.'); return
  }
  if (staged) assertFullyStaged(stale)
  const interpreter = python()
  console.log(`Preparing font subsets for ${stale.length} changed scores.`)
  const snapshots = new Map(stale.map(file => [file, read(file).toString()]))
  if (stale.length) {
    execFileSync('npm', ['run', 'build:packages'], { cwd: root, stdio: 'inherit' })
  }
  // Reject edits made while font subsets were generated.
  for (const [file, source] of snapshots) assert.equal(read(file).toString(), source, `乐谱在生成期间发生变化：${file}`)
  execFileSync(interpreter, ['tools/prepare-score-fonts.py'], { cwd: root, stdio: 'inherit' })
  execFileSync(interpreter, ['tools/prepare-staff-glyphs.py'], { cwd: root, stdio: 'inherit' })
  execFileSync(interpreter, ['tools/prepare-library-fonts.py'], { cwd: root, stdio: 'inherit' })
  const preparedFingerprint = rendererFingerprint()
  const { CJK_FONTS, LATIN_FONTS, BRAVURA_FONTS } = await import('../packages/numbered-notation/src/font-resources.ts?prepared=' + Date.now())
  const entries = { ...previous.entries }
  for (const file of deleted) delete entries[file]
  for (const file of sourceFiles()) {
    const { numberedWidth: _numberedWidth, numberedPages: _numberedPages, ...previousResult } = previous.entries[file] ?? {}
    const source = read(file).toString()
    const chars = [...new Set(source + '演唱作词作曲音域：→演奏顺序：')].filter(c => !/\s|[\u200B\u2800]/u.test(c) && !LATIN_FONTS[0].characters.includes(c) && !BRAVURA_FONTS[0].characters.includes(c))
    const font = CJK_FONTS.filter(font => chars.every(c => font.characters.includes(c))).sort((a, b) => a.bytes - b.bytes)[0]
    assert(font, `Missing font subset: ${file}`)
    entries[file] = { ...previousResult, sourceSha256: hash(source), font: font.file, fontSha256: hash(readFileSync(fileURLToPath(font.url))) }
  }
  assert.equal(preparedFingerprint, rendererFingerprint(), 'Renderer changed while preparing score artifacts; rerun the command.')
  const output = JSON.stringify({ version: 1, staffGeneration: 'deferred', rendererSha256: preparedFingerprint, fontManifestSha256: hash(read(fontManifestFile)), entries }, null, 2) + '\n'
  writeFileSync(recordPath + '.tmp', output); renameSync(recordPath + '.tmp', recordPath)
  assert.equal(preparedFingerprint, rendererFingerprint(), 'Renderer changed while preparing score artifacts; rerun the command.')
  if (staged) execFileSync('git', ['add', '--', ...stale, 'config/score-artifacts.json', 'packages/numbered-notation/src/font-assets', 'packages/numbered-notation/src/font-resources.ts', 'packages/score-renderer/src/staff/staff-glyphs.json', 'tools/fonts/library'], { cwd: root, stdio: 'inherit' })
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
