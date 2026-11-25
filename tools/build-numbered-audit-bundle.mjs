import { build } from 'vite'
import { join, resolve } from 'node:path'

const directory = process.argv[2]
if (!directory) throw new Error('Expected the numbered audit temporary directory')
// Exit before Chromium starts, releasing all bundler and font buffers.
await build({
  configFile: false,
  logLevel: 'error',
  define: { 'import.meta.url': JSON.stringify('http://numbered-audit.local/bundle.js') },
  build: {
    outDir: join(resolve(directory), 'bundle'), emptyOutDir: true, minify: false,
    lib: { entry: join(resolve(directory), 'entry.ts'), name: 'm3n', formats: ['iife'], fileName: () => 'bundle.js' },
  },
})
