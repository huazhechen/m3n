export type NativeMarkPlacement = { name: string; top: number; height: number }

/** Articulations sit nearest the note; ornaments precede expression marks. */
export function nativeMarkStack(names: readonly string[], bodyTop: number) {
  const articulation = (name: string) => ['tip', 'brk', 'hold', 'str'].includes(name)
  const expression = (name: string) => /^(p{1,3}|f{1,3}|mp|mf|sfz)$/.test(name) || /^(cresc\.|dim\.|accel\.|rit\.)/.test(name)
  const rank = (name: string) => articulation(name) ? 0 : expression(name) ? 2 : 1
  const ordered = [...names].sort((a, b) => rank(a) - rank(b))
  let top = bodyTop
  const items: NativeMarkPlacement[] = ordered.map(name => {
    const height = name === 'tip' || name === 'brk' ? 7 : name === 'hold' ? 7 * 0.18 : name === 'str' ? 6 : 12
    top += 22 * 0.12 + height
    return { name, top: -top, height }
  })
  return { items, top }
}
