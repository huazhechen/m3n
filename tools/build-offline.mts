import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { scoreCatalogPlugin } from './score-catalog-plugin.ts'

const { values } = parseArgs({ options: { out: { type: 'string', default: 'offline/m3n.html' } } })
const icon = `data:image/svg+xml;base64,${(await readFile('public/favicon.svg')).toString('base64')}`
const result = await build({
  configFile: false,
  base: './',
  publicDir: false,
  define: { 'import.meta.env.VITE_OFFLINE': 'true', 'import.meta.env.VITE_SUBMIT_MODE': '"local"' },
  plugins: [react(), scoreCatalogPlugin(), {
    name: 'm3n-offline-public-resources',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/src/components/TopNav.tsx')) return code.replace('`${import.meta.env.BASE_URL}favicon.svg`', JSON.stringify(icon))
    },
  }],
  build: {
    write: false,
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    modulePreload: false,
    rolldownOptions: { output: { codeSplitting: false } },
  },
})
if (Array.isArray(result) || !('output' in result)) throw new Error('Unexpected offline build output')
const output = result.output
const entry = output.find(item => item.type === 'chunk' && item.isEntry)
const htmlAsset = output.find(item => item.type === 'asset' && item.fileName === 'index.html')
if (!entry || entry.type !== 'chunk' || !htmlAsset || htmlAsset.type !== 'asset') throw new Error('Missing offline entry')
// No external chunks/assets may silently escape into a supposedly portable file.
if (output.some(item => item.type === 'chunk' && item !== entry || item.type === 'asset' && item.fileName !== 'index.html' && !item.fileName.endsWith('.css'))) {
  throw new Error('Offline build emitted an external resource')
}
const escapeEndTag = (code: string, tag: string) => code.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`)
const css = output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => String(item.source)).join('\n')
let html = String(htmlAsset.source)
  .replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/g, '')
  .replace(/href="[^"]*favicon.svg"/, () => `href="${icon}"`)
  .replace('</head>', () => `<style>${escapeEndTag(css, 'style')}</style></head>`)
html = html.replace('<title>M3N - 文本记谱编辑器</title>', '<title>M3N 离线版</title>')
const licenses = await Promise.all((await readdir('public/licenses', { recursive: true }))
  .filter(file => file.endsWith('.txt')).map(async file => ({ file, text: await readFile(resolve('public/licenses', file), 'utf8') })))
html = html.replace('</body>', () => `<script type="application/json" id="m3n-licenses">${JSON.stringify(licenses).replaceAll('<', '\\u003c')}</script></body>`)
// Inline JS last: dependency code contains HTML strings such as </body>.
// Earlier template replacements must never match text inside the bundle.
html = html.replace(/<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/g, () => `<script type="module">${escapeEndTag(entry.code, 'script')}</script>`)
const destination = resolve(values.out!)
await mkdir(dirname(destination), { recursive: true })
await writeFile(destination, html)
console.log(`Offline HTML: ${destination} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MiB)`)
