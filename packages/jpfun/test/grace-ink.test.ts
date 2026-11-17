import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compileScore } from '../src/pipeline.js';
import { GraceTemporal } from '../src/functions/grace/index.js';
import { paintedCommandRegions } from '../src/layout/painted-ink.js';
import { recordCommands, nearly } from './helpers.js';
import type { TextStyle } from '../src/render/types.js';

// The numeral 4 overhangs its advance on both sides. Width cannot be inferred
// from the zero glyph or the nominal note box.
const measurer = { measureText(text: string, style: TextStyle) {
    const size = style.fontSize, advance = text.length * size * .5;
    const left = text === '4' ? -size * .4 : 0;
    const right = text === '4' ? size : advance;
    return { w: advance, advance, inkLeft: left, inkRight: right,
        centerOffset: (right + left - advance) / 2, h: size * .8, baseline: size * .7 };
} };

for (const size of [16, 22, 32]) for (const side of ['pre', 'post']) {
    test(`grace reserves overhanging numerals and proportional round beams at ${size}px, ${side}`, () => {
        const result = compileScore(`@set(fontsize=${size}) @grace(1,{4},side=${side})`, { textMeasurer: measurer });
        assert.deepEqual(result.diagnostics, []);
        const node = result.layout.objects[0];
        assert.ok(node instanceof GraceTemporal);
        const graceSize = size * .7;
        const commands = recordCommands(result.layout);
        const beam = commands.find(c => c.kind === 'line')!;
        const hook = commands.find(c => c.kind === 'path')!;
        assert.equal(beam.kind, 'line'); assert.equal(hook.kind, 'path');
        assert.ok(nearly(beam.style!.strokeWidth!, graceSize * .055));
        assert.ok(nearly(hook.style!.strokeWidth!, graceSize * .07));
        const expectedWidth = size * .5 + graceSize * .2 + graceSize * 1.4;
        assert.ok(nearly(node.box.w, expectedWidth), 'the rigid block includes actual numeral overhang');
        for (const command of commands) for (const ink of paintedCommandRegions(command, measurer)) {
            assert.ok(ink.x >= node.box.x - 1e-6 && ink.x + ink.w <= node.box.x + node.box.w + 1e-6,
                `paint ${JSON.stringify(ink)} escaped the rigid block ${JSON.stringify(node.box)}`);
        }
    });
}
