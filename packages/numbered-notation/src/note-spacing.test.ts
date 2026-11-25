import { parseM3NDocument } from '@m3n/notation';
import { expect,it } from 'vitest';
import { NumberedNotationScore } from './index.js';
import { measureNativeHorizontal,placeNativeHorizontal } from './native-horizontal.js';
import { layoutNativeScore } from './native-layout.js';
import type { TextMeasurer } from './native-measure.js';
import { projectNativeScore } from './native-model.js';
const textMeasurer: TextMeasurer = { measureText(text, style) {
        return { w: text.length * style.fontSize / 2, h: style.fontSize, baseline: style.fontSize * .8 };
    } };
it.each([0, 1, 2, 3, 4])('retains the 2px floor after rhythmic and beam scaling at level %s', level => {
    const source = `N: ${'('.repeat(level)}1 1 1 1${')'.repeat(level)} |||`;
    const document = parseM3NDocument(source);
    const gap = (floor: number) => {
        const projection = projectNativeScore(document, { textMeasurer });
        const options = { minimumNoteGap: 9, minimumNoteGapFloor: floor};
        measureNativeHorizontal(projection.measures, options);
        placeNativeHorizontal(projection.measures, options, 0, projection.measures[0]!.minimum);
        const [first, second] = projection.glyphs;
        return second!.x - first!.x - first!.right - second!.left;
    };
    const expected = 9 * Math.sqrt(2 ** -level) * (level ? .5 : 1);
    // The native iterative solver retains its existing subpixel tolerance.
    expect(gap(2)).toBeCloseTo(Math.max(expected, 2), 1);
    if (level >= 3)
        expect(gap(2)).toBeGreaterThan(gap(0));
});
it('validates floor overrides at public and layout entry points', () => {
    const document = parseM3NDocument('N: 1 2 3 4 |||');
    for (const floor of [-1, NaN, Infinity, 9.01]) {
        const options = { width: 600, paged: false, textMeasurer, minimumNoteGapFloor: floor };
        expect(() => NumberedNotationScore.create(document).render(options)).toThrow('最小间距下限');
        expect(() => layoutNativeScore(document, options)).toThrow('最小间距下限');
    }
});
