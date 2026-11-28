import type { LaunchOptions } from '@playwright/test'

export function chromiumExecutablePath(env?: NodeJS.ProcessEnv): string | undefined
export function chromiumLaunchOptions(options?: { heapMb?: number; exposeGc?: boolean; lowMemory?: boolean }): LaunchOptions
