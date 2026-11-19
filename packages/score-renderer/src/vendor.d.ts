declare module '*.sf3?url' {
  const url: string
  export default url
}

declare module 'spessasynth_lib/dist/spessasynth_processor.min.js?url' {
  const url: string
  export default url
}

declare module "*?worker&url" { const url: string; export default url }

declare module 'verovio/esm' {
  export class VerovioToolkit {
    constructor(module: { cwrap: (...args: unknown[]) => (...args: unknown[]) => unknown })
    destroy(): void
    getLog(): string
    getPageCount(): number
    loadData(data: string): number
    renderToSVG(page?: number, xmlDeclaration?: boolean): string
    setOptions(options: Record<string, unknown>): void
  }
}
