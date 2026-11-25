import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** End the bundler process before launching a browser, releasing native caches too. */
export async function buildBrowserTestBundle(options) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker'], {
      stdio: ['pipe', 'inherit', 'inherit'],
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=256', RAYON_NUM_THREADS: '1' },
    })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`Browser fixture build exited ${code}`)))
    child.stdin.end(JSON.stringify(options))
  })
}

if (process.argv[2] === '--worker') {
  try {
    let input = ''
    for await (const chunk of process.stdin) input += chunk
    const { root, entry, outDir, fixtures } = JSON.parse(input)
    const { build } = await import('vite')
    const { join } = await import('node:path')
    const { mkdirSync, readFileSync, writeFileSync, statSync, existsSync } = await import('node:fs')
    const { execFileSync } = await import('node:child_process')
    const { browserTestFontAssets } = await import('./browser-test-font-assets.mjs')
    mkdirSync(outDir, { recursive: true })
    const textFile = join(outDir, 'fixture-characters.txt'), fontFile = join(outDir, 'fixture-font.ttf')
    const { builtinPdfCharacters } = await import('../prepare-builtin-pdf-font.mjs')
    const text = ['tools/scorebook-notation.test.mjs', 'tools/online-scorebook-parity.test.mjs', 'src/lib/online-scorebook.ts']
      .map(file => readFileSync(join(root, file), 'utf8')).join('') + builtinPdfCharacters() + '演唱作词作曲音域：→'
    writeFileSync(textFile, [...new Set(text)].join(''))
    const python = process.env.M3N_FONT_PYTHON || (existsSync(join(root, '.tmp/font-subset-env/bin/python')) ? join(root, '.tmp/font-subset-env/bin/python') : 'python3')
    const font = JSON.parse(execFileSync(python, [join(root, 'tools/prepare-browser-test-font.py'),
      join(root, 'packages/numbered-notation/src/font-assets/NotoSansSC-full.ttf'), textFile, fontFile], { encoding: 'utf8' }))
    font.bytes = statSync(fontFile).size
    const plugins = [browserTestFontAssets(root, { fontFile, ...font }).plugin]
    if (fixtures) plugins.push({ name: 'parity-fixtures', enforce: 'pre', resolveId(id) {
      if (id.endsWith('editorial-plan.json')) return '\0parity-plan'
      if (id === './samples' || id.endsWith('/samples') || id.endsWith('/samples.ts')) return '\0parity-samples'
    }, load(id) {
      if (id === '\0parity-plan') return `export default ${JSON.stringify(fixtures.plan)}`
      if (id === '\0parity-samples') return `const sources = ${JSON.stringify(fixtures.sources)};
        export const presetScores = ${JSON.stringify(fixtures.files.map((sourcePath, index) => ({ slug: String(index), sourcePath })))};
        export async function loadPresetScore(slug) { return sources[Number(slug)] }`
    } })
    await build({ plugins, configFile: false, logLevel: 'error', define: { 'import.meta.url': JSON.stringify('http://scorebook.local/bundle.js') },
      build: { emptyOutDir: false, minify: false, outDir, lib: { entry, name: 'scorebook', formats: ['iife'], fileName: () => 'bundle.js' } } })
    process.exit(0)
  } catch (error) { console.error(error); process.exit(1) }
}
