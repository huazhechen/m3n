import { element, nodes, findAll, type XmlNode } from './layout-svg.js'

const duration = (node: XmlNode): number => {
  if (node.tagName === 'tuplet')
    return (
      (nodes(node).reduce((n, child) => n + duration(child), 0) * Number(node.attributes.numbase)) /
      Number(node.attributes.num)
    )
  if (['beam', 'layer'].includes(node.tagName)) return nodes(node).reduce((n, child) => n + duration(child), 0)
  if (!['note', 'chord', 'rest', 'space'].includes(node.tagName) || node.attributes.grace) return 0
  return (4 / Number(node.attributes.dur ?? 4)) * (2 - 1 / 2 ** Number(node.attributes.dots ?? 0))
}
function atoms(layer: XmlNode): XmlNode[] {
  return nodes(layer).flatMap((node) => (node.tagName === 'beam' ? atoms(node) : [node]))
}
/** Split only at common event boundaries in every staff. Tuplets and grace
 * groups remain atomic; written pitches, lyric IDs and interval anchors survive. */
export function splitMeasure(measure: XmlNode, maximumBeats: number): XmlNode[] {
  const staves = nodes(measure).filter((n) => n.tagName === 'staff')
  const layers = staves.map((staff) => nodes(staff).find((n) => n.tagName === 'layer')!)
  if (layers.some((layer) => !layer) || findAll(measure, (n) => n.tagName === 'multiRest').length) return [measure]
  const streams = layers.map((layer) => {
    let time = 0
    return atoms(layer).map((node) => {
      const onset = time
      time += duration(node)
      return { node, onset, end: time }
    })
  })
  const total = Math.max(...streams.map((stream) => stream.at(-1)?.end ?? 0))
  const boundaries = streams[0]!
    .map((item) => item.end)
    .filter(
      (t) => t > 0 && t < total && streams.every((stream) => stream.some((item) => Math.abs(item.end - t) < 1e-7)),
    )
  const cuts = [0]
  let start = 0
  while (total - start > maximumBeats + 1e-7) {
    const available = boundaries.filter((t) => t > start + 1e-7 && t <= start + maximumBeats + 1e-7)
    // Prefer full beats, but never split an indivisible event to fit.
    const full = available.filter((t) => Math.abs(t - Math.round(t)) < 1e-7)
    const cut = (full.length ? full : available).at(-1) ?? boundaries.find((t) => t > start + 1e-7)
    if (cut === undefined) break
    cuts.push(cut)
    start = cut
  }
  if (cuts.length === 1) return [measure]
  cuts.push(total)
  return cuts.slice(0, -1).map((begin, index) => {
    const end = cuts[index + 1]!,
      ids = new Set<string>()
    const staffNodes = staves.map((staff, lane) => {
      const members = streams[lane]!.filter(
        (item) =>
          item.onset >= begin - 1e-7 && (item.onset < end - 1e-7 || (index === cuts.length - 2 && item.onset <= end)),
      )
      for (const item of members)
        for (const child of findAll(item.node, (n) => Boolean(n.attributes['xml:id'])))
          ids.add(child.attributes['xml:id']!)
      return element('staff', { ...staff.attributes }, [
        element(
          'layer',
          { ...layers[lane]!.attributes },
          members.map((item) => item.node),
        ),
      ])
    })
    const controls = nodes(measure)
      .filter((n) => n.tagName !== 'staff')
      .filter((node) => {
        const id = node.attributes.startid?.replace(/^#/, '')
        if (id) return ids.has(id)
        const time = Number(node.attributes.tstamp ?? 1) - 1
        return time >= begin && time < end
      })
      .map((node) => {
        if (!node.attributes.tstamp) return node
        return {
          ...node,
          attributes: {
            ...node.attributes,
            tstamp: String(Number(node.attributes.tstamp) - begin),
            ...(node.attributes.tstamp2
              ? { tstamp2: String(Math.min(end + 1, Number(node.attributes.tstamp2)) - begin) }
              : {}),
          },
        }
      })
    return element(
      'measure',
      {
        ...measure.attributes,
        'xml:id': `${measure.attributes['xml:id']}-fragment${index + 1}`,
        metcon: 'false',
        left: index ? 'invis' : (measure.attributes.left ?? 'single'),
        right: index < cuts.length - 2 ? 'invis' : (measure.attributes.right ?? 'single'),
      },
      [...staffNodes, ...controls],
    )
  })
}
export function measureWeight(measure: XmlNode): number {
  const staffWeights = nodes(measure)
    .filter((n) => n.tagName === 'staff')
    .map((staff) =>
      nodes(staff)
        .filter((n) => n.tagName === 'layer')
        .reduce((n, layer) => n + atoms(layer).reduce((sum, event) => sum + Math.sqrt(duration(event)), 0), 0),
    )
  return Math.max(0, ...staffWeights)
}
export function measureBeats(measure: XmlNode): number {
  return Math.max(0, ...findAll(measure, (n) => n.tagName === 'layer').map(duration))
}
