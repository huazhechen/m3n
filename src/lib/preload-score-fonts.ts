/** Start font downloads alongside the source; FontFace later reuses the same URLs. */
export function preloadScoreFonts(fonts: readonly { url: string; as: 'font' | 'fetch' }[] = []) {
  if (typeof document === 'undefined') return
  for (const { url, as } of fonts) {
    const href = new URL(url, document.baseURI).href
    if ([...document.querySelectorAll<HTMLLinkElement>('link[rel="preload"]')].some(link => link.href === href && link.as === as)) continue
    const link = document.createElement('link')
    link.rel = 'preload'
    // Bravura is read as bytes by the renderer; its preload must match fetch's destination.
    link.as = as
    link.type = 'font/woff2'
    link.crossOrigin = 'anonymous'
    link.href = href
    // Rendering owns error reporting; allow a subsequent open to retry preloading.
    link.addEventListener('error', () => link.remove(), { once: true })
    document.head.append(link)
  }
}
