/** Decide section-ending justification from its width at the preceding row's
 * spacing. In the middle band, allow at most 50% more stretch per rhythm unit.
 * Equal-cell layouts use zero as the stretch origin to compare cell widths. */
export function lastLineWidth(minimum: number, inherited: number, available: number, stretchOrigin = minimum): number {
  const trial = Math.max(minimum, inherited)
  if (trial >= available * 0.8) return Math.max(minimum, available)
  if (trial <= available * 0.5) return trial
  const inheritedStretch = Math.max(0, trial - stretchOrigin)
  return inheritedStretch > 0 && available - stretchOrigin <= inheritedStretch * 1.5
    ? available : trial
}
