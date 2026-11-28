import { vi } from 'vitest'

// Reuse the worker and DOM environment, but give each file fresh production
// modules and undo global/mocked state before its imports are evaluated.
vi.useRealTimers()
vi.unstubAllGlobals()
vi.unstubAllEnvs()
vi.restoreAllMocks()
vi.resetModules()
if (typeof document !== 'undefined') {
  document.head.replaceChildren()
  document.body.replaceChildren()
  document.defaultView?.localStorage?.clear()
  document.defaultView?.sessionStorage?.clear()
}
