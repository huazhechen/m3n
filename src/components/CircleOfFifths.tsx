import { CIRCLE_OF_FIFTHS, circleKeyTarget, isMinorKey, keyPitchClass } from '../lib/transpose-key'

function point(radius: number, angle: number) {
  const radians = angle * Math.PI / 180
  return [180 + radius * Math.sin(radians), 180 - radius * Math.cos(radians)]
}

function sector(inner: number, outer: number, angle: number) {
  const start = point(outer, angle - 15)
  const end = point(outer, angle + 15)
  const innerEnd = point(inner, angle + 15)
  const innerStart = point(inner, angle - 15)
  return `M${start} A${outer},${outer} 0 0 1 ${end} L${innerEnd} A${inner},${inner} 0 0 0 ${innerStart} Z`
}

export function CircleOfFifths({ originalKey, selectedKey, disabled, onSelect }: {
  originalKey: string
  selectedKey: number
  disabled: boolean
  onSelect: (target: number) => void
}) {
  const minor = isMinorKey(originalKey)
  const originalIndex = CIRCLE_OF_FIFTHS.findIndex(([major]) => circleKeyTarget(major, originalKey) === keyPitchClass(originalKey))
  return <svg className="circle-of-fifths" viewBox="0 0 360 360" role="group" aria-label="五度圈，外圈大调，内圈小调">
    {CIRCLE_OF_FIFTHS.map(([major, relativeMinor], index) => {
      const target = circleKeyTarget(major, originalKey)
      const paired = target === selectedKey
      return [major, relativeMinor].map((label, ring) => {
        const selected = paired && (ring === 1) === minor
        const [x, y] = point(ring === 0 ? 147 : 98, index * 30)
        return <g key={label} role="button" tabIndex={disabled ? -1 : 0} aria-label={`${label}${ring === 0 ? '大调' : '小调'}`} aria-pressed={selected} aria-disabled={disabled}
          aria-description={index === originalIndex && (ring === 1) === minor ? '原曲调号' : undefined}
          className={`fifths-key${ring === 1 ? ' fifths-minor' : ''}${paired ? ' is-paired' : ''}`}
          onClick={() => { if (!disabled) onSelect(target) }}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              if (!disabled && !event.repeat) onSelect(target)
            }
          }}>
          <path d={sector(ring === 0 ? 122 : 74, ring === 0 ? 172 : 122, index * 30)} />
          <text x={x} y={y} dominantBaseline="central" textAnchor="middle" aria-hidden="true">{label}</text>
        </g>
      })
    })}
    <path className="fifths-original-outline" aria-hidden="true" d={sector(minor ? 74 : 122, minor ? 122 : 172, originalIndex * 30)} />
  </svg>
}
