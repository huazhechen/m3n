import type { Beam } from 'vexflow/bravura'

// VexFlow 4.2.5 slope search, MIT (public/licenses/vexflow/LICENSE.txt).
// Coordinates and stem tips are constant throughout this search. Resolve them
// once per invocation; extensions remain live for the subsequent beam draw.
export function prepareStaffBeam(beam: Beam): void {
  beam.calculateSlope = function () {
    const notes = this.notes
    const direction = this.getStemDirection()
    const { max_slope, min_slope, slope_iterations, slope_cost } = this.render_options
    const points = notes.map(note => ({ x: note.getStemX(), y: note.getStemExtents().topY, active: note.hasStem() || note.isRest() }))
    const first = points[0]!, last = points.at(-1)!
    const initialSlope = (last.y - first.y) / (last.x - first.x)
    const increment = (max_slope - min_slope) / slope_iterations
    let minCost = Number.MAX_VALUE, bestSlope = 0, yShift = 0
    for (let slope = min_slope; slope <= max_slope; slope += increment) {
      let extension = 0, shift = 0
      for (let i = 1; i < points.length; i++) {
        const point = points[i]!
        if (!point.active) continue
        const adjusted = first.y + (point.x - first.x) * slope + shift
        if (point.y * direction < adjusted * direction) {
          const diff = Math.abs(point.y - adjusted)
          shift += diff * -direction
          extension += diff * i
        } else extension += (point.y - adjusted) * direction
      }
      const cost = slope_cost * Math.abs(initialSlope / 2 - slope) + Math.abs(extension)
      if (cost < minCost) { minCost = cost; bestSlope = slope; yShift = shift }
    }
    const state = this as unknown as { slope: number; y_shift: number }
    state.slope = bestSlope; state.y_shift = yShift
  }
}
