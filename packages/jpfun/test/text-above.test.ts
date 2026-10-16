import { test } from "node:test";
import { compileScore } from "../src/pipeline.js";
import { assert, nearly, parse, recordCommands } from "./helpers.js";

test("anchored text sits outside tuplets, ties, hairpins and earlier annotations without consuming time", () => {
    const source = `@tuplet({@up(1, $p, @symbol(staccato,size=4px))@a 2 3@b},2)
        @tie(a,b) @dyn(a,b,24)
        @text(Instruction,size=14px,above=a) @text(Section,size=14px,above=a)`;
    for (const input of [source, parse(source).toString(source)]) {
        const result = compileScore(input);
        assert(nearly(result.lowering.duration.toNumber(), 2));
        const attachments = result.layout.attachments;
        assert(attachments.length === 5);
        const [instruction, section] = attachments.slice(-2).map(item => item.box);
        for (const music of attachments.slice(0, -2)) {
            assert(instruction.y + instruction.h < music.box.y,
                "instructions must remain above completed musical relations");
        }
        assert(section.y + section.h < instruction.y, "the section name must sit above its instruction");
        const texts = recordCommands(result.layout).filter(command => command.kind === "text");
        assert(texts.filter(command => command.text === "Instruction").length === 1);
        assert(texts.find(command => command.text === "Instruction")?.style.semantic?.role === "annotation");
    }
});

test("anchored text follows its host across systems and stays within the page margins", () => {
    const result = compileScore(`@page(width=320px,left=32px,right=32px,height=240px,top=24px,bottom=24px)
        1 @br() 2 3 4@a @text("Long instruction",size=14px,above=a)`);
    const host = result.layout.objects.at(-1)!;
    const region = result.layout.attachments.at(-1)!.regions[0];
    assert(region.line === host.layoutLine && region.track === host.track);
    assert(region.x >= 32 && region.x + region.w <= 288);
    assert(region.y + region.h < host.box.y);
    assert(result.layout.pages.some(page => region.y >= page.bounds.y && region.y + region.h <= page.bounds.y + page.bounds.h));
});
