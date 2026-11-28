import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chromiumExecutablePath, chromiumLaunchOptions } from './lib/chromium-options.mjs'

test('local checks and CI use the same pinned browser unless explicitly overridden', () => {
  assert.equal(chromiumExecutablePath({}), undefined)
  assert.equal(chromiumExecutablePath({ CI: 'true' }), undefined)
  assert.equal(chromiumExecutablePath({ CI: 'true', CHROMIUM_PATH: '/custom/chromium' }), '/custom/chromium')
  assert.equal(chromiumExecutablePath({ CHROMIUM_PATH: '/custom/chromium' }), '/custom/chromium')
})

test('audits and context-recreating E2E tests use bounded, multi-process Chromium', () => {
  for (const lowMemory of [false, true]) {
    const { args } = chromiumLaunchOptions({ heapMb: 192, exposeGc: true, lowMemory })
    assert.ok(args.includes('--js-flags=--expose-gc --max-old-space-size=192'))
    assert.ok(args.includes('--renderer-process-limit=1'))
    assert.ok(!args.includes('--single-process'))
    assert.equal(args.includes('--no-zygote'), lowMemory)
  }
})
