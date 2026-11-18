import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { build } from 'vite'

test('production HTML keeps hashed entry scripts and deferred application chunks external', async () => {
  const root = await mkdtemp(join(tmpdir(), 'm3n-hosting-build-'))
  try {
    await writeFile(join(root, 'index.html'), '<html><head></head><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>')
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'src/main.js'), 'export const deferred = () => import("../deferred.js"); deferred()')
    await writeFile(join(root, 'deferred.js'), 'export default "deferred score page"; console.log("deferred module")')
    await build({ root, configFile: false, base: '/score/', logLevel: 'silent', build: { rollupOptions: { input: join(root, 'index.html') } } })
    const html = await readFile(join(root, 'dist/index.html'), 'utf8')
    const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match => match[1])
    assert.equal(scripts.length, 1)
    assert.match(scripts[0], /^\/score\/assets\/index-[\w-]+\.js$/)
    assert.doesNotMatch(html, /<script\s+type="module">/)
    const assets = await readdir(join(root, 'dist/assets'))
    assert.ok(assets.some(file => /^index-[\w-]+\.js$/.test(file)))
    assert.ok(assets.some(file => file.endsWith('.js') && !file.startsWith('index-')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
