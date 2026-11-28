/** Rhythmic stretch with space already supplied by hard geometry credited first.
 * A spring receives max(0, force * weight - credit) additional engraving units. */
export type ScoreStretch = {
  weights: readonly number[]
  credits: readonly number[]
  order: readonly number[]
}

export function prepareScoreStretch(weights: readonly number[], credits: readonly number[] = weights.map(() => 0)): ScoreStretch {
  if (weights.length !== credits.length || weights.some(value => !Number.isFinite(value) || value < 0)
    || credits.some(value => !Number.isFinite(value) || value < 0)) throw new Error('横向拉伸权重与抵扣额度必须为非负有限数值。')
  const order = weights.flatMap((weight, index) => weight > 0 ? [index] : [])
    .sort((a, b) => credits[a]! / weights[a]! - credits[b]! / weights[b]!)
  return { weights: [...weights], credits: [...credits], order }
}

/** Exact piecewise-linear water filling; zero-weight springs stay rigid. */
export function scoreStretchForce(plan: ScoreStretch, extra: number): number {
  if (!Number.isFinite(extra) || extra < 0) throw new Error('横向拉伸余量必须为非负有限数值。')
  if (extra === 0) return 0
  let weight = 0, credit = 0
  for (let at = 0; at < plan.order.length; at++) {
    const index = plan.order[at]!
    weight += plan.weights[index]!
    credit += plan.credits[index]!
    const force = (extra + credit) / weight
    const next = plan.order[at + 1]
    if (next === undefined || force <= plan.credits[next]! / plan.weights[next]!) return force
  }
  return 0
}

export function scoreStretchAtForce(plan: ScoreStretch, force: number): number {
  return plan.weights.reduce((sum, weight, index) => sum + Math.max(0, force * weight - plan.credits[index]!), 0)
}

export function mergeScoreStretch(plans: readonly ScoreStretch[]): ScoreStretch {
  return prepareScoreStretch(plans.flatMap(plan => [...plan.weights]), plans.flatMap(plan => [...plan.credits]))
}

/** Measures and their interiors use the same force, retaining every breakpoint. */
export function distributeScoreStretchGroups(plans: readonly ScoreStretch[], extra: number): number[] {
  const force = scoreStretchForce(mergeScoreStretch(plans), extra)
  return plans.map(plan => scoreStretchAtForce(plan, force))
}

/** Section endings inherit pressure rather than a linear surplus/weight ratio. */
export function inheritScoreStretchWidth(current: { minimumWidth: number; stretch: ScoreStretch },
  previous: { minimumWidth: number; stretch: ScoreStretch }, previousWidth: number): number {
  const force = scoreStretchForce(previous.stretch, Math.max(0, previousWidth - previous.minimumWidth))
  return current.minimumWidth + scoreStretchAtForce(current.stretch, force)
}
