/** Preserve measured subpixel geometry through nested SVG transforms. */
export const nativeSvgNumber = (value: number) => Number.isInteger(value) ? (value === 0 ? 0 : value) : Number(value.toFixed(6))
