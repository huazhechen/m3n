import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileScore } from '../src/pipeline.js';
import { attachmentCommands } from './helpers.js';

test('compact lyric placeholders consume their slot without painting unreserved zero-ink text', () => {
    const result = compileScore('@voice({1 2}, , "{\u200B}{春}",compactlyrics=true)');
    assert.equal(result.diagnostics.filter(d => d.severity === 'error').length, 0);
    const lyrics = result.layout.attachments.flatMap(a => attachmentCommands(a)).filter(c => c.kind === 'text');
    assert.ok(lyrics.some(c => c.text === '春'));
    assert.ok(lyrics.every(c => c.text.replaceAll('\u200B', '').trim()),
        'a discarded placeholder must not create a phantom system on another page');
    assert.equal(result.layout.objects.filter(n => !n.T.isZero()).length, 2);
    assert.equal(result.lowering.duration.toNumber(), 2);
});
