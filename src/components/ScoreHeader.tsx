import type { ScoreHeaderMetadata } from '../lib/m3n-mei'

type ScoreHeaderProps = {
  metadata: readonly ScoreHeaderMetadata[]
}

export function ScoreHeader({ metadata }: ScoreHeaderProps) {
  const centered = metadata.filter((item) => item.side === 'center').sort((left, right) => left.priority - right.priority)
  const left = metadata.filter((item) => item.side === 'left').sort((left, right) => left.priority - right.priority)
  const right = metadata.filter((item) => item.side === 'right').sort((left, right) => left.priority - right.priority)

  if (centered.length === 0 && left.length === 0 && right.length === 0) return null
  return (
    <header className="score-title-block">
      {centered.map((item) => item.priority === 0
        ? <h1 key={item.priority}>{item.value}</h1>
        : <p className="score-subtitle" key={item.priority}>{item.value}</p>)}
      {(left.length > 0 || right.length > 0) && (
        <div className="score-header-details">
          <div className="score-header-column score-header-column-left">
            {left.map((item) => <p className="score-header-item" key={item.priority}>{item.value}</p>)}
          </div>
          <div className="score-header-column score-header-column-right">
            {right.map((item) => <p className="score-header-item" key={item.priority}>{item.value}</p>)}
          </div>
        </div>
      )}
    </header>
  )
}
