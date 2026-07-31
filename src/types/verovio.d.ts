declare module 'verovio/wasm' {
  type VerovioModule = {
    cwrap: (...args: unknown[]) => (...args: unknown[]) => unknown
  }
  export default function createVerovioModule(): Promise<VerovioModule>
}

declare module 'verovio/esm' {
  type VerovioModule = import('verovio/wasm').default extends () => Promise<infer T> ? T : never

  export class VerovioToolkit {
    constructor(module: VerovioModule)
    destroy(): void
    getElementsAtTime(milliseconds: number): {
      chords?: string[]
      measure?: string
      notes?: string[]
      page?: number
      rests?: string[]
    }
    getLog(): string
    getPageCount(): number
    getTimeForElement(xmlId: string): number
    loadData(data: string): number
    renderToMIDI(): string
    renderToSVG(page?: number, xmlDeclaration?: boolean): string
    setOptions(options: Record<string, unknown>): void
  }
}
