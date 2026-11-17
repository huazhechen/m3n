import { test } from "node:test";

import { assert, commandsOfKind, nearly, parse, compileValid, recordCommands } from "./helpers.js";
import { prepareQuarterNote } from "../src/functions/tempo/glyph.js";
import { DefaultTextMeasurer } from "../src/core.js";
import { paintedCommandRegions } from "../src/layout/painted-ink.js";
import { RecordingPainter } from "../src/render/recording.js";

for (const size of [16, 22, 32]) for (const noteGap of [0, 11]) test(`tempo reserves measured text overhang at ${size}px, gap=${noteGap}`, () => {
    const fallback = new DefaultTextMeasurer();
    const overhang = size * .2;
    const textMeasurer = { measureText(text: string, style: Parameters<typeof fallback.measureText>[1]) {
        const metrics = fallback.measureText(text, style);
        return text.startsWith('= ') ? { ...metrics, inkRight: metrics.w + overhang } : metrics;
    } };
    const source = `@tempo(72,size=${size}px) 1`;
    const options = { noteGap, minimumNoteGap: noteGap * .6 };
    const result = compileValid(source, { ...options, textMeasurer });
    const [tempo, note] = result.layout.objects;
    const painter = new RecordingPainter();
    tempo.paint(painter);
    const right = Math.max(...painter.commands.flatMap(command => paintedCommandRegions(command, textMeasurer)).map(piece => piece.x + piece.w));
    assert(right > tempo.box.x + tempo.box.w, 'fixture paints beyond the logical tempo width');
    assert(note.box.x >= right - 1e-9, 'the following note clears actual tempo ink');
    const ordinary = compileValid(source, { ...options, textMeasurer: fallback });
    assert(nearly(note.box.x - ordinary.layout.objects[1].box.x, overhang), 'overhang is reserved in addition to the configured clearance');
});

test("tempo 忽略音符高度并与同轨文字对齐", () => {
    const commands = commandsOfKind(`@tempo(96) @text("96", size=1em)`, "text");
    const tempo = commands.find(command => command.text === "= 96");
    const text = commands.find(command => command.text === "96");
    assert(tempo && text && nearly(tempo.y, text.y),
        "tempo equals text and following plain text must share one baseline");
});

test("tempo font override survives serialization and leaves the surrounding font unchanged", () => {
    const source = `@set(font="serif") @tempo(96, font="sans-serif") @text("plain") @tempo(120)`;
    for (const input of [source, parse(source).toString()]) {
        const commands = commandsOfKind(input, "text");
        assert(commands.find(command => command.text === "= 96")?.style.fontFamily === "sans-serif");
        assert(commands.find(command => command.text === "plain")?.style.fontFamily === "serif");
        assert(commands.find(command => command.text === "= 120")?.style.fontFamily === "serif");
    }
});

test('whole and half metronome units have transparent counters and the whole note has no stem', () => {
    for (const unit of [1, 2]) {
        const glyph = prepareQuarterNote(22, unit);
        assert(glyph.commands.filter(c => c.op === 'M').length === 2, 'hollow head needs an inner counter');
        assert(glyph.commands.filter(c => c.op === 'L').length === (unit === 1 ? 0 : 2), 'only the half note has a stem');
        const result = compileValid(`@tempo(120,unit=${unit}) 1`);
        assert(recordCommands(result.layout).some(c => c.kind === 'text' && c.text === `= ${120 * unit / 4}`), 'display retains denominator conversion');
    }
});

for (const unit of [1, 2, 4, 8, 16, 32, 64]) test(`tempo unit ${unit} reserves all painted flag endpoints with short text ink`, () => {
    const textMeasurer = { measureText(text: string, style: { fontSize: number }) {
        return { w: text.length * style.fontSize * .5, h: style.fontSize * .1, baseline: style.fontSize * .08 };
    } };
    const result = compileValid(`@tempo(120,unit=${unit},size=22px)`, { textMeasurer });
    const node = result.layout.objects[0];
    const commands = recordCommands(result.layout);
    for (const command of commands) if (command.kind === 'path') for (const point of command.commands) {
        if (point.op === 'Z') continue;
        assert(point.y > node.box.y || nearly(point.y, node.box.y), 'glyph starts within its box');
        assert(point.y < node.box.y + node.box.h || nearly(point.y, node.box.y + node.box.h), 'flag endpoints fit even when text has almost no descent');
    }
    const text = commands.find(c => c.kind === 'text')!;
    assert(text.kind === 'text', 'tempo text is painted');
    const metrics = textMeasurer.measureText(text.text, text.style);
    assert(nearly(node.box.y + node.box.visualAxis!, text.y - metrics.baseline + metrics.h / 2), 'extending the ink envelope does not move the text alignment axis');
});
