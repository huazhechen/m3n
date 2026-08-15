export type PlaybackNavigation = 'segno' | 'ds' | 'dc' | 'fine' 

export type PlaybackNode = {
  id: string
  kind: 'section' | 'ending'
  n?: string
  repeatStart?: boolean
  repeatCount?: number
  navigation?: readonly PlaybackNavigation[]
}

export type PlaybackMeasure = {
  events: ReadonlyArray<{ navigation: readonly PlaybackNavigation[] }>
  navigation?: readonly PlaybackNavigation[]
  left?: string
  right?: string
  ending?: string
  repeatCount?: number
}

export type PlaybackPlan = {
  sequence: string[]
  passesByNode: ReadonlyMap<string, ReadonlySet<number>>
}

export function parsePassRange(value: string) {
  const passes = new Set<number>()
  for (const token of value.split(',')) {
    const range = /^(\d+)~(\d+)$/.exec(token.trim())
    if (range) {
      for (let pass = Number(range[1]); pass <= Number(range[2]); pass += 1) passes.add(pass)
      continue
    }
    const pass = Number(token.trim())
    if (Number.isInteger(pass) && pass > 0) passes.add(pass)
  }
  return passes
}

/** Returns the playback passes in which each written measure occurs. */
export function measurePlaybackPasses<T extends PlaybackMeasure>(measures: readonly T[]) {
  if (measures.some((measure) => measure.ending)) {
    const passesByMeasure = new Map<T, Set<number>>(measures.map((measure) => [measure, new Set([1])]))
    let repeatStart = 0
    const endingPassCounts = new Map<number, number>()

    for (const [index, measure] of measures.entries()) {
      if (measure.left === 'rptstart') repeatStart = index
      if (measure.right !== 'rptend') continue

      let passCount = measure.repeatCount ?? 2
      for (let endingIndex = repeatStart; endingIndex <= index; endingIndex += 1) {
        const ending = measures[endingIndex]?.ending
        if (ending) for (const pass of parsePassRange(ending)) passCount = Math.max(passCount, pass)
      }
      const groupStart = index + 1
      for (let endingIndex = groupStart; measures[endingIndex]?.ending; endingIndex += 1) {
        const ending = measures[endingIndex]?.ending
        if (ending) for (const pass of parsePassRange(ending)) passCount = Math.max(passCount, pass)
        const navigation = navigationOf(measures[endingIndex])
        if (navigation.some((value) => value === 'ds' || value === 'dc')) break
      }
      if (measures[groupStart]?.ending) endingPassCounts.set(groupStart, passCount)
      for (let repeatedIndex = repeatStart; repeatedIndex <= index; repeatedIndex += 1) {
        const repeated = measures[repeatedIndex]
        if (repeated) passesByMeasure.set(repeated, new Set(Array.from({ length: passCount }, (_, pass) => pass + 1)))
      }
    }

    for (const measure of measures) {
      if (measure.ending) passesByMeasure.set(measure, parsePassRange(measure.ending))
    }

    // D.S./D.C. jumps replay the section measures before the jump once per
    // ending house that was not entered during the initial passes. Count those
    // return passes so lyric requirements match the actual playback.
    const segnoIndex = measures.findIndex((measure) => navigationOf(measure).includes('segno'))
    const jumpIndex = measures.findIndex((measure) => {
      const navigation = navigationOf(measure)
      return navigation.includes('ds') || navigation.includes('dc')
    })
    if (jumpIndex >= 0) {
      const jumpNavigation = navigationOf(measures[jumpIndex])
      const destination = jumpNavigation.includes('ds') ? segnoIndex : 0
      if (destination >= 0) {
        const fineIndex = measures.findIndex((measure) => navigationOf(measure).includes('fine'))
        const returnEnd = fineIndex >= 0 ? fineIndex : measures.length
        const groupStart = [...endingPassCounts.keys()]
          .filter((start) => start <= jumpIndex)
          .sort((left, right) => right - left)[0]
        const passCount = groupStart === undefined ? undefined : endingPassCounts.get(groupStart)
        const remainingHouses = new Set<string>()
        if (passCount !== undefined) {
          for (let endingIndex = jumpIndex + 1; measures[endingIndex]?.ending; endingIndex += 1) {
            const ending = measures[endingIndex]?.ending
            if (ending && !remainingHouses.has(ending)
              && [...parsePassRange(ending)].some((pass) => pass > passCount)) {
              remainingHouses.add(ending)
            }
          }
        }
        const sectionIndexes: number[] = []
        for (let index = destination; index < returnEnd; index += 1) {
          if (measures[index] && !measures[index]?.ending) sectionIndexes.push(index)
        }
        const returnPasses = Math.max(1, remainingHouses.size)
        const maxPass = Math.max(0, ...sectionIndexes.flatMap((index) => [...(passesByMeasure.get(measures[index]!) ?? [])]))
        for (let offset = 1; offset <= returnPasses; offset += 1) {
          const pass = maxPass + offset
          for (const index of sectionIndexes) passesByMeasure.get(measures[index]!)?.add(pass)
        }
      }
    }
    return passesByMeasure
  }

  const nodes: PlaybackNode[] = measures.map((measure, index) => ({
    id: String(index),
    kind: measure.ending ? 'ending' : 'section',
    n: measure.ending,
    repeatStart: measure.left === 'rptstart',
    repeatCount: measure.repeatCount ?? (measure.right === 'rptend' ? 2 : undefined),
    navigation: measure.navigation ?? measure.events.flatMap((event) => event.navigation),
  }))
  const passesByMeasure = new Map<T, Set<number>>(measures.map((measure) => [measure, new Set()]))
  const visits = new Map<number, number>()

  for (const id of planPlayback(nodes).sequence) {
    const index = Number(id)
    const measure = measures[index]
    if (!measure) continue
    if (measure.ending) {
      passesByMeasure.set(measure, parsePassRange(measure.ending))
      continue
    }
    const pass = (visits.get(index) ?? 0) + 1
    visits.set(index, pass)
    passesByMeasure.get(measure)?.add(pass)
  }
  return passesByMeasure
}

function navigationOf<T extends PlaybackMeasure>(measure: T | undefined) {
  return measure?.navigation ?? measure?.events.flatMap((event) => event.navigation) ?? []
}

function chooseEnding(nodes: readonly PlaybackNode[], start: number, end: number, pass: number) {
  for (let index = start; index <= end; index += 1) {
    if (parsePassRange(nodes[index]?.n ?? '').has(pass)) return index
  }
  return undefined
}

function expandInitialPasses(nodes: readonly PlaybackNode[]) {
  const sequence: string[] = []
  const endingGroups = new Map<number, { end: number; repeatStart: number; hasExplicitRepeatStart: boolean; passCount: number }>()
  const hasRepeatEnd = nodes.some((node) => node.repeatCount)
  let latestRepeatStart = 0
  let hasExplicitRepeatStart = false
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (node?.kind === 'section' && node.repeatStart) {
      latestRepeatStart = index
      hasExplicitRepeatStart = true
    }
    if (node?.kind !== 'ending') continue

    const start = index
    while (nodes[index + 1]?.kind === 'ending') index += 1
    const endings = nodes.slice(start, index + 1)
    if (!hasRepeatEnd) continue
    const passCount = Math.max(1, ...endings.flatMap((ending) => [...parsePassRange(ending.n ?? '')]), ...endings.map((ending) => ending.repeatCount ?? 0))
    for (let endingIndex = start; endingIndex <= index; endingIndex += 1) {
      endingGroups.set(endingIndex, { end: index, repeatStart: latestRepeatStart, hasExplicitRepeatStart, passCount })
    }
  }

  const repeatVisits = new Map<number, number>()
  const ordinaryRepeatEnds = new Set(nodes.flatMap((node, index) => node.kind === 'section' && node.repeatCount ? [index] : []))
  const repeatStarts = new Map<number, number>()
  let implicitRepeatStart = 0
  let explicitRepeatStart: number | undefined
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!
    if (node.kind === 'section' && node.repeatStart) explicitRepeatStart = index
    if (node.kind !== 'section' || !node.repeatCount) continue
    repeatStarts.set(index, explicitRepeatStart ?? implicitRepeatStart)
    // Explicit start/end pairs are self-contained. Consecutive bare repeat
    // ends, however, keep the same implicit beginning (normally the score).
    if (explicitRepeatStart !== undefined) implicitRepeatStart = index + 1
    explicitRepeatStart = undefined
  }
  let index = 0
  while (index < nodes.length) {
    const node = nodes[index]
    if (!node) break
    const endingGroup = endingGroups.get(index)
    if (endingGroup) {
      const visit = (repeatVisits.get(index) ?? 0) + 1
      repeatVisits.set(index, visit)
      const selectedIndex = chooseEnding(nodes, index, endingGroup.end, Math.min(visit, endingGroup.passCount))
      const selectedNode = selectedIndex === undefined ? undefined : nodes[selectedIndex]
      if (selectedNode) sequence.push(selectedNode.id)

      const selected = selectedIndex === undefined ? undefined : nodes[selectedIndex]
      if (selected?.repeatCount && visit < selected.repeatCount) {
        if (!endingGroup.hasExplicitRepeatStart) {
          for (const endingIndex of endingGroups.keys()) {
            if (endingIndex < index) repeatVisits.delete(endingIndex)
          }
        }
        index = endingGroup.repeatStart
      } else {
        index = endingGroup.end + 1
      }
      continue
    }

    sequence.push(node.id)
    if (node.repeatCount) {
      const visit = (repeatVisits.get(index) ?? 0) + 1
      repeatVisits.set(index, visit)
      if (visit < node.repeatCount) {
        for (const repeatEnd of ordinaryRepeatEnds) {
          if (repeatEnd < index) repeatVisits.delete(repeatEnd)
        }
        index = repeatStarts.get(index) ?? 0
        continue
      }
    }
    index += 1
  }
  return sequence
}

function appendNavigationReturn(nodes: readonly PlaybackNode[], initial: string[]) {
  const jumpIndex = nodes.findIndex((node) => node.navigation?.some((value) => value === 'ds' || value === 'dc'))
  if (jumpIndex < 0) return initial
  const jump = nodes[jumpIndex]!
  const destination = jump.navigation?.includes('ds')
    ? nodes.findIndex((node) => node.navigation?.includes('segno'))
    : nodes.findIndex((node) => node.kind === 'section')
  const fine = nodes.findIndex((node) => node.navigation?.includes('fine'))
  if (destination < 0) return initial
  const played = initial.lastIndexOf(jump.id)
  if (played < 0) return initial

  const sections = nodes
    .slice(destination, fine >= 0 ? fine + 1 : nodes.length)
    .filter((node) => node.kind === 'section')
    .map((node) => node.id)
  const endingNodes = nodes.filter((node) => node.kind === 'ending')
  const playedEndings = new Set(endingNodes
    .filter((node) => initial.includes(node.id))
    .map((node) => node.id))
  const remainingHouses = endingNodes.filter((node) => !playedEndings.has(node.id))
  const returnPart: string[] = []
  for (const house of remainingHouses.length > 0 ? remainingHouses : [undefined]) {
    returnPart.push(...sections)
    if (house) returnPart.push(house.id)
  }
  return [...initial.slice(0, played + 1), ...returnPart]
}

/** Returns written node ids in performance order, including one navigation return. */
export function buildPlaybackSequence(nodes: readonly PlaybackNode[]) {
  return appendNavigationReturn(nodes, expandInitialPasses(nodes))
}

/** Plans playback order and visit numbers from the same expanded sequence. */
export function planPlayback(nodes: readonly PlaybackNode[]): PlaybackPlan {
  const sequence = buildPlaybackSequence(nodes)
  const visits = new Map<string, number>()
  const passesByNode = new Map<string, Set<number>>()
  for (const id of sequence) {
    const pass = (visits.get(id) ?? 0) + 1
    visits.set(id, pass)
    const passes = passesByNode.get(id) ?? new Set<number>()
    passes.add(pass)
    passesByNode.set(id, passes)
  }
  return { sequence, passesByNode }
}
