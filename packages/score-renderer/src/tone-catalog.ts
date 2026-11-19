export type PlaybackTone = 'synth' | 'piano' | 'harmonica' | 'guitar' | 'violin' | 'flute'
export type GeneratedTone = Exclude<PlaybackTone, 'synth'>
export const PLAYBACK_TONES = [
  { value: 'synth', label: '合成音色' }, { value: 'piano', label: '钢琴' },
  { value: 'harmonica', label: '口琴' }, { value: 'guitar', label: '钢弦吉他' },
  { value: 'violin', label: '小提琴' }, { value: 'flute', label: '长笛' },
] as const
export function isPlaybackTone(value: unknown): value is PlaybackTone {
  return PLAYBACK_TONES.some(tone => tone.value === value)
}
export type ToneGenerationProgress = { tone: GeneratedTone; completed: number; total: number; stage: 'samples' | 'packing' | 'ready' }
export type ToneWorkerResult = { type: 'progress'; progress: ToneGenerationProgress } | { type: 'ready'; data: ArrayBuffer } | { type: 'error'; message: string }
