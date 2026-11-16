import type { VisualTemporalNode } from '../functions/temporal.js';
import { RecordingPainter, type RecordedPaintCommand } from '../render/recording.js';
import type { TextMeasurer } from '../render/types.js';
import { pathBounds } from './path.js';
import type { Rect } from './types.js';

/** Measure the final read-only paint commands. Keep separate primitive regions:
 * a tall grace/accidental at the left must not raise an unrelated arc endpoint. */
export function paintedNodeRegions(node: VisualTemporalNode, measurer: TextMeasurer): Rect[] {
    const painter = new RecordingPainter();
    node.paint(painter);
    for (const decoration of node.decorations) decoration.paint?.(painter);
    return painter.commands.flatMap(command => paintedCommandRegions(command, measurer));
}

export function paintedCommandRegions(command: RecordedPaintCommand, measurer: TextMeasurer): Rect[] {
    if (command.style?.opacity === 0) return [];
    if (command.kind === 'text') {
        if (command.style.fill === 'none' || !command.text.trim()) return [];
        const m = measurer.measureText(command.text, command.style), advance = m.advance ?? m.w;
        const shift = command.style.textAlign === 'center' ? advance / 2 : command.style.textAlign === 'right' ? advance : 0;
        const left = m.inkLeft ?? 0, right = m.inkRight ?? m.w;
        return [{ x: command.x - shift + left, y: command.y - m.baseline, w: right - left, h: m.inkBottom ?? m.h }];
    }
    const style = command.style;
    const stroke = style?.stroke ?? (command.kind === 'line' ? style?.fill ?? '#000' : 'none');
    const half = stroke === 'none' ? 0 : (style?.strokeWidth ?? 1) / 2;
    const fill = style?.fill ?? (command.kind === 'circle' ? '#000' : 'none');
    if (fill === 'none' && !half) return [];
    let box: Rect;
    if (command.kind === 'path') box = pathBounds(command.commands);
    else if (command.kind === 'line') box = { x: Math.min(command.x1, command.x2), y: Math.min(command.y1, command.y2), w: Math.abs(command.x2 - command.x1), h: Math.abs(command.y2 - command.y1) };
    else if (command.kind === 'circle') box = { x: command.cx - command.r, y: command.cy - command.r, w: command.r * 2, h: command.r * 2 };
    else {
        box = { x: command.x, y: command.y, w: Math.max(0, command.w), h: Math.max(0, command.h) };
        if (fill === 'none') return [
            { x: box.x - half, y: box.y - half, w: box.w + half * 2, h: half * 2 },
            { x: box.x - half, y: box.y + box.h - half, w: box.w + half * 2, h: half * 2 },
            { x: box.x - half, y: box.y - half, w: half * 2, h: box.h + half * 2 },
            { x: box.x + box.w - half, y: box.y - half, w: half * 2, h: box.h + half * 2 },
        ];
    }
    return [{ x: box.x - half, y: box.y - half, w: box.w + half * 2, h: box.h + half * 2 }];
}
