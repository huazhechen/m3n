import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compileScore } from '../src/pipeline.js';
import { renderLayoutPagesToSvg } from '../src/render/svg.js';

test('SVG exposes host-owned event groups and source-aware lyric rows', () => {
    const result = compileScore('N: 1 2\nL: 春天\nL: 花开');
    const [svg] = renderLayoutPagesToSvg(result.layout, {
        objectAttributes: node => node.T.compare(0) > 0 ? { 'data-event': String(node.ast.sourceSpan.start) } : undefined,
        textAttributes: style => style.semantic?.role === 'lyric' ? { 'data-verse': String(style.semantic.row), 'data-source': String(style.semantic.sourceSpan.start) } : undefined,
    });
    assert.equal((svg.match(/<g data-event=/g) ?? []).length, 2);
    assert.equal((svg.match(/data-verse=/g) ?? []).length, 4);
    assert.match(svg, /data-verse="1"/);
});

test('opt-in single-event hairpins paint a native attachment without changing the default validation', () => {
    const result = compileScore('1@a 2 @dyn(a,a,24,single=true)');
    assert.ok(result.layout.attachments.some(attachment => attachment.regions.length > 0));
    assert.throws(() => compileScore('1@a 2 @dyn(a,a,24)'), { code: 'E_DYN_ZERO_SPAN' });
});

test('native lyric underlines paint only the selected slots and survive serialization', () => {
    const source = '@voice({1 2 3},,"{起来，} 春 {天里}",lyricunderlines="0:0,0:2")';
    const result = compileScore(source);
    const [svg] = renderLayoutPagesToSvg(result.layout);
    assert.equal((svg.match(/<line /g) ?? []).length, 2);
    const plain = compileScore('@voice({1 2 3},,"{起来，} 春 {天里}")');
    assert.equal((renderLayoutPagesToSvg(plain.layout)[0].match(/<line /g) ?? []).length, 0);
    const serialized = result.ast.toString(source);
    assert.match(serialized, /lyricunderlines=/);
    assert.equal((renderLayoutPagesToSvg(compileScore(serialized).layout)[0].match(/<line /g) ?? []).length, 2);
});
