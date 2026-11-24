import { useState } from 'react'

type Props = {
  progress: number
  isPlaying: boolean
  onSeekStart: () => void
  onSeek: (progress: number) => void
  onSeekCommit: () => void
}

export function PlaybackProgressControl(props: Props) {
  const value = Math.round(props.progress * 1000)
  const [readingValue, setReadingValue] = useState(value)
  // Automatic playback ticks must not emit slider value changes to VoiceOver.
  // Pausing and explicit user interactions still expose the current position.
  if (!props.isPlaying && readingValue !== value) setReadingValue(value)
  return <div className="playback-progress">
    <input type="range" min="0" max="1000" value={value} aria-hidden="true" tabIndex={-1}
      onPointerDown={props.onSeekStart}
      onInput={event => props.onSeek(Number(event.currentTarget.value) / 1000)} />
    <input className="playback-progress-accessible" type="range" min="0" max="1000"
      value={readingValue} aria-label="播放位置" aria-valuetext={`${Math.round(readingValue / 10)}%`}
      onFocus={() => setReadingValue(value)}
      onKeyDown={props.onSeekStart} onKeyUp={props.onSeekCommit} onBlur={props.onSeekCommit}
      onInput={event => {
        const next = Number(event.currentTarget.value)
        setReadingValue(next)
        // Screen-reader adjustment can arrive without keyboard/pointer events.
        props.onSeekStart()
        props.onSeek(next / 1000)
        props.onSeekCommit()
      }} />
  </div>
}
