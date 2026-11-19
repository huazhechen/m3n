/** Final mastering stage shared by every tone. Sub-bass/DC uses headroom without
 * helping a small speaker; moderate compression and +6dB makeup lift melodies.
 * A separate lookahead limiter catches chords and fast transitions at -0.54dBFS.
 */
export function createPlaybackOutput(context: AudioContext) {
  const highpass = context.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = 25
  highpass.Q.value = Math.SQRT1_2
  const compressor = context.createDynamicsCompressor()
  compressor.threshold.value = -12
  compressor.knee.value = 9
  compressor.ratio.value = 4
  compressor.attack.value = 0.003
  compressor.release.value = 0.12
  const makeup = context.createGain()
  makeup.gain.value = 2
  const limiter = new AudioWorkletNode(context, 'm3n-output-limiter', {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
    channelCount: 2, channelCountMode: 'explicit',
  })
  highpass.connect(compressor)
  compressor.connect(makeup)
  makeup.connect(limiter)
  limiter.connect(context.destination)
  return highpass
}
