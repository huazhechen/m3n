/** A rebuilt site can invalidate a lazy chunk in an already-open tab. */
export function recoverModuleLoad(event: Event, storage: Pick<Storage, 'getItem' | 'setItem'>, reload: () => void, entryUrl: string) {
  try {
    const recoveryKey = `m3n:module-recovery:${entryUrl}`
    if (storage.getItem(recoveryKey) !== null) return
    storage.setItem(recoveryKey, '1')
  } catch {
    // Without a persistent guard, keep the ordinary error UI instead of looping.
    return
  }
  event.preventDefault()
  reload()
}
