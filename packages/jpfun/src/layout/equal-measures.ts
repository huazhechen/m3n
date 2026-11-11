// M3N opt-in: identify visible measure cells before horizontal solving.
import { ANCHOR_KEY, type VisualTemporalNode } from '../functions/temporal.js';
import type { EqualMeasureRange } from './model.js';

/** Headers have no cells; a single cell can use the normal solver. */
export function equalMeasureRanges(columns: readonly (readonly VisualTemporalNode[])[], minimumNoteGap?: number): EqualMeasureRange[] {
    const ranges: EqualMeasureRange[] = [];
    let start = 0, musical = false;
    for (let i = 0; i < columns.length; i++) {
        if (musical && columns[i].some(node => node.mergeKey === ANCHOR_KEY)) {
            const bars = columns[i].filter(node => node.mergeKey === ANCHOR_KEY);
            // Paired spacing already reserves minimum clearance in the physical
            // element widths; adding the legacy inset would count it twice.
            ranges.push({ start, end: i, bar: i, padding: Math.max(...bars.map(node => node.box.h)) * (minimumNoteGap === undefined ? 0.55 : 0) });
            start = i + 1;
            musical = false;
        }
        if (columns[i].some(node => !node.T.isZero())) musical = true;
    }
    if (musical) ranges.push({ start, end: columns.length });
    return ranges;
}
