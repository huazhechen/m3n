/** A horizontal spring. All distances share the caller's engraving units.
 * Flexibility is distance per unit force; zero locks that direction. */
export type SpacingSpring = {
  minimum: number
  natural: number
  stretch: number
  compress?: number
}
export type ElasticSpacing = { lengths: number[]; minimum: number; natural: number; force: number; badness: number }

/** One force for the whole chain. Compressed springs stop at their collision
 * limits; remaining springs absorb the load. Impossible widths retain minima.
 * No music, font, SVG, or notation-specific constants belong in this solver. */
export function solveElasticSprings(springs: readonly SpacingSpring[], width: number): ElasticSpacing {
  if (!Number.isFinite(width) || width < 0) throw new Error('弹性间距宽度必须为非负有限数值。')
  for (const spring of springs) if (![spring.minimum, spring.natural, spring.stretch, spring.compress ?? 0].every(value => Number.isFinite(value) && value >= 0)
    || spring.natural < spring.minimum) throw new Error('弹性间距参数无效。')
  const minimum = springs.reduce((sum, spring) => sum + spring.minimum, 0)
  const natural = springs.reduce((sum, spring) => sum + spring.natural, 0)
  const target = Math.max(minimum, width)
  const lengths = springs.map(spring => spring.natural)
  let force = 0
  if (target >= natural) {
    const flexibility = springs.reduce((sum, spring) => sum + spring.stretch, 0)
    force = flexibility > 0 ? (target - natural) / flexibility : 0
    springs.forEach((spring, index) => { lengths[index] = spring.natural + force * spring.stretch })
  } else {
    // Active-set water filling: at least one spring locks on each pass.
    let remaining = natural - target
    let active = springs.map((spring, index) => ({ index, capacity: spring.natural - spring.minimum,
      flexibility: spring.compress ?? spring.natural - spring.minimum })).filter(spring => spring.flexibility > 0 && spring.capacity > 0)
    while (active.length) {
      const flexibility = active.reduce((sum, spring) => sum + spring.flexibility, 0)
      const load = remaining / flexibility
      const blocked = active.filter(spring => load * spring.flexibility >= spring.capacity)
      if (!blocked.length) {
        force = -load
        active.forEach(spring => { lengths[spring.index] = springs[spring.index]!.natural - load * spring.flexibility })
        break
      }
      const locked = new Set(blocked.map(spring => spring.index))
      blocked.forEach(spring => { lengths[spring.index] = springs[spring.index]!.minimum; remaining -= spring.capacity })
      force = -load
      active = active.filter(spring => !locked.has(spring.index))
    }
  }
  const badness = springs.reduce((sum, spring, index) => {
    const deviation = lengths[index]! - spring.natural
    return sum + (spring.natural > 0 ? (deviation / spring.natural) ** 2 : 0)
  }, 0) / Math.max(1, springs.length)
  return { lengths, minimum, natural, force, badness }
}

/** Aggregate spring cost for a proposed line. Both loose and compressed lines
 * are compared around the same natural width, before publishing coordinates.
 * Hard overflow is handled independently by the line planner. */
export function elasticLineBadness(minimum: number, natural: number, width: number): number {
  const spring = { minimum: Math.max(0, minimum), natural: Math.max(minimum, natural), stretch: 1 }
  return solveElasticSprings([spring], Math.max(0, width)).badness
}

/** Normalize compression and extension by the available spring travel,
 * excluding rigid ink. A line below its collision minimum is never legal. */
export function spacingStrainBadness(minimum: number, natural: number, width: number): number {
  if (width < minimum) return Infinity
  const travel = Math.max(0, natural - minimum)
  if (!travel) return width === natural ? 0 : ((width - natural) / Math.max(1, natural)) ** 2
  return ((width - natural) / travel) ** 2
}

export type ElasticLine = { minimumWidth: number; naturalWidth?: number; stretchWeight: number }
/** A short final line inherits the preceding line's spring pressure, including
 * compression. Uniform natural clearances retain the established tail width. */
export function inheritElasticWidth(current: ElasticLine, previous: ElasticLine, previousWidth: number): number {
  const previousNatural = previous.naturalWidth ?? previous.minimumWidth
  const currentNatural = current.naturalWidth ?? current.minimumWidth
  if (previousWidth < previousNatural && previousNatural > previous.minimumWidth) {
    const fraction = Math.max(0, previousWidth - previous.minimumWidth) / (previousNatural - previous.minimumWidth)
    return current.minimumWidth + fraction * (currentNatural - current.minimumWidth)
  }
  const force = previous.stretchWeight > 0 ? Math.max(0, previousWidth - previousNatural) / previous.stretchWeight : 0
  return currentNatural + force * current.stretchWeight
}
