import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compileValid, recordCommands } from './helpers.js';
import { paintedCommandRegions } from '../src/layout/painted-ink.js';
import { defaultTextMeasurer } from '../src/render/text.js';
import type { TextMeasurer } from '../src/render/types.js';

for (const size of [16, 22, 32]) for (const host of ['a', 'b', 'end']) {
    test(`anchored text ignores blank bearings at ${host}, ${size}px`, () => {
        const render = (advanceFactor: number) => {
            const textMeasurer: TextMeasurer = { measureText(text, style) {
                if (text !== 'PAD') return defaultTextMeasurer.measureText(text, style);
                const advance = size * advanceFactor;
                return { w: advance, advance, inkLeft: advance / 2 - size * .35,
                    inkRight: advance / 2 + size * .35, centerOffset: 0,
                    h: size * .6, baseline: size * .5 };
            } };
            const source = `@page(width=320px,left=32px,right=32px) @set(fontsize=${size})
                1@a 2@b 3 4@end @tie(a,end)
                @text(PAD,above=${host},align=center,size=${size}px,gap=2px)`;
            const { layout } = compileValid(source, { textMeasurer, alignRelations: true });
            const notes = layout.objects.filter(node => !node.T.isZero());
            const mark = recordCommands(layout).find(command => command.kind === 'text' && command.text === 'PAD')!;
            const ink = paintedCommandRegions(mark, textMeasurer)[0];
            const axis = notes[0].box.y + notes[0].box.visualAxis;
            assert.ok(ink.x >= 32 - 1e-6 && ink.x + ink.w <= 288 + 1e-6);
            return { x: ink.x, y: ink.y - axis, w: ink.w, h: ink.h,
                notes: notes.map(note => note.box.x + note.box.anchor) };
        };
        const narrow = render(2), wide = render(4);
        assert.deepEqual(wide.notes, narrow.notes, 'attachment bearings must not alter note spacing');
        for (const key of ['x', 'y', 'w', 'h'] as const) assert.ok(Math.abs(wide[key] - narrow[key]) < 1e-6,
            `same painted glyph must retain ${key} when only its blank bearings change`);
    });
}
