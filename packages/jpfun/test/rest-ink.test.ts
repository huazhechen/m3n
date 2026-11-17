import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compileScore, DefaultTextMeasurer, RecordingPainter } from '../src/core.js';
import { paintedCommandRegions } from '../src/layout/painted-ink.js';

const fallback = new DefaultTextMeasurer();
const textMeasurer = {
    measureText(text: string, style: Parameters<typeof fallback.measureText>[1]) {
        const metrics = fallback.measureText(text, style);
        return { ...metrics, inkLeft: 2, inkRight: metrics.w + 4, centerOffset: 3 };
    },
};

for (const count of [3, 4, 12]) test(`multi-rest ${count} centers its measured numeral ink on the beam`, () => {
    const result = compileScore(`@meter(4,4) @rest(${count})`, { textMeasurer });
    const rest = result.layout.objects.find(node => node.T.toNumber() > 0)!;
    const painter = new RecordingPainter();
    rest.paint(painter);
    const beam = painter.commands.find(command => command.kind === 'line')!;
    assert(beam.kind === 'line');
    const text = painter.commands.find(command => command.kind === 'text')!;
    const [ink] = paintedCommandRegions(text, textMeasurer);
    assert(Math.abs(ink.x + ink.w / 2 - (beam.x1 + beam.x2) / 2) < 1e-9,
        'the count must center actual strokes instead of its asymmetric text advance');
});
