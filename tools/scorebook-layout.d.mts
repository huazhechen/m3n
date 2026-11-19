import type { WidthMeasurement } from './scorebook-width.mjs'
export function prepare(fontBase64?: string): Promise<void>
export function render(source: string, width: number, paged?: boolean, coreGap?: number, host?: HTMLElement): Promise<SVGSVGElement[]>
export function measure(source: string, width: number, paged?: boolean, coreGap?: number, host?: HTMLElement): Promise<WidthMeasurement>
export function sharedA4Page(sources: string[], width: number, gap?: number, host?: HTMLElement): Promise<{ markup: string; usedHeight: number; coreGap: number }>
export function a4Pages(source: string, width: number, host?: HTMLElement): Promise<{ markup: string }[]>
