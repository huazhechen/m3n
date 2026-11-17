import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compileValid, attachmentCommands, recordCommands } from './helpers.js';
import { paintedCommandRegions, paintedNodeRegions } from '../src/layout/painted-ink.js';
import { defaultTextMeasurer } from '../src/render/text.js';

for (const size of [16, 22, 32]) for (const [kind, music] of [
    ['scope beam', '@div({3 4},n=2)'],
    ['automatic beam', '3// 4//'],
    ['independent beams', '@set(div.autobeam=false) 3// 4//'],
]) test(`voice connectors include ${kind} ink on repeated systems at ${size}px`, () => {
    const { layout } = compileValid(`@set(fontsize=${size}) @voices(
        @voice({1 2 | @br() 3 4 |}),
        @voice({${music} | @br() ${music} |}),repeatconnect=true)`);
    const notes = layout.objects.filter(node => !node.T.isZero());
    const lead = notes[0].track;
    const connectors = layout.attachments.filter(item => item.layer === 'background');
    assert.equal(connectors.length, 2);
    const beams = recordCommands(layout).filter(command => command.kind === 'line' && command.y1 === command.y2)
        .flatMap(command => paintedCommandRegions(command, defaultTextMeasurer));
    for (const line of [...new Set(notes.map(note => note.layoutLine))]) {
        const members = notes.filter(note => note.layoutLine === line);
        const melody = members.filter(note => note.track === lead);
        const bass = members.filter(note => note.track !== lead);
        const axis = bass[0].box.y + bass[0].box.visualAxis;
        const painted = bass.flatMap(note => paintedNodeRegions(note, defaultTextMeasurer, true));
        const below = beams.filter(piece => piece.y >= axis && piece.y < axis + size);
        assert.ok(below.length > 0, 'exercise actual final beam paint on each system');
        const expectedBottom = Math.max(...[...painted, ...below].map(piece => piece.y + piece.h));
        const top = Math.min(...melody.flatMap(note => paintedNodeRegions(note, defaultTextMeasurer, true)).map(piece => piece.y));
        const connector = connectors.find(item => item.box.y <= top + 1e-6 && item.box.y + item.box.h > axis)!;
        assert.ok(connector, 'connector must belong to this system');
        const ink = attachmentCommands(connector).flatMap(command => paintedCommandRegions(command, defaultTextMeasurer));
        assert.ok(Math.abs(Math.max(...ink.map(piece => piece.y + piece.h)) - expectedBottom) < 1e-6,
            'connector must end at the complete bass music ink, including delegated beam paint');
        assert.ok(Math.abs(Math.min(...ink.map(piece => piece.y)) - top) < 1e-6,
            'beam measurement must not change the melody endpoint');
    }
});
