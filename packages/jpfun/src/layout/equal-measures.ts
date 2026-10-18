// M3N opt-in: identify visible measure cells before horizontal solving.
import { ANCHOR_KEY, type VisualTemporalNode } from '../functions/temporal.js';
import type { EqualMeasureRange } from './model.js';

/** Headers have no cells; a single cell can use the normal solver. */
export function equalMeasureRanges(columns: readonly (readonly VisualTemporalNode[])[]): EqualMeasureRange[] {
    const ranges: EqualMeasureRange[] = [];
    let start = 0, musical = false;
    for (let i = 0; i < columns.length; i++) {
        if (musical && columns[i].some(node => node.mergeKey === ANCHOR_KEY)) {
            ranges.push({ start, end: i, bar: i });
            start = i + 1;
            musical = false;
        }
        if (columns[i].some(node => !node.T.isZero())) musical = true;
    }
    if (musical) ranges.push({ start, end: columns.length });
    return ranges;
}
