import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compileScore, DefaultTextMeasurer, RecordingPainter } from '../src/core.js';
import { paintedCommandRegions } from '../src/layout/painted-ink.js';

const fallback = new DefaultTextMeasurer();
const textMeasurer = {
    measureText(text: string, style: Parameters<typeof fallback.measureText>[1]) {
        const metrics = fallback.measureText(text, style);
        return text === 'A' ? { ...metrics, inkRight: metrics.w + 3 } : metrics;
    },
};

for (const visits of ['', ',visits="1:C4;2:A4"']) for (const noteGap of [0, 13.2]) test(`key spacing reserves the measured tonic overhang (${visits || 'single row'}, gap=${noteGap})`, () => {
    const source = `@key(A4,size=16px${visits}) 1`;
    const options = { noteGap, minimumNoteGap: noteGap * 2 / 3 };
    const result = compileScore(source, { ...options, textMeasurer });
    const [key, note] = result.layout.objects;
    const painter = new RecordingPainter();
    key.paint(painter);
    const ink = painter.commands.flatMap(command => paintedCommandRegions(command, textMeasurer));
    const right = Math.max(...ink.map(piece => piece.x + piece.w));
    assert(right > key.box.x + key.box.w, 'regression must have ink beyond the logical key box');
    assert(note.box.x >= right - 1e-9, 'the following note must clear the measured tonic ink even without an elastic gap');
    const withoutOverhang = compileScore(source, { ...options, textMeasurer: fallback });
    assert(Math.abs(note.box.x - withoutOverhang.layout.objects[1].box.x - 3) < 1e-9,
        'the measured overhang must preserve the configured minimum clearance');
});

for (const key of ['C4', 'Db4', 'F#4']) for (const size of [16, 22, 32]) {
    test(`key ${key} at ${size}px centers the complete text and accidental ink on its axis`, () => {
        const measurer = {
            measureText(text: string, style: Parameters<typeof fallback.measureText>[1]) {
                const size = style.fontSize;
                return /^[A-G]$/.test(text)
                    ? { w: size * .6, h: size * 1.06, baseline: size * .8 }
                    : { w: text.length * size * .5, h: size * .78, baseline: size * .42 };
            },
        };
        const result = compileScore(`@key(${key},size=${size}px) 1`, { textMeasurer: measurer });
        assert.deepEqual(result.diagnostics, []);
        const node = result.layout.objects[0], painter = new RecordingPainter();
        node.paint(painter);
        const regions = painter.commands.flatMap(command => paintedCommandRegions(command, measurer));
        const top = Math.min(...regions.map(region => region.y));
        const bottom = Math.max(...regions.map(region => region.y + region.h));
        assert.ok(Math.abs(top - node.box.y) < 1e-6, 'no invisible space or ink overflow at the top');
        assert.ok(Math.abs(bottom - node.box.y - node.box.h) < 1e-6, 'reserve every painted descender and stroke');
        assert.ok(Math.abs((top + bottom) / 2 - node.box.y - node.box.visualAxis) < 1e-6,
            'the actual ink center must coincide with the music alignment axis');
    });
}
