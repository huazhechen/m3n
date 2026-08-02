const SOURCE_PARAMETER = 'm3n'

export function encodeScoreSource(source: string) {
  const bytes = new TextEncoder().encode(source)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

export function decodeScoreSource(value: string | null) {
  if (!value) return null
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

export function sharedScoreUrl(path: '/editor' | '/reader', source: string) {
  return `${path}?${SOURCE_PARAMETER}=${encodeScoreSource(source)}`
}

export function sharedScoreSource(search: string) {
  return decodeScoreSource(new URLSearchParams(search).get(SOURCE_PARAMETER))
}
