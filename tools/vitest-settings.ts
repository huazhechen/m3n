// Reuse one environment per pool, but reset modules, mocks and DOM state for
// every file in test-file-setup.ts. Keep verification below the memory ceiling.
export const testSettings = {
  pool: 'threads' as const,
  maxWorkers: 1,
  isolate: false,
  setupFiles: [new URL('./test-file-setup.ts', import.meta.url).pathname],
}
