import { test } from "node:test";
import { compilePlayback } from "../src/playback/compile.js";
import { ASTFunctionNode } from "../src/functions/ASTtypes.js";
import { isVisualTemporalNode } from "../src/functions/temporal.js";
import { assert, attachmentCommands, compileValid, expectDiagnostic, layoutOf, lower, nearly, playedNotes } from "./helpers.js";

test("小节线前的导航记号与音符行对齐并预留横向空间", () => {
    const { layout, lowering } = compileValid('1 2 @bar(4,before={@symbol(fine,size=12px) @symbol(dc,size=12px)})');
    const bar = layout.objects.at(-1)!;
    const previous = layout.objects.at(-2)!;
    const labels = [...lowering.astToTemporal.values()].flat().filter(node =>
        node.ast instanceof ASTFunctionNode && node.ast.callName === "symbol" && isVisualTemporalNode(node));
    assert(labels.length === 2, "both navigation marks must remain in the source index");
    let right = previous.box.x + previous.box.w;
    for (const label of labels) {
        assert(isVisualTemporalNode(label), "navigation marks must be visible");
        assert(nearly(label.box.y + label.box.visualAxis, previous.box.y + previous.box.visualAxis),
            "navigation marks must share the music axis");
        assert(label.box.x > right, "navigation marks must have their own horizontal space");
        assert(label.foldedInto === bar && label.layoutLine === bar.layoutLine && label.t.equals(bar.t),
            "navigation marks must travel with their closing bar without adding time");
        right = label.box.x + label.box.w;
    }
    assert(right < bar.box.x + bar.box.anchor, "navigation marks must finish before the closing bar");
    assert(lowering.duration.equals(2), "navigation marks must not change musical duration");
});

test("行内导航记号不抬高房子括线", () => {
    const clearance = (before: string) => {
        const layout = layoutOf(`|: 1@a 2@b @bar(4${before}) @volta(a,b,1)`);
        const house = layout.attachments[0];
        const horizontal = attachmentCommands(house).find(command => command.kind === "line")!;
        const note = layout.objects[2];
        assert(house.box.y + house.box.h < note.box.y, "the bracket must clear the notes");
        return note.box.y + note.box.visualAxis - horizontal.y1;
    };
    const plain = clearance("");
    for (const name of ["fine", "dc", "ds"]) {
        assert(nearly(clearance(`,before={@symbol(${name},size=12px)}`), plain),
            `${name} must not raise the bracket`);
    }
});

test("行内导航保留 D.C.、D.S.、Fine 与反复的播放语义", () => {
    for (const [above, inline] of [
        ['1 2 @up({|},$fine) 3 @up({||},$dc)', '1 2 @bar(0,before={$fine}) 3 @bar(1,before={$dc})'],
        ['1 $segno 2 @up({|},$fine) 3 @up({||},$ds)', '1 $segno 2 @bar(0,before={$fine}) 3 @bar(1,before={$ds})'],
        ['|: 1 2 @up({:|},$fine) 3 @up({||},$dc)', '|: 1 2 @bar(4,before={$fine}) 3 @bar(1,before={$dc})'],
    ]) {
        const played = (source: string) => playedNotes(compilePlayback(lower(source)))
            .map(note => `${note.midi}@${note.start}/${note.duration}`).join(" ");
        assert(played(above) === played(inline), "moving navigation must preserve the performance timeline");
    }
});

test("小节线前置内容拒绝音符、换行和并行声部", () => {
    for (const before of ["1", "@br() $fine", "@stack($fine,$dc)"]) {
        expectDiagnostic(() => lower(`1 @bar(0,before={${before}})`), "E_BAR_BEFORE_CONTENT");
    }
});

test("带前置内容的小节线序列化保留显示和播放记号", () => {
    const source = '1 @bar(1,before={@symbol(fine,size=12px)})';
    const result = compileValid(source);
    const bar = result.layout.objects.at(-1)!;
    const text = bar.ast.toString(source);
    assert(text.includes("before=") && text.includes("fine"), "serialization must retain the inline content");
    assert(compileValid(`1 ${text}`).layout.objects.at(-1)!.box.w === bar.box.w,
        "serialized navigation must keep its measured width");
});
