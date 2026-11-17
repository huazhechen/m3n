import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compileScore } from '../src/pipeline.js';
import { measureLyricFragment } from '../src/functions/voice/lyric-fragment.js';
import type { TextStyle } from '../src/render/types.js';
import { nearly, recordCommands } from './helpers.js';

// Advance differs from both ink width and bearing; every dimension scales.
const measurer = { measureText(text: string, style: TextStyle) {
    const k = style.fontSize / 18.04;
    const [advance, inkLeft, inkRight, ascent, descent] = text === 'AB' ? [20, -3, 25, 10, 3]
        : text === '(AB)' ? [30, -2, 34, 10, 3] : text === '(' ? [5, 0, 4, 10, 3]
        : text === 'P' ? [8, -4, 10, 11, 1] : [12, 0, 12, 10, 3];
    return { w: advance * k, advance: advance * k, inkLeft: inkLeft * k, inkRight: inkRight * k,
        centerOffset: (inkRight + inkLeft - advance) / 2 * k, baseline: ascent * k, h: (ascent + descent) * k };
} };

for (const size of [11, 22, 33]) {
    const k = size / 22;
    test(`lyric paint origin and underline follow measured bearings at ${size}px`, () => {
        const style = { fontSize: size * .82 };
        const fragment = measureLyricFragment('AB', undefined, true, style, measurer);
        assert.ok(nearly(fragment.lyric.origin, -11 * k));
        assert.ok(nearly(fragment.lyric.underline!.left, -14 * k));
        assert.ok(nearly(fragment.lyric.underline!.right, 14 * k));
        assert.ok(nearly(fragment.left, -14.4 * k) && nearly(fragment.right, 14.4 * k));
        const prefixes = JSON.stringify(JSON.stringify({ '0:0': 'P' }));
        const result = compileScore(`@voice({1 2},,"{(AB)} AB",lyricunderlines="0:0",lyricprefixes=${prefixes})`, {
            variables: { fontsize: size, lyricspacing: 'reserve' }, textMeasurer: measurer,
        });
        assert.deepEqual(result.diagnostics, []);
        const notes = result.layout.objects.filter(n => !n.T.isZero());
        const port = notes[0].box.x + notes[0].ports.lyric.x;
        const commands = recordCommands(result.layout);
        const lyric = commands.find(c => c.kind === 'text' && c.text === '(AB)')!;
        const label = commands.find(c => c.kind === 'text' && c.text === 'P')!;
        const line = commands.find(c => c.kind === 'line')!;
        assert.equal(lyric.kind, 'text'); assert.equal(label.kind, 'text'); assert.equal(line.kind, 'line');
        // Spoken AB remains centered; opening punctuation adds its own advance.
        assert.ok(nearly(lyric.x - port, -16 * k));
        assert.ok(nearly(line.x1 - port, -18 * k) && nearly(line.x2 - port, 18 * k));
        assert.ok(nearly(label.x - port, -27.608 * k));
        const regions = result.layout.attachments.flatMap(a => a.regions);
        const lyricRegion = regions.find(r => nearly(r.x, port - 18.4 * k))!;
        const labelRegion = regions.find(r => nearly(r.x, port - 31.608 * k))!;
        assert.ok(lyricRegion && nearly(lyricRegion.w, 36.8 * k));
        assert.ok(labelRegion && nearly(labelRegion.w, 14 * k));
        const bounds = result.layout.horizontalBounds.get(notes[0])!;
        assert.ok(bounds.x <= labelRegion.x - 1 + 1e-6);
        assert.ok(bounds.x + bounds.w >= lyricRegion.x + lyricRegion.w + 1 - 1e-6);
    });
}

test('narrow painted contours retain natural advance space', () => {
    const result = measureLyricFragment('AB', undefined, false, { fontSize: 18.04 }, {
        measureText: () => ({ w: 20, advance: 20, inkLeft: 8, inkRight: 12, centerOffset: 0, h: 10, baseline: 8 }),
    });
    assert.equal(result.lyric.left, -2);
    assert.equal(result.lyric.right, 2);
    assert.equal(result.left, -10);
    assert.equal(result.right, 10);
});
