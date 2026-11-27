// @vitest-environment jsdom
import { expect,it } from 'vitest';
import { type TextMeasurer } from './native-measure.js';
import { numberedOrderLines } from './order-lines.js';
const measured: TextMeasurer = { measureText(text, style) {
        const units = text === '演奏顺序：' ? 90 : text === '→' ? 8 : [...text].reduce((n, c) => n + (c === 'W' ? 18 : c === 'i' ? 2 : 8), 0);
        const w = units * style.fontSize / 16;
        return { w, h: style.fontSize, baseline: style.fontSize * .8 };
    } };
it('fits narrow letters using actual bold text widths instead of character counts', () => {
    expect(numberedOrderLines(['iiii', 'iiii'], 140, measured)).toEqual([['iiii', 'iiii']]);
    expect(numberedOrderLines(['WWWW', 'WWWW'], 240, measured)).toEqual([['WWWW'], ['WWWW']]);
});
it('measures the first prefix, continuation arrows, frames and every inter-cell gap', () => {
    // First row: 90 + 4 + 15 + 4 + 8 + 4 + 15 = 140.
    expect(numberedOrderLines(['A', 'B', 'C', 'D', 'E', 'F'], 140, measured)).toEqual([['A', 'B'], ['C', 'D', 'E', 'F']]);
    expect(numberedOrderLines(['A', 'B'], 139.9, measured)).toEqual([['A'], ['B']]);
});
it('measures bold labels and scales the entire row design with its text size', () => {
    const styles: {
        fontWeight?: number;
        fontSize: number;
    }[] = [];
    const recording: TextMeasurer = { measureText(text, style) { styles.push(style); return measured.measureText(text, style); } };
    const order = ['A', 'B', 'C', 'D', 'E', 'F'];
    expect(numberedOrderLines(order, 280, recording, 32)).toEqual(numberedOrderLines(order, 140, measured, 16));
    expect(styles.some(s => s.fontWeight === 700)).toBe(true);
    expect(styles.every(s => s.fontSize === 32)).toBe(true);
});
it('preserves label order, repetitions and indivisible names when even one label is wider than a line', () => {
    expect(numberedOrderLines(['', 'WWWW', 'i', 'WWWW', ''], 30, measured)).toEqual([['WWWW'], ['i'], ['WWWW']]);
    expect(numberedOrderLines(undefined, 100, measured)).toEqual([]);
});

it.each([{ order: undefined }, { order: [] }, { order: ['', ''] }])('does not measure an absent order row ($order)', ({ order }) => {
    const unavailable: TextMeasurer = { measureText() { throw new Error('Invisible text must not require a glyph'); } };
    expect(numberedOrderLines(order, 528, unavailable)).toEqual([]);
});
