/** Local painted bounds published by the renderer, independent of font line boxes. */
export function scoreInkBounds(element: Element) {
  const ink = element.getAttribute('data-m3n-ink-bounds')?.split(' ').map(Number)
  return ink?.length === 4 && ink.every(Number.isFinite) && ink[2]! >= 0 && ink[3]! >= 0
    ? { x: ink[0]!, y: ink[1]!, width: ink[2]!, height: ink[3]! } : undefined
}
