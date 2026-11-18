import { build } from 'vite'
import { cp, mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { parseArgs } from 'node:util'
import { randomUUID } from 'node:crypto'

const { values } = parseArgs({ options: { outDir: { type: 'string' }, base: { type: 'string' } } })
const hosted = !values.outDir && process.env.VITE_BASE_URL === '/score/' && process.env.VITE_SUBMIT_MODE === 'remote'
if (!hosted) {
  await build({ ...(values.base ? { base: values.base } : {}), ...(values.outDir ? { build: { outDir: values.outDir } } : {}) })
} else {
  // Finish the build before touching served files. Publish assets before HTML,
  // then remove superseded assets; no previous release is retained.
  await mkdir('.tmp', { recursive: true })
  const staging = await mkdtemp(resolve('.tmp/hosted-build-'))
  const destination = resolve('dist')
  try {
    // A release must never reuse URLs that an edge cached as missing while
    // an earlier deployment was rebuilding. Version the entire dependency graph.
    const release = randomUUID().slice(0, 8)
    await build({ worker: { rolldownOptions: { output: {
      entryFileNames: `assets/[name]-[hash]-${release}.js`,
      chunkFileNames: `assets/[name]-[hash]-${release}.js`,
    } } }, build: { outDir: staging, emptyOutDir: true, rolldownOptions: { output: {
      entryFileNames: `assets/[name]-[hash]-${release}.js`,
      chunkFileNames: `assets/[name]-[hash]-${release}.js`,
      assetFileNames: `assets/[name]-[hash]-${release}.[ext]`,
    } } } })
    await mkdir(destination, { recursive: true })
    for (const entry of await readdir(staging)) {
      if (entry !== 'index.html') await cp(join(staging, entry), join(destination, entry), { recursive: true, force: true })
    }
    await rename(join(staging, 'index.html'), join(destination, 'index.html'))
    const assets = new Set(await readdir(join(staging, 'assets'), { recursive: true }))
    for (const entry of await readdir(join(destination, 'assets'), { recursive: true })) {
      if (!assets.has(entry)) await rm(join(destination, 'assets', entry), { recursive: true, force: true })
    }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
