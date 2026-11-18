import { expect, it, vi } from 'vitest'
import { recoverModuleLoad } from './module-recovery'

it('reloads a failed module once while preserving the original failure on repeated attempts', () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  const reload = vi.fn(), first = new Event('vite:preloadError', { cancelable: true })
  recoverModuleLoad(first, storage, reload, 100000)
  expect(reload).toHaveBeenCalledTimes(1)
  expect(first.defaultPrevented).toBe(true)
  const repeated = new Event('vite:preloadError', { cancelable: true })
  recoverModuleLoad(repeated, storage, reload, 101000)
  expect(reload).toHaveBeenCalledTimes(1)
  expect(repeated.defaultPrevented).toBe(false)
  recoverModuleLoad(new Event('vite:preloadError'), storage, reload, 191000)
  expect(reload).toHaveBeenCalledTimes(2)
})

it('does not loop or hide the error when session storage is unavailable', () => {
  const reload = vi.fn(), event = new Event('vite:preloadError', { cancelable: true })
  recoverModuleLoad(event, { getItem() { throw new Error('blocked') }, setItem() {} }, reload)
  expect(reload).not.toHaveBeenCalled()
  expect(event.defaultPrevented).toBe(false)
})
