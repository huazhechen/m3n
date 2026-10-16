import { test } from "node:test";

import { assert, commandsOfKind, nearly, parse } from "./helpers.js";

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
