import type { PlaybackTone } from './tone-catalog.js'

// Fixed input trims, before compression/limiting. Preserve the original sample
// envelopes (especially piano/guitar decay) while keeping melodies audible.
export const PLAYBACK_TONE_GAIN: Record<PlaybackTone, number> = {
  synth: 1, piano: 2.5, harmonica: 2, guitar: 2.2, violin: 1.2, flute: 1.2,
}
