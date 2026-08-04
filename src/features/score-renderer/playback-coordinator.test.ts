import { describe, expect, it, vi } from 'vitest'
import { PlaybackCoordinator } from './playback-coordinator'

describe('PlaybackCoordinator', () => {
  it('stops the previous owner and ignores releases from stale owners', () => {
    const coordinator = new PlaybackCoordinator()
    const first = { stop: vi.fn() }
    const second = { stop: vi.fn() }
    coordinator.claim(first)
    coordinator.claim(second)
    coordinator.release(first)
    coordinator.claim(first)
    expect(first.stop).toHaveBeenCalledTimes(1)
    expect(second.stop).toHaveBeenCalledTimes(1)
  })
})
