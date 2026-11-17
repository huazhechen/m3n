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
