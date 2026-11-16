import { test } from "node:test";

import { ASTFunctionNode } from "../src/functions/ASTtypes.js";
import { analyzeScoreSyntax } from "../src/pipeline.js";
import { quote } from "../src/parser/parse-utils/string-utils.js";
import { paintedCommandRegions } from "../src/layout/painted-ink.js";
import { TextTemporalNode } from "../src/functions/text/index.js";
import { assert, compileValid, commandsOfKind, expectCompileError, layoutOf, nearly, parse, recordCommands } from "./helpers.js";

for (const align of ['left', 'center', 'right']) test(`unframed ${align} text reports actual per-line ink independently of advance`, () => {
    const measurer = { measureText() { return { w: 20, advance: 18, h: 10, baseline: 8, inkLeft: -4, inkRight: 28, centerOffset: 3 }; } };
    const { layout } = compileValid(`@text(A,align=${align})`, { textMeasurer: measurer });
    const node = layout.objects[0] as TextTemporalNode;
    const command = recordCommands(layout).find(command => command.kind === 'text')!;
    const ink = paintedCommandRegions(command, measurer)[0];
    assert(nearly(node.box.w, 20), 'inline advance remains independent of painted width');
    const region = node.lineBounds[0];
    assert(nearly(region.x + node.box.x, ink.x) && nearly(region.w, ink.w), 'line occupancy must cover actual overhang');
    assert(nearly(region.y + node.box.y, ink.y) && nearly(region.h, ink.h), 'line occupancy must use the actual baseline');
});

for (const align of ['left', 'center', 'right']) test(`framed ${align} text preserves its inset outside measured overhang`, () => {
    const measurer = { measureText() { return { w: 20, advance: 20, h: 10, baseline: 8, inkLeft: -4, inkRight: 28, centerOffset: 2 }; } };
    const { layout } = compileValid(`@text(A,frame=true,align=${align})`, { textMeasurer: measurer });
    const commands = recordCommands(layout);
    const text = commands.find(command => command.kind === 'text')!;
    const frame = commands.find(command => command.kind === 'rect')!;
    const ink = paintedCommandRegions(text, measurer)[0];
    assert(nearly(ink.x - (frame.x - 0.5), 3.5), 'left ink must retain the requested frame inset');
    assert(nearly(frame.x + frame.w + 0.5 - ink.x - ink.w, 3.5), 'right ink must retain the requested frame inset');
});

/** 只写一个 @text 时它就是唯一的可见对象 */
function textBox(source: string) {
    const objects = layoutOf(source).objects;
    assert(objects.length === 1, `Expected one visible object, got ${objects.length}`);
    return { box: objects[0].box, size: objects[0].ast.size };
}

test("文本盒子按最长行、行高倍数与首字符锚点测量", () => {
    for (const [source, width, height] of [
        ['@text("进入")', 2, 1],
        ['@text("上行\n下面这行更长")', 6, 2.25],
        ['@text("上行\n下行", lineheight=2)', 2, 3],
    ] as const) {
        const { box, size } = textBox(source);
        assert(nearly(box.w, size * width) && nearly(box.h, size * height), `${source}: measured dimensions`);
        assert(nearly(box.anchor, size / 2), `${source}: first character anchor`);
        assert(nearly(box.visualAxis, box.h / 2), `${source}: block center axis`);
    }
});

test("每行单独绘制且左对齐", () => {
    const commands = commandsOfKind(`@text("上行\n下行")`, "text");
    assert(commands.length === 2, `Expected one draw per line, got ${commands.length}`);

    const [first, second] = commands;
    assert(first.text === "上行" && second.text === "下行", "each line must be drawn as written");
    assert(nearly(first.x, second.x), "lines must be left aligned");
    assert(nearly(second.y - first.y, first.style.fontSize * 1.25),
        "baseline distance must be the line advance");
});

test("括号内的换行不打断 N: 声部语法糖", () => {
    // 换行属于 @text 这一个语法节点，voice 的断行判定看不见它
    const content = parse(`N: 1 2 @text("上行\n下行") 3`).content;
    assert(content.length === 1, `Expected the whole line to stay in one voice, got ${content.length} nodes`);

    const voice = content[0];
    assert(voice instanceof ASTFunctionNode && voice.callName === "voice",
        "the N: sugar must still produce exactly one voice");
});

test("align=center 时锚点与各行都取整块中心", () => {
    const result = layoutOf(`@text("上行\n下面这行更长", align=center)`);
    const box = result.objects[0].box;
    assert(nearly(box.anchor, box.w / 2), "centered text must anchor at the block center");

    const [first, second] = recordCommands(result);
    assert(first?.kind === "text" && second?.kind === "text", "each line must still be one draw command");
    assert(first.style.textAlign === "center", "the painter must center each line itself");
    assert(nearly(first.x, box.x + box.w / 2) && nearly(second.x, box.x + box.w / 2),
        "centered lines must share the block center line");
});

test("align=right 时锚点取末字符中心，各行取整块右缘", () => {
    const result = layoutOf(`@text("短\n下面这行更长", align=right)`);
    const box = result.objects[0].box;
    const [first, second] = recordCommands(result).filter(command => command.kind === "text");
    assert(box.anchor < box.w && box.anchor > box.w - first.style.fontSize,
        "right-aligned text must anchor at the first line's last character center");
    assert(first.style.textAlign === "right" && second.style.textAlign === "right",
        "the painter must right-align every line");
    assert(nearly(first.x, second.x) && nearly(first.x, box.x + box.w),
        "right-aligned lines must share the block right edge");
});

test("align 只接受 left、center 和 right", () => {
    expectCompileError(`@text("上行", align=middle)`, "E_TEXT_INVALID_ALIGN");
});

test("双引号语法糖等价于 @text", () => {
    const sugar = textBox(`"进入"`).box;
    const explicit = textBox(`@text("进入")`).box;
    assert(nearly(sugar.w, explicit.w) && nearly(sugar.h, explicit.h) && nearly(sugar.anchor, explicit.anchor),
        "sugar and explicit call must produce the same box");
});

test("语法糖里的逗号、括号和换行都属于文本", () => {
    const commands = commandsOfKind(`"a,b)c\n第二行"`, "text");
    assert(commands.map(command => command.text).join("|") === "a,b)c|第二行",
        "argument separators lose their meaning inside a string literal");
});

test("字符串把 \\X 反转义成 X", () => {
    const sugar = commandsOfKind(`"说\\"你好\\""`, "text");
    const explicit = commandsOfKind(`@text("说\\"你好\\"")`, "text");
    assert(sugar[0].text === `说"你好"`, `escaped quote must survive, got ${sugar[0].text}`);
    assert(explicit[0].text === sugar[0].text, "both paths must share one unescape rule");
});

test("文本源码往返保留换行、制表符和字体字符串", () => {
    for (const value of ["上行\n下行", "a\tb", '"Font Name", sans-serif', 'a\\b/"c"']) {
        const source = `@text(${quote(value)}, font=${quote(value)})`;
        const restored = parse(source).content[0].toString(source);
        const commands = commandsOfKind(restored, "text");
        assert(commands.map(command => command.text).join("\n") === value, "text must survive serialization");
        assert(commands.every(command => command.style.fontFamily === value), "font must survive serialization");
        const page = `@page(numbering=${quote(value)}, font=${quote(value)})`;
        const serializedPage = parse(page).content[0].toString(page);
        const node = parse(serializedPage).content[0];
        assert("font" in node && node.font === value, "page must preserve the font string");
        assert("numbering" in node && node.numbering === value, "page must preserve its numbering string");

        const set = `@set(font=${quote(value)})`;
        const serializedSet = parse(set).content[0].toString(set);
        assert(commandsOfKind(`${serializedSet} @text(Label)`, "text")[0].style.fontFamily === value,
            "set must preserve the font string");
    }
});

test("引号未配对时不去糖也不抛出", () => {
    const source = `"没闭合 1 2`;
    assert(!analyzeScoreSyntax(source).syntax.tokens.some(token => token.kind === "string"),
        "an unpaired quote must not be colored as a string");
    assert(layoutOf(source).objects.length === 2, "the notes after an unpaired quote must still compile");
});

test("语法糖着色为字符串并覆盖两侧引号", () => {
    const source = `1 "渐强"`;
    const tokens = analyzeScoreSyntax(source).syntax.tokens.filter(token => token.kind === "string");
    assert(tokens.length === 1 && source.slice(tokens[0].span.start, tokens[0].span.end) === `"渐强"`,
        "the string token must cover the quotes themselves");
});

// M3N: bearings differ from advance widths in real CJK fonts.
test('centered text accounts for each line ink bearings without changing its font or box',()=>{
 const result=compileValid('@text("甲乙\n丙",size=32px,align=center)',{textMeasurer:{measureText(text,style){return {w:text.length*style.fontSize,h:style.fontSize,baseline:style.fontSize*.8,centerOffset:text.length===2?.5:1}}}});
 const box=result.layout.objects[0].box;
 const commands=recordCommands(result.layout).filter(command=>command.kind==='text');
 assert(nearly(commands[0].x,box.x+box.w/2-.5),'first line accounts for its ink bearings');
 assert(nearly(commands[1].x,box.x+box.w/2-1),'second line accounts for its own ink bearings');
});

test('parallel inline text reserves a control column without splitting simultaneous notes', () => {
    const music = '@stack({1 2}, {@text("2.3.",size=12px) 3 4})';
    for (const source of [music, parse(music).toString(music)]) {
        const layout = layoutOf(source);
        const label = layout.objects.find(object => object.ast.callName === 'text')!;
        const notes = layout.objects.filter(object => object.T.toNumber() > 0);
        assert(notes.length === 4);
        const anchor = (object: typeof notes[number]) => object.box.x + object.box.anchor;
        for (const time of [0, 1]) {
            const simultaneous = notes.filter(object => object.t.toNumber() === time);
            assert(simultaneous.length === 2);
            assert(nearly(anchor(simultaneous[0]), anchor(simultaneous[1])), 'same-beat notes share an anchor');
        }
        assert(label.box.x + label.box.w < Math.min(...notes.map(object => object.box.x)), 'label clears the first music column');
    }
});


test("多行文字按所有行的实际升降部预留包络", () => {
    for (const frame of [false, true]) {
        const result = compileValid(`@text("A\nTall\ng",size=20px,lineheight=1,frame=${frame})`, {
            textMeasurer: { measureText(text) {
                const baseline = text === "Tall" ? 35 : text === "g" ? 5 : 8;
                const descent = text === "g" ? 12 : 0;
                return { w: text.length * 10, h: baseline + descent, baseline };
            } },
        });
        const node = result.layout.objects[0];
        const commands = recordCommands(result.layout).filter(command => command.kind === "text");
        const inset = frame ? 3.5 : 0;
        assert(nearly(node.box.h, 67 + inset * 2), "all lines must contribute to the total occupied height");
        for (const command of commands) {
            const ascent = command.text === "Tall" ? 35 : command.text === "g" ? 5 : 8;
            const descent = command.text === "g" ? 12 : 0;
            assert(command.y - ascent >= node.box.y + inset - 1e-6, "actual ascenders must fit");
            assert(command.y + descent <= node.box.y + node.box.h - inset + 1e-6, "actual descenders must fit");
        }
        assert(nearly(commands[1].y - commands[0].y, 20)
            && nearly(commands[2].y - commands[1].y, 20), "the requested baseline advance remains unchanged");
    }
});
