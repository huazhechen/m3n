import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { build } from 'vite'
import { standaloneWebPlugin } from './standalone-web-plugin.ts'

test('an already loaded application keeps its deferred modules after a clean deployment', async () => {
  const root = await mkdtemp(join(tmpdir(), 'm3n-standalone-'))
  try {
    await writeFile(join(root, 'index.html'), '<html><head></head><body><script type="module" src="/main.js"></script></body></html>')
    await writeFile(join(root, 'main.js'), `import './style.css'; globalThis.loadDeploymentFixture = () => import('./deferred.js').then(module => module.default)`)
    await writeFile(join(root, 'style.css'), 'body { color: red }')
    await writeFile(join(root, 'deferred.js'), `export default ${JSON.stringify('old </script> score')}`)
    const options = { root, configFile: false, base: '/score/', logLevel: 'silent', plugins: [standaloneWebPlugin()] }
    await build(options)
    const oldHtml = await readFile(join(root, 'dist/index.html'), 'utf8')
    assert.doesNotMatch(oldHtml, /<script[^>]+src=|<link[^>]+stylesheet/)
    assert.match(oldHtml, /<style>body/)
    const script = /<script type="module">([\s\S]*?)<\/script>/.exec(oldHtml)?.[1]
    assert.ok(script)
    await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`)
    const oldLoad = globalThis.loadDeploymentFixture
    await writeFile(join(root, 'deferred.js'), 'export default "new score"')
    await build(options)
    assert.notEqual(await readFile(join(root, 'dist/index.html'), 'utf8'), oldHtml)
    assert.deepEqual(await readdir(join(root, 'dist')), ['index.html'])
    // The old document still opens its previously unused module after all old files are removed.
    assert.equal(await oldLoad(), 'old </script> score')
  } finally {
    delete globalThis.loadDeploymentFixture
    await rm(root, { recursive: true, force: true })
  }
})
