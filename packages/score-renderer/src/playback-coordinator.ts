export type PlaybackLease = { stop: () => void } 

/** Ensures that only one score owns audio playback at a time. */
export class PlaybackCoordinator {
  private active: PlaybackLease | null = null

  claim(lease: PlaybackLease) {
    if (this.active && this.active !== lease) this.active.stop()
    this.active = lease
  }

  release(lease: PlaybackLease) {
    if (this.active === lease) this.active = null
  }
}

export const scorePlaybackCoordinator = new PlaybackCoordinator()
