import { createInstrumentSoundFont } from './instrument-soundfont.js'
import { isPlaybackTone, type ToneWorkerResult } from './tone-catalog.js'
const scope = globalThis as unknown as { onmessage: (event: MessageEvent) => void; postMessage: (message: ToneWorkerResult, transfer?: Transferable[]) => void }
scope.onmessage = ({ data: tone }) => {
  try {
    if (!isPlaybackTone(tone) || tone === 'synth') throw new Error('未知音色。')
    const data = createInstrumentSoundFont(tone, progress => scope.postMessage({ type: 'progress', progress }))
    scope.postMessage({ type: 'ready', data }, [data])
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : '无法生成音色，请重试。' })
  }
}
