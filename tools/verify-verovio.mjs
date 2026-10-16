import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import createOriginalModule from 'verovio/wasm'
import createSlimModule from '../packages/score-renderer/vendor/verovio/verovio-module.mjs'
import { VerovioToolkit } from 'verovio/esm'
import { m3nToMei } from '../packages/notation/dist/index.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const vendor = resolve(root, 'packages/score-renderer/vendor/verovio')
const manifest = JSON.parse(await readFile(resolve(vendor, 'build.json'), 'utf8'))
const moduleBytes = await readFile(resolve(vendor, 'verovio-module.mjs'))
assert.equal(createHash('sha256').update(moduleBytes).digest('hex'), manifest.moduleSha256)
const wasmBytes = await readFile(resolve(vendor, 'verovio-module.wasm'))
assert.equal(createHash('sha256').update(wasmBytes).digest('hex'), manifest.wasmSha256)
assert.equal(manifest.externalWasm, true)
assert.deepEqual(manifest.supportedMusicFonts, ['Leipzig'])
const sourcePatch = await readFile(resolve(root, 'public/licenses/verovio/mei-only.patch'))
assert.equal(createHash('sha256').update(sourcePatch).digest('hex'), manifest.sourcePatchSha256)
const original = new VerovioToolkit(await createOriginalModule())
const slimModule = await createSlimModule()
assert.deepEqual(Object.keys(slimModule).filter(name => /^_(?:vrvToolkit_|enableLog)/.test(name)).sort(), [...manifest.exportedFunctions].sort())
const slim = new VerovioToolkit(slimModule)
const scores = await readdir(resolve(root, 'src/scores'))
const sources = await Promise.all(scores.filter(file => file.endsWith('.m3n')).sort()
  .map(async file => ({ file, source: await readFile(resolve(root, 'src/scores', file), 'utf8') })))
const samples = sources.map(({ file, source }) => ({ file, mei: m3nToMei(source).mei }))
// Includes symbols from the SMuFL text font and bold/italic Latin text resources.
samples.push({ file: 'text-and-symbol-fonts', mei: `<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0"><music><body><mdiv><score>
<scoreDef meter.count="4" meter.unit="4"><staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp></scoreDef><section>
<measure n="1"><staff n="1"><layer n="1"><note xml:id="n1" pname="c" oct="4" dur="1"><verse><syl>中文 Lyrics</syl></verse></note></layer></staff>
<dir startid="#n1"><rend fontweight="bold" fontstyle="italic">Allegro</rend> <rend glyph.auth="smufl">&#xECA2;</rend></dir></measure>
</section></score></mdiv></body></music></mei>` })

const report = { version: slim.getVersion(), scores: sources.length, checks: 0, pages: 0, fonts: ['Leipzig'], sizes: {} }
try {
  assert.equal(slim.getVersion(), original.getVersion())
  for (const { file, mei } of samples) for (const font of report.fonts) {
    const options = { font, fontFallback: 'Leipzig', footer: 'none', header: 'none', pageWidth: 1905, pageHeight: 2694, scale: 42, svgViewBox: true }
    const results = [original, slim].map(toolkit => {
      toolkit.setOptions(options)
      toolkit.resetXmlIdSeed(1)
      assert.equal(toolkit.loadData(mei), 1, `${file}: ${font} load`)
      const pages = Array.from({ length: toolkit.getPageCount() }, (_, page) => toolkit.renderToSVG(page + 1))
      assert.ok(pages.length > 0)
      const midi = toolkit.renderToMIDI()
      assert.ok(midi.length > 0)
      const timemap = toolkit.renderToTimemap()
      const noteIds = [...mei.matchAll(/<(?:note|chord)\b[^>]*xml:id="([^"]+)"/g)].map(match => match[1])
      const times = noteIds.map(id => ({ id, time: toolkit.getTimeForElement(id) }))
      const elements = [...new Set(times.map(({ time }) => time))].map(time => toolkit.getElementsAtTime(time))
      return { pages, midi, timemap, times, elements }
    })
    assert.deepEqual(results[1], results[0], `${file}: ${font} SVG/MIDI/playback differs`)
    report.checks += 1
    report.pages += results[1].pages.length
    console.log(`OK ${font} ${file} (${results[1].pages.length} pages)`)
  }
} finally {
  original.destroy()
  slim.destroy()
}
for (const [name, bytes] of [
  ['originalModule', await readFile(resolve(root, 'node_modules/verovio/dist/verovio-module.mjs'))],
  ['slimModule', moduleBytes], ['slimWasm', wasmBytes],
]) {
  report.sizes[name] = {
    raw: bytes.length,
    gzip: gzipSync(bytes, { level: 9 }).length,
    brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  }
}
// Separate HTTP resources are compressed separately; include both in the gate.
report.sizes.slimTotal = Object.fromEntries(['raw', 'gzip', 'brotli']
  .map(encoding => [encoding, report.sizes.slimModule[encoding] + report.sizes.slimWasm[encoding]]))
assert.ok(report.sizes.slimTotal.gzip < report.sizes.originalModule.gzip * 0.45, 'Expected at least 55% total gzip savings')
await mkdir(resolve(root, '.tmp'), { recursive: true })
await writeFile(resolve(root, '.tmp/verovio-verification.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
