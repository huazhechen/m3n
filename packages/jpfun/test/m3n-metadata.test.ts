import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compileScore } from '../src/pipeline.js';
import { renderLayoutPagesToSvg } from '../src/render/svg.js';
import { defaultTextMeasurer } from '../src/render/text.js';
import { recordCommands } from './helpers.js';

test('compact lyrics collapse blank rows per system while preserving row metadata and serialization', () => {
    const content = '1 2 @br() 3 4 @br() 5 6';
    const blank = '{\u200B}';
    const lyrics = `"春 天 ${blank} ${blank} @ @","花 开 @ @ ${blank} ${blank}","清 风 好 啊 你 好"`;
    const source = `@voice({${content}},,${lyrics},compactlyrics=true)`;
    const compact = compileScore(source);
    const single = compileScore(`@voice({${content}},,"春 天 好 啊 你 好")`);
    const original = compileScore(`@voice({${content}},,${lyrics})`);
    const commands = recordCommands(compact.layout).filter(command => command.kind === 'text');
    const notes = (result: typeof compact) => result.layout.objects.filter(node => !node.T.isZero());
    const lastGap = (result: typeof compact) => notes(result)[4].box.y - notes(result)[2].box.y;
    assert.ok(Math.abs(lastGap(compact) - lastGap(single)) < 1e-6);
    assert.ok(lastGap(original) > lastGap(compact));
    assert.ok(compact.layout.bounds.h < original.layout.bounds.h);
    const visible = commands.find(command => command.text === '好')!;
    assert.equal(visible.style.semantic?.row, 2);
    const placeholder = commands.find(command => command.text === '\u200B' && command.style.semantic?.row === 0)!;
    assert.equal(placeholder.y, visible.y);
    const serialized = compact.ast.toString(source);
    assert.match(serialized, /compactlyrics=true/);
    assert.equal(compileScore(serialized).layout.bounds.h, compact.layout.bounds.h);
});

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

test('lyric prefixes reserve space on the left without moving syllables away from their note ports', () => {
    const prefixes = JSON.stringify(JSON.stringify({ '0:0': '1.', '1:0': '2.4.', '2:0': '3.' }));
    const source = `@page(width=320px) @voice({1 2 3},,"春 天 好","花 开 好","清 风 好",lyricprefixes=${prefixes})`;
    const result = compileScore(source, { autoWrap: true });
    const texts: { text: string; x: number; y: number; w: number; role?: string }[] = [];
    for (const attachment of result.layout.attachments) attachment.paint({
        drawText(text, x, y, style) {
            texts.push({ text, x, y, w: defaultTextMeasurer.measureText(text, style).w, role: style.semantic?.role });
        },
        drawLine() {}, drawRect() {}, drawCircle() {}, drawPath() {},
    });
    const note = result.layout.objects.find(node => node.T.compare(0) > 0)!;
    const first = texts.find(item => item.role === 'lyric')!;
    assert.ok(Math.abs(first.x + first.w / 2 - (note.box.x + note.ports.lyric.x)) < 1e-6);
    const labels = texts.filter(item => item.role === 'lyric-prefix');
    assert.deepEqual(labels.map(item => item.text), ['1.', '2.4.', '3.']);
    for (const label of labels) {
        const syllable = texts.find(item => item.role === 'lyric' && item.y === label.y)!;
        assert.ok(label.x >= 39 && label.x + label.w < syllable.x);
    }
    const serialized = result.ast.toString(source);
    assert.match(serialized, /lyricprefixes=/);
    const [svg] = renderLayoutPagesToSvg(compileScore(serialized).layout, {
        textAttributes: style => style.semantic?.role === 'lyric-prefix' ? { 'data-prefix': 'true' } : undefined,
    });
    assert.equal((svg.match(/data-prefix="true"/g) ?? []).length, 3);
    assert.match(svg, />2\.4\.<\/text>/);
});
