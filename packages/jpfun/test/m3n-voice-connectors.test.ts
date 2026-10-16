import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compileScore } from '../src/pipeline.js';
import { renderLayoutPagesToSvg } from '../src/render/svg.js';
import { compilePlayback } from '../src/playback/compile.js';
import { attachmentCommands, playedNotes } from './helpers.js';

test('repeated voice connectors span every system and reserve space before its music', () => {
    for (const connect of ['[-]', '{-}']) for (const autoWrap of [false, true]) {
        const music = autoWrap ? Array(16).fill('1 2 3 4 |').join(' ') : '1 2 | @br() 3 4 | @pb() 5 6 |';
        const source = `@page(width=320px,height=260px) @voices(@voice({${music}},Lead),@voice({${music}},Bass),connect="${connect}",repeatconnect=true)`;
        const result = compileScore(source, { autoWrap });
        assert.deepEqual(result.diagnostics, []);
        const notes = result.layout.objects.filter(node => !node.T.isZero());
        const lines = [...new Set(notes.map(node => node.layoutLine))];
        assert.ok(lines.length >= 3);
        assert.ok(result.layout.pages.length > 1);
        const connectors = result.layout.attachments.filter(item => item.layer === 'background' && item.box.h > 0);
        assert.equal(connectors.length, lines.length);
        for (const line of lines) {
            const members = notes.filter(node => node.layoutLine === line);
            const top = Math.min(...members.map(node => node.box.y + node.box.visualAxis));
            const bottom = Math.max(...members.map(node => node.box.y + node.box.visualAxis));
            const [connector] = connectors.filter(item => item.box.y < top && item.box.y + item.box.h > bottom);
            assert.ok(connector, `missing connector on system ${line}`);
            assert.ok(connector.box.x >= 39);
            assert.ok(connector.box.x + connector.box.w < Math.min(...members.map(node => node.box.x)));
            assert.equal(attachmentCommands(connector).filter(item => item.kind === 'path').length, connect === '[-]' ? 2 : 1);
        }
        const pages = renderLayoutPagesToSvg(result.layout);
        assert.equal(pages.join('').match(/<path /g)?.length, lines.length * (connect === '[-]' ? 2 : 1));
        assert.equal(pages.join('').match(/>Lead<\/text>/g)?.length, 1);
        assert.equal(pages.join('').match(/>Bass<\/text>/g)?.length, 1);
        const baseline = compileScore(source.replace(',repeatconnect=true', ''), { autoWrap });
        assert.deepEqual(playedNotes(compilePlayback(result.lowering)).map(note => [note.midi, note.start.toString(), note.duration.toString()]),
            playedNotes(compilePlayback(baseline.lowering)).map(note => [note.midi, note.start.toString(), note.duration.toString()]));
    }
});

test('repeated connectors preserve the upstream default and survive serialization', () => {
    const voices = '@voices(@voice({1 @br() 2}),@voice({3 @br() 4})';
    assert.equal(compileScore(`${voices})`).layout.attachments.filter(item => item.layer === 'background').length, 1);
    const source = `${voices},repeatconnect=true)`;
    const result = compileScore(source);
    const serialized = result.ast.toString(source);
    assert.match(serialized, /repeatconnect=true/);
    assert.equal(compileScore(serialized).layout.attachments.filter(item => item.layer === 'background').length, 2);
});
