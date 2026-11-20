import type { PlaybackTone } from './tone-catalog.js'

// All tones use unity gain; preserve the original sample levels and envelopes.
export const PLAYBACK_TONE_GAIN: Record<PlaybackTone, number> = {
  synth: 1, piano: 1, harmonica: 1, guitar: 1, violin: 1, flute: 1,
}
