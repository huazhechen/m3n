const recoveryKey = 'm3n:module-recovery-at'

/** A rebuilt site can invalidate a lazy chunk in an already-open tab. */
export function recoverModuleLoad(event: Event, storage: Pick<Storage, 'getItem' | 'setItem'>, reload: () => void, now = Date.now()) {
  try {
    const previous = storage.getItem(recoveryKey)
    if (previous !== null && now - Number(previous) < 90_000) return
    storage.setItem(recoveryKey, String(now))
  } catch {
    // Without a persistent guard, keep the ordinary error UI instead of looping.
    return
  }
  event.preventDefault()
  reload()
}
