export type LyricTarget = { tied: boolean } 

export function hasForcedLyricOutsideTiedTarget(items: readonly { forceTiedTarget: boolean }[], targets: readonly LyricTarget[]) {
  let targetIndex = 0
  for (const item of items) {
    if (item.forceTiedTarget) {
      if (!targets[targetIndex]?.tied) return true
      targetIndex += 1
      continue
    }
    while (targets[targetIndex]?.tied) targetIndex += 1
    if (targetIndex >= targets.length) break
    targetIndex += 1
  }
  return false
}
