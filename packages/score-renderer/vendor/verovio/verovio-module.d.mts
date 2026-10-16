type VerovioModule = {
  cwrap: (...args: unknown[]) => (...args: unknown[]) => unknown
}

export default function createVerovioModule(): Promise<VerovioModule>
