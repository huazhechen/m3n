import { PeakLimiter } from './peak-limiter.js'

declare const sampleRate: number
declare class AudioWorkletProcessor { constructor() }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void

class OutputLimiter extends AudioWorkletProcessor {
  private readonly limiter = new PeakLimiter(sampleRate)
  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const output = outputs[0]!
    const left = inputs[0]?.[0] ?? output[0]!.fill(0)
    const right = inputs[0]?.[1] ?? left
    this.limiter.process(left, right, output[0]!, output[1]!)
    return true
  }
}
registerProcessor('m3n-output-limiter', OutputLimiter)
