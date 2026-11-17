import { test } from 'node:test';
import { paintedNodeRegions } from '../src/layout/painted-ink.js';
import type { TextMeasurer } from '../src/render/types.js';
import { assert, compileValid, nearly } from './helpers.js';

const textMeasurer: TextMeasurer = { measureText(text, style) {
    return { w: text.length * style.fontSize * 0.6, h: style.fontSize * 1.4,
        baseline: style.fontSize * 0.75, inkBottom: style.fontSize * 0.8 };
} };

for (const size of [18, 22, 30]) for (const notes of ['1 2', "1' 2", "#1' 2"]) {
    test(`ossia clears overlapping painted primitives at ${size}px: ${notes}`, () => {
        const { layout } = compileValid(`@ossia({${notes}},{3 4''})`, { variables: { fontsize: size }, textMeasurer });
        const upper = layout.objects[0].track;
        const lower = layout.objects.find(node => node.track !== upper)!.track;
        const pieces = (track: typeof upper) => layout.objects.filter(node => node.track === track)
            .flatMap(node => paintedNodeRegions(node, textMeasurer));
        const gaps = pieces(upper).flatMap(a => pieces(lower).filter(b => a.x <= b.x + b.w && a.x + a.w >= b.x)
            .map(b => b.y - a.y - a.h));
        assert(gaps.length > 0, 'fixture must have horizontally intersecting music');
        assert(nearly(Math.min(...gaps), size * 0.32), `actual clearance: ${Math.min(...gaps)}`);
        assert(layout.objects.every(node => Number.isFinite(node.box.y)), 'every lane must have a finite position');
    });
}

test('ossia music clearance is independent of a taller surrounding zero-time bar', () => {
    const positions = [false, true].map(tall => {
        const { layout } = compileValid(`@ossia({1 2},{3 4}) ${tall ? '{@set(fontsize=80px) |}' : '|'}`, { textMeasurer });
        return layout.objects.filter(node => !node.T.isZero()).map(node => node.box.y - layout.objects[0].box.y);
    });
    assert(positions[0].length === positions[1].length && positions[0].every((value, index) => nearly(value, positions[1][index])),
        'bar size must not change the relative music axes');
});
