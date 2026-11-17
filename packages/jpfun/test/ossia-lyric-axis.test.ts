import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileScore } from '../src/pipeline.js';
import { recordCommands } from './helpers.js';

test('adjacent ossia lyric scopes share the complete music envelope of their lane', () => {
    const source = '@ossia({1},{@voice({@note("1,")}, , "春")},lane="2") '
        + '@ossia({2},{@voice({2}, , "花")},lane="2")';
    for (const uniformSystemHeight of [false, true]) {
        const result = compileScore(source, { alignRelations: true, uniformSystemHeight });
        assert.equal(result.diagnostics.filter(d => d.severity === 'error').length, 0);
        const texts = recordCommands(result.layout).filter(c => c.kind === 'text');
        const first = texts.find(c => c.text === '春')!;
        const next = texts.find(c => c.text === '花')!;
        assert.ok(first && next);
        assert.ok(Math.abs(first.y - next.y) < 1e-6,
            'the following lyric must not float above the shared low-octave envelope');
    }
});

function lyricOffsets(source: string) {
    const result = compileScore(source, { alignRelations: true });
    assert.deepEqual(result.diagnostics, []);
    return result.layout.attachments.flatMap(attachment => attachment.regions)
        .filter(region => 'text' in region && (region.text === '春' || region.text === '花'))
        .map(region => {
            const host = result.layout.objects.find(host => host.track === region.track
                && host.layoutLine === region.line && !host.T.isZero())!;
            return region.y - host.box.y - host.box.visualAxis;
        });
}

test('ossia lyric envelopes exclude the primary track and zero-duration bars', () => {
    const source = (main: string, bar: string) => `@ossia({${main}},{@voice({2}, , "花")},lane="2") ${bar}`;
    const baseline = lyricOffsets(source('1', '|'));
    for (const candidate of [source('@note("1,,")', '|'), source('1', '{@set(fontsize=80px) |}')]) {
        const offsets = lyricOffsets(candidate);
        assert.equal(offsets.length, 1);
        assert.ok(Math.abs(offsets[0] - baseline[0]) < 1e-6);
    }
});

test('ossia lyric music envelopes stop at system boundaries', () => {
    const joined = lyricOffsets('@ossia({1},{@voice({@note("1,")}, , "春")},lane="2") '
        + '@br() @ossia({2},{@voice({2}, , "花")},lane="2")');
    const single = lyricOffsets('@ossia({2},{@voice({2}, , "花")},lane="2")');
    assert.equal(joined.length, 2);
    assert.ok(joined[0] > joined[1]);
    assert.ok(Math.abs(joined[1] - single[0]) < 1e-6);
});
