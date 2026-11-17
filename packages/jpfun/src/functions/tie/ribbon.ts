import type { PathCommand } from "../../render/types.js";
import type { LayoutPoint } from "../../layout/types.js";

/** Tie ribbon edges are monotone in x, including the opening/closing cross-system curves. */
export function ribbonAtX(commands: readonly PathCommand[], x: number, slopes = false) {
    let cursor: LayoutPoint = { x: 0, y: 0 };
    const edges: { y: number; slope: number }[] = [];
    for (const command of commands) {
        if (command.op === 'Z') continue;
        if (command.op === 'M') { cursor = command; continue; }
        const start = cursor;
        cursor = command;
        if (x < Math.min(start.x, command.x) - 1e-7 || x > Math.max(start.x, command.x) + 1e-7) continue;
        if (Math.abs(start.x - command.x) < 1e-9) {
            edges.push({ y: start.y, slope: 0 }, { y: command.y, slope: 0 });
            continue;
        }
        const at = (t: number, axis: 'x' | 'y') => {
            const u = 1 - t;
            if (command.op === 'C') return u ** 3 * start[axis] + 3 * u * u * t * command[axis === 'x' ? 'cx1' : 'cy1']
                + 3 * u * t * t * command[axis === 'x' ? 'cx2' : 'cy2'] + t ** 3 * command[axis];
            if (command.op === 'Q') return u * u * start[axis] + 2 * u * t * command[axis === 'x' ? 'cx' : 'cy'] + t * t * command[axis];
            return u * start[axis] + t * command[axis];
        };
        let low = 0, high = 1;
        for (let iteration = 0; iteration < 32; iteration++) {
            const middle = (low + high) / 2;
            if ((at(middle, 'x') < x) === (command.x >= start.x)) low = middle;
            else high = middle;
        }
        const t = x === start.x ? 0 : x === command.x ? 1 : (low + high) / 2, u = 1 - t;
        if (!slopes) { edges.push({ y: at(t, 'y'), slope: 0 }); continue; }
        const derivative = (axis: 'x' | 'y') => {
            if (command.op === 'C') return 3 * (u * u * (command[axis === 'x' ? 'cx1' : 'cy1'] - start[axis])
                + 2 * u * t * (command[axis === 'x' ? 'cx2' : 'cy2'] - command[axis === 'x' ? 'cx1' : 'cy1'])
                + t * t * (command[axis] - command[axis === 'x' ? 'cx2' : 'cy2']));
            if (command.op === 'Q') return 2 * (u * (command[axis === 'x' ? 'cx' : 'cy'] - start[axis])
                + t * (command[axis] - command[axis === 'x' ? 'cx' : 'cy']));
            return command[axis] - start[axis];
        };
        edges.push({ y: at(t, 'y'), slope: derivative('y') / derivative('x') });
    }
    if (!edges.length) return undefined;
    const top = Math.min(...edges.map(edge => edge.y)), bottom = Math.max(...edges.map(edge => edge.y));
    if (!slopes) return { top, bottom, topSlope: 0, bottomSlope: 0 };
    const xs = commands.flatMap(command => command.op === 'Z' ? [] : [command.x]);
    const leftHalf = x <= (Math.min(...xs) + Math.max(...xs)) / 2;
    const topSlopes = edges.filter(edge => Math.abs(edge.y - top) < 1e-9).map(edge => edge.slope);
    const bottomSlopes = edges.filter(edge => Math.abs(edge.y - bottom) < 1e-9).map(edge => edge.slope);
    return { top, bottom, topSlope: leftHalf ? Math.min(...topSlopes) : Math.max(...topSlopes),
        bottomSlope: leftHalf ? Math.max(...bottomSlopes) : Math.min(...bottomSlopes) };
}

type Ribbon = { commands: readonly PathCommand[]; x: number; w: number };

/** Aligned tie bows have their sole y extremum at x + w/2. The
 * opening/closing quadratics and flat continuations are monotone in y. */
function interval(ribbon: Ribbon, from: number, to: number) {
    const center = ribbon.x + ribbon.w / 2;
    let top = Infinity, bottom = -Infinity;
    const include = (x: number) => {
        const edge = ribbonAtX(ribbon.commands, x);
        if (edge) { top = Math.min(top, edge.top); bottom = Math.max(bottom, edge.bottom); }
    };
    include(from); include(to);
    if (center > from && center < to) include(center);
    return { top, bottom };
}

/** Maximize the facing-edge separation with exact interval envelopes. Bound
 * refinement follows the curves, never a pixel grid or a raster safety lift. */
export function ribbonClearance(outer: Ribbon, inner: Ribbon, gap: number, tolerance: number) {
    const start = Math.max(outer.x, inner.x), end = Math.min(outer.x + outer.w, inner.x + inner.w);
    if (end <= start) return 0;
    let maximum = 0, upperMaximum = 0;
    const ranges = [{ from: start, to: end }];
    while (ranges.length) {
        const { from, to } = ranges.pop()!;
        const middle = (from + to) / 2;
        for (const x of [from, middle, to]) {
            const a = ribbonAtX(outer.commands, x), b = ribbonAtX(inner.commands, x);
            if (a && b) maximum = Math.max(maximum, a.bottom - b.top + gap);
        }
        const a = interval(outer, from, to), b = interval(inner, from, to);
        let upper = a.bottom - b.top + gap;
        const a0 = ribbonAtX(outer.commands, from, true)!, a1 = ribbonAtX(outer.commands, to, true)!;
        const b0 = ribbonAtX(inner.commands, from, true)!, b1 = ribbonAtX(inner.commands, to, true)!;
        const slopeMin = a0.bottomSlope - b1.topSlope, slopeMax = a1.bottomSlope - b0.topSlope;
        const value0 = a0.bottom - b0.top + gap, value1 = a1.bottom - b1.top + gap;
        // Convex edges have monotone slopes. Their difference is bounded by
        // these endpoint derivatives, including between all evaluations.
        if (slopeMin >= 0) upper = Math.min(upper, value1);
        else if (slopeMax <= 0) upper = Math.min(upper, value0);
        else upper = Math.min(upper, value0 + slopeMax * (to - from), value1 - slopeMin * (to - from));
        if (upper - maximum <= tolerance || middle === from || middle === to) upperMaximum = Math.max(upperMaximum, upper);
        else { ranges.push({ from, to: middle }); ranges.push({ from: middle, to }); }
    }
    return Math.max(maximum, upperMaximum);
}
