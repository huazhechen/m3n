import type { ScoreHeaderMetadata } from '../lib/m3n-mei'

type ScoreHeaderProps = {
  metadata: readonly ScoreHeaderMetadata[]
  scale?: number
}

export function ScoreHeader({ metadata, scale = 1 }: ScoreHeaderProps) {
  const centered = metadata.filter((item) => item.side === 'center').sort((left, right) => left.priority - right.priority)
  const left = metadata.filter((item) => item.side === 'left').sort((left, right) => left.priority - right.priority)
  const right = metadata.filter((item) => item.side === 'right').sort((left, right) => left.priority - right.priority)
  const scaledPixels = (value: number) => `${value * scale}px`
  const scaledRems = (value: number) => `${value * scale}rem`

  if (centered.length === 0 && left.length === 0 && right.length === 0) return null
  return (
    <header className="score-title-block" style={scale === 1 ? undefined : { padding: `${scaledPixels(28)} ${scaledPixels(28)} ${scaledPixels(8)}` }}>
      {centered.map((item) => item.priority === 0
        ? <h1 key={item.priority} style={scale === 1 ? undefined : { fontSize: scaledRems(2.25) }}>{item.value}</h1>
        : <p className="score-subtitle" key={item.priority} style={scale === 1 ? undefined : { marginTop: scaledPixels(8), fontSize: scaledRems(1.1) }}>{item.value}</p>)}
      {(left.length > 0 || right.length > 0) && (
        <div className="score-header-details" style={scale === 1 ? undefined : { gap: scaledPixels(16), marginTop: scaledPixels(12), fontSize: scaledRems(1) }}>
          <div className="score-header-column score-header-column-left" style={scale === 1 ? undefined : { gap: scaledPixels(6) }}>
            {left.map((item) => <p className="score-header-item" key={item.priority}>{item.value}</p>)}
          </div>
          <div className="score-header-column score-header-column-right" style={scale === 1 ? undefined : { gap: scaledPixels(6) }}>
            {right.map((item) => <p className="score-header-item" key={item.priority}>{item.value}</p>)}
          </div>
        </div>
      )}
    </header>
  )
}
