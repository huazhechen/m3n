import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert/strict';
import { paintedCommandRegions } from '../src/layout/painted-ink.js';
import type { TextMeasurer } from '../src/render/types.js';

const measurer: TextMeasurer = { measureText: () => ({
    w: 20, advance: 18, inkLeft: -2, inkRight: 16, h: 15, baseline: 11, inkBottom: 13,
}) };

test('painted text uses bearings, advance alignment and visible height independently', () => {
    for (const [textAlign, x] of [['left', 98], ['center', 89], ['right', 80]] as const) {
        deepStrictEqual(paintedCommandRegions({ kind: 'text', text: 'f', x: 100, y: 50,
            style: { fontSize: 20, textAlign } }, measurer), [{ x, y: 39, w: 18, h: 13 }]);
    }
    for (const text of ['', '  ']) deepStrictEqual(paintedCommandRegions({
        kind: 'text', text, x: 0, y: 0, style: { fontSize: 20 },
    }, measurer), []);
});

test('painted primitives follow painter defaults and stroked frames keep their empty interior', () => {
    deepStrictEqual(paintedCommandRegions({ kind: 'line', x1: 10, x2: 20, y1: 5, y2: 5 }, measurer),
        [{ x: 9.5, y: 4.5, w: 11, h: 1 }]);
    deepStrictEqual(paintedCommandRegions({ kind: 'circle', cx: 10, cy: 5, r: 2 }, measurer),
        [{ x: 8, y: 3, w: 4, h: 4 }]);
    deepStrictEqual(paintedCommandRegions({ kind: 'rect', x: 10, y: 20, w: 30, h: 40 }, measurer), []);
    deepStrictEqual(paintedCommandRegions({ kind: 'rect', x: 10, y: 20, w: 30, h: 40,
        style: { stroke: '#000', strokeWidth: 2 } }, measurer), [
        { x: 9, y: 19, w: 32, h: 2 }, { x: 9, y: 59, w: 32, h: 2 },
        { x: 9, y: 19, w: 2, h: 42 }, { x: 39, y: 19, w: 2, h: 42 },
    ]);
});
