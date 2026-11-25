import { build } from 'vite'
import { resolve, join } from 'node:path'

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const root = resolve(import.meta.dirname, '..'), output = argument('output'), origin = argument('origin')
const plugins = process.argv.includes('--instrument')
  ? [(await import('./lib/staff-benchmark-instrumentation.mjs')).staffBenchmarkInstrumentation()] : []
if (!output || !origin) throw new Error('Expected --output=DIR and --origin=URL')
// This process exits before a browser starts, releasing the bundler and font
// buffers instead of retaining them throughout the audit/width benchmark.
await build({
  configFile: false, logLevel: 'error', base: '/',
  plugins,
  define: { 'import.meta.url': JSON.stringify(`${origin}/bundle.js`) },
  build: { outDir: resolve(output), emptyOutDir: true, minify: false,
    lib: { entry: join(root, 'tools/staff-width-layout.mjs'), name: 'staffWidths', formats: ['iife'], fileName: () => 'bundle.js' } },
})
