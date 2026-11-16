import { test } from "node:test";
import { compileScore } from "../src/pipeline.js";
import { assert, nearly, parse, recordCommands } from "./helpers.js";
import { paintedCommandRegions } from "../src/layout/painted-ink.js";
import { defaultTextMeasurer } from "../src/render/text.js";

const overhang = { measureText(text, style) {
    return text === 'WIDE' ? { w: 10, advance: 10, inkLeft: -80, inkRight: 90, centerOffset: 0, h: 14, baseline: 11 }
        : defaultTextMeasurer.measureText(text, style);
} } satisfies import('../src/render/types.js').TextMeasurer;

for (const host of ['1@a 2 3 4', '1 2 3 4@a']) test(`anchored unframed overhang stays inside both margins: ${host}`, () => {
    const result = compileScore(`@page(width=320px,left=32px,right=32px) ${host} @text(WIDE,size=14px,align=center,above=a)`, { textMeasurer: overhang });
    const command = recordCommands(result.layout).find(command => command.kind === 'text' && command.text === 'WIDE')!;
    const ink = paintedCommandRegions(command, overhang)[0], region = result.layout.attachments[0].regions[0];
    assert(ink.x >= 32 && ink.x + ink.w <= 288, 'complete ink must stay inside the content area');
    assert(region.x <= ink.x && region.x + region.w >= ink.x + ink.w, 'attachment occupancy must include overhang');
});

test('anchored overhang clears a neighboring high note beyond its logical advance', () => {
    const result = compileScore('@page(width=320px,left=32px,right=32px) 1@a @note(2,octave=3) 3 4 @text(WIDE,size=14px,align=center,above=a,local=true)', { textMeasurer: overhang });
    const high = result.layout.objects[1];
    const command = recordCommands(result.layout).find(command => command.kind === 'text' && command.text === 'WIDE')!;
    const ink = paintedCommandRegions(command, overhang)[0];
    assert(high.box.x > 42 && high.box.x < ink.x + ink.w, 'the high neighbor is reached by ink overhang');
    assert(ink.y + ink.h <= high.box.y - 5.6 + 1e-6, 'the annotation must clear the high neighbor');
});

test("anchored text sits outside tuplets, ties, hairpins and earlier annotations without consuming time", () => {
    const source = `@tuplet({@up(1, $p, @symbol(staccato,size=4px))@a 2 3@b},2)
        @tie(a,b) @dyn(a,b,24)
        @text(Instruction,size=14px,above=a) @text(Section,size=14px,above=a,weight=700)`;
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
        assert(texts.find(command => command.text === "Instruction")?.style.fontWeight === undefined);
        assert(texts.find(command => command.text === "Section")?.style.fontWeight === 700);
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
