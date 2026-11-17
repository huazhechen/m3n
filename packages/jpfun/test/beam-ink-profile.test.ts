import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileScore } from '../src/pipeline.js';
import { paintedCommandRegions } from '../src/layout/painted-ink.js';
import { defaultTextMeasurer } from '../src/render/text.js';
import { attachmentCommands } from './helpers.js';

test('joined beams reserve both round caps as well as their vertical stroke', () => {
    for (const source of ['1/ 2/', '1/@a 2/@b @beam(a,b)', '1// 2//']) {
        const result = compileScore(source);
        assert.equal(result.diagnostics.filter(d => d.severity === 'error').length, 0);
        const beams = result.layout.attachments.filter(a => attachmentCommands(a).every(c => c.kind === 'line'));
        assert.ok(beams.length);
        for (const beam of beams) for (const command of attachmentCommands(beam)) {
            const ink = paintedCommandRegions(command, defaultTextMeasurer)[0];
            assert.ok(beam.regions.some(r => r.x <= ink.x + 1e-6 && r.y <= ink.y + 1e-6
                && r.x + r.w >= ink.x + ink.w - 1e-6 && r.y + r.h >= ink.y + ink.h - 1e-6),
            'the spacing profile must contain the entire painted round stroke');
        }
    }
});
