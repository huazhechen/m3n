import { useSyncExternalStore } from 'react'
import { isPlaybackTone, type PlaybackTone } from '@m3n/score-renderer/tones'

export const PLAYBACK_TONE_KEY = 'm3n:playback-tone'
const CHANGE_EVENT = 'm3n:playback-tone-change'
let memoryTone: PlaybackTone = 'synth'
let memoryOverride = false

function readTone(): PlaybackTone {
  if (memoryOverride) return memoryTone
  try {
    const value = localStorage.getItem(PLAYBACK_TONE_KEY)
    return isPlaybackTone(value) ? value : 'synth'
  } catch { return memoryTone }
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === PLAYBACK_TONE_KEY || event.key === null) { memoryOverride = false; notify() }
  }
  window.addEventListener(CHANGE_EVENT, notify)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify)
    window.removeEventListener('storage', onStorage)
  }
}

function setTone(tone: PlaybackTone) {
  memoryTone = tone
  try { localStorage.setItem(PLAYBACK_TONE_KEY, tone); memoryOverride = false } catch { memoryOverride = true }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** Shared by reader, editor, and embedded scores, and persisted without expiry. */
export function usePlaybackTone() {
  return [useSyncExternalStore(subscribe, readTone, () => 'synth' as const), setTone] as const
}
