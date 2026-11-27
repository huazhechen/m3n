import { build } from 'vite'
import { basename, dirname, join, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const directory = process.argv[2]
if (!directory) throw new Error('Expected the numbered audit temporary directory')
// Library mode normally embeds every fallback font, including the full CJK
// font, even when the audit installs the shared bundle instead. Externalizing
// real assets matches the web build without substituting font metrics.
const externalFonts = process.argv.includes('--external-fonts')
// Exit before Chromium starts, releasing all bundler and font buffers.
await build({
  configFile: false,
  logLevel: 'error',
  plugins: externalFonts ? [{
    name: 'audit-external-fonts', enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/font-resources.js') && !id.endsWith('/font-resources.ts')) return
      return source.replace(/new URL\(["'](\.\/font-assets\/[^"']+)["'], import\.meta\.url\)\.href/g, (_, relative) => {
        const bytes = readFileSync(resolve(dirname(id), relative))
        const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
        const fileName = `audit-assets/${hash}-${basename(relative)}`
        this.emitFile({ type: 'asset', fileName, source: bytes })
        return JSON.stringify('/' + fileName)
      })
    },
  }] : [],
  define: { 'import.meta.url': JSON.stringify('http://numbered-audit.local/bundle.js') },
  build: {
    outDir: join(resolve(directory), 'bundle'), emptyOutDir: true, minify: process.argv.includes('--minify') ? 'esbuild' : false,
    lib: { entry: join(resolve(directory), 'entry.ts'), name: 'm3n', formats: ['iife'], fileName: () => 'bundle.js' },
  },
})
