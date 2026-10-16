// M3N modification: font override and metronome unit/dot display; playback retains QPM.
import { TemporalNodeBase, type TimeState } from "../temporal.js";
import { ASTFunctionClass, ASTFunctionNode, ASTNodeBase, FunctionArgs, LengthValue, ParserContext, SourceSpan } from "../ASTtypes.js";
import type { LayoutBox, LayoutPrepareContext } from "../../layout/types.js";
import type { Painter, TextStyle } from "../../render/types.js";
import { quote } from "../../parser/parse-utils/string-utils.js";
import { prepareQuarterNote, type PreparedQuarterNote } from "./glyph.js";

class TempoFunction extends ASTFunctionNode {
    static override def = {
        name: ["tempo"],
        description: "设置时间线上的速度",
        details: `\
~~~jpfun
@tempo(96)
~~~
速度从当前时间位置起生效；用 \`1 ^ @tempo(96)\` 可将记号叠在音符上方`,
        allowExtraArgs: false,
        args: [
            {
                name: "bpm",
                description: "每分钟四分音符数",
                type: "number" as const,
                default: null,
            },
            {
                name: "size",
                description: "速度记号字号",
                type: "length" as const,
                default: {
                    value: 1,
                    unit: "em",
                } as LengthValue,
            },
            {
                name: "font",
                description: "速度数字字体，空值沿用当前字体设置",
                type: "string" as const,
                default: "",
            },
            { name: "unit", description: "速度显示音符分母", type: "number" as const, default: 4 },
            { name: "dots", description: "速度显示附点数", type: "number" as const, default: 0 },
        ],
    };

    bpm: number;
    unit: number;
    dots: number;
    size: number;
    readonly font: string;
    private readonly fontOverride: string;

    constructor(sourceSpan: SourceSpan, args: FunctionArgs, ctx: ParserContext, parent: ASTNodeBase | null = null) {
        super(sourceSpan, parent);
        const [bpm, size, font, unit, dots] = this.getArgValue(args, ctx) as [number, LengthValue, string, number, number];
        this.unit = [1, 2, 4, 8, 16, 32, 64].includes(unit) ? unit : 4;
        this.dots = Math.max(0, Math.min(2, Math.trunc(dots)));
        this.bpm = bpm;
        this.size = ctx.length2px(size);
        this.fontOverride = font;
        this.font = font || ctx.variables.font;
    }

    override loweringEnter() {
        return [new TempoTemporalNode(this)];
    }

    override toString() {
        return `@tempo(${this.bpm}, size=${this.size}px${this.fontOverride ? `, font=${quote(this.fontOverride)}` : ""}${this.unit !== 4 ? `, unit=${this.unit}` : ""}${this.dots ? `, dots=${this.dots}` : ""})`;
    }
}

export const TempoNode: ASTFunctionClass = TempoFunction;

class TempoTemporalNode extends TemporalNodeBase {
    declare ast: TempoFunction;
    declare box: LayoutBox;

    /** 字号和 bpm 在解析时已经固化，字形、文本、样式随之不再变 */
    private readonly glyph: PreparedQuarterNote;
    private readonly text: string;
    private readonly style: TextStyle;

    private glyphY = 0;
    private textX = 0;
    private textBaselineY = 0;

    constructor(ast: TempoFunction) {
        super();
        this.ast = ast;
        this.glyph = prepareQuarterNote(ast.size, ast.unit);
        this.text = `= ${Math.round(ast.bpm / ((4 / ast.unit) * (2 - 2 ** -ast.dots)) * 100) / 100}`;
        this.style = { fontSize: ast.size, fontFamily: ast.font, fill: "#000" };
        // 非法值不入时间状态，也不告知播放系统，效果是保持上一个速度
        if (Number.isFinite(ast.bpm) && ast.bpm > 0) this.playbackState = { bpm: ast.bpm };
        this.initLayoutBox();
    }

    override onTimeState(state: TimeState) {
        const bpm = this.playbackState?.bpm;
        if (bpm !== undefined) state.bpm = bpm;
    }

    override prepareLayout(context: LayoutPrepareContext) {
        const glyph = this.glyph;
        const metrics = context.textMeasurer.measureText(this.text, this.style);

        // 符头底端坐在文字基线上；符干比文字高时整块文字下移
        const textTop = Math.max(0, glyph.h - metrics.baseline);
        this.textX = glyph.w + this.ast.size * (0.26 + this.ast.dots * 0.28);
        this.textBaselineY = textTop + metrics.baseline;
        this.glyphY = this.textBaselineY - glyph.h;

        this.box.w = this.textX + metrics.w;
        this.box.h = textTop + metrics.h;
        this.box.anchor = glyph.stemCenterX;
        // Tempo 与同轨文字按等号所在的文字行对齐；符干只向上扩展占用，不参与对齐轴。
        this.box.visualAxis = textTop + metrics.h / 2;
    }

    override paint(painter: Painter) {
        painter.drawPath(
            this.glyph.commands,
            { fill: "#000" },
            {
                x: this.box.x,
                y: this.box.y + this.glyphY,
                scaleX: this.glyph.scale,
                scaleY: this.glyph.scale,
            },
        );
        for (let dot = 0; dot < this.ast.dots; dot += 1) painter.drawCircle(
            this.box.x + this.glyph.w + this.ast.size * (0.12 + dot * 0.28),
            this.box.y + this.textBaselineY - this.ast.size * 0.16,
            this.ast.size * 0.06, { fill: "#000" },
        );
        painter.drawText(
            this.text,
            this.box.x + this.textX,
            this.box.y + this.textBaselineY,
            this.style,
        );
    }
}
