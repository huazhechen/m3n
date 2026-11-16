import { ASTFunctionClass, ASTFunctionNode, ASTNodeBase, FunctionArgs, ParserContext, SourceSpan, LengthValue } from "../ASTtypes.js";
// M3N modification: optional anchored annotations avoid previously laid out music; text weight is shared by measurement and painting.
import { ErrorDiagnostic } from "../../diagnostic.js";
import { findClosingQuote, quote, removeQuote } from "../../parser/parse-utils/string-utils.js";
import type { GrammarCallNodeTyped } from "../../parser/grammarType.js";
import { isVisualTemporalNode, TemporalNodeBase, type VisualTemporalNode } from "../temporal.js";
import type { AttachmentLayoutContext, LayoutAttachment, LayoutBox, LayoutPrepareContext } from "../../layout/types.js";
import type { Painter, TextStyle } from "../../render/types.js";
import type { LoweringContext } from "../../lowering/loweringContext.js";

type TextAlign = "left" | "center" | "right";

class TextFunction extends ASTFunctionNode {
    static override def = {
        name: ["text"],
        description: "文本标记",
        details: `\
~~~jpfun
@text(进入主题, size=0.8em, align=center)
~~~
**简写**：直接写双引号文本，如 \`"进入主题"\`；可跨行，双引号须配对`,
        allowExtraArgs: false,
        args: [
            {
                type: "string" as const,
                description: "文本内容，可直接换行；含逗号等歧义字符时需加引号",
                default: null,
            },
            {
                name: "size",
                description: "文本字号",
                type: "length" as const,
                default: {
                    value: 0.8, // 常用于标记，默认小一些
                    unit: "em",
                } as LengthValue,
            },
            {
                name: "lineheight",
                description: "相对自身字号的行高倍数",
                type: "number" as const,
                default: 1.25,   // 相对自身字号的倍数
            },
            {
                name: "align",
                description: "文本对齐方式：`left`、`center` 或 `right`",
                type: "string" as const,
                default: "left",
            },
            {
                name: "font",
                description: "文本字体，空值沿用当前字体设置",
                type: "string" as const,
                default: ""
            },
            {
                name: "above",
                description: "可选宿主标签；文字作为附件排在宿主及先前关系记号上方，不推进时间",
                type: "label" as const,
                namedOnly: true,
                default: "",
            },
            {
                name: "weight",
                description: "文本字重，400 为常规，700 为粗体",
                type: "number" as const,
                namedOnly: true,
                default: 400,
            },
            {
                name: "local",
                description: "上方标题仅在所在行预留高度，不计入等行高音乐最大值",
                type: "boolean" as const,
                namedOnly: true,
                default: false,
            },
            {
                name: "linestart",
                description: "上方附件的左边缘对齐谱行左边缘",
                type: "boolean" as const,
                namedOnly: true,
                default: false,
            },
            {
                name: "frame",
                description: "行内方框文字，原生预留内边距且不推进音乐时间",
                type: "boolean" as const,
                namedOnly: true,
                default: false,
            },
        ],
    };

    static override deSugarAtom(source: string, start: number, end: number) {
        if (source[start] !== '"') return null;
        const close = findClosingQuote(source, start, end);
        if (close < 0) return null; // 未闭合就不去糖，与预处理“配对才算字符串”一致
        const node: GrammarCallNodeTyped = {
            kind: "call",
            typed: true,
            name: "text",
            args: new Map([[0, removeQuote(source.slice(start, close + 1))]]),
            span: { start, end: close + 1 },
            syntaxKind: "string",
        };
        return { next: close + 1, node };
    }

    lines: string[];
    size: number;
    lineAdvance: number;
    align: TextAlign;
    readonly font: string;
    readonly above: ASTNodeBase | null;
    readonly weight: number;
    readonly local: boolean;
    readonly frame: boolean;
    readonly linestart: boolean;
    constructor(sourceSpan: SourceSpan, args: FunctionArgs, ctx: ParserContext, parent: ASTNodeBase | null = null) {
        super(sourceSpan, parent);
        const [text, size, lineHeight, align, font, above, weight, local, linestart, frame] = this.getArgValue(args, ctx) as [string, LengthValue, number, TextAlign, string | null, ASTNodeBase | string, number, boolean, boolean, boolean];
        this.font = font || ctx.variables.font;
        this.above = above instanceof ASTNodeBase ? above : null;
        this.weight = weight;
        this.local = local;
        this.frame = frame;
        this.linestart = linestart;
        if (align !== "left" && align !== "center" && align !== "right") {
            throw new ErrorDiagnostic(
                "E_TEXT_INVALID_ALIGN",
                "@text 的 align 参数必须是 'left'、'center' 或 'right'",
                sourceSpan,
            );
        }
        this.lines = text.split(/\r?\n/);
        this.size = ctx.length2px(size);
        this.lineAdvance = lineHeight * this.size;
        this.align = align;
    }

    override loweringEnter(ctx: LoweringContext) {
        if (!this.above) return [new TextTemporalNode(this)];
        let host = ctx.getTemporalNodes(this.above).at(-1);
        while (host?.foldedInto) host = host.foldedInto;
        if (!host || !isVisualTemporalNode(host)) {
            throw new ErrorDiagnostic("E_TEXT_INVALID_HOST", "@text 的 above 标签必须指向可见对象", this.sourceSpan);
        }
        ctx.addAttachment(new TextAboveAttachment(this, host));
        return [];
    }

    override toString() {
        const lineHeight = this.size === 0 ? 1.25 : this.lineAdvance / this.size;
        const above = this.above ? `, above=${(this.above as ASTFunctionNode).label}` : "";
        const weight = this.weight === 400 ? "" : `, weight=${this.weight}`;
        return `@text(${quote(this.lines.join("\n"))}, size=${this.size}px, lineheight=${lineHeight}, align=${this.align}, font=${quote(this.font)}${above}${weight}${this.local ? ', local=true' : ''}${this.linestart ? ', linestart=true' : ''}${this.frame ? ', frame=true' : ''})`;
    }
}

export const TextNode: ASTFunctionClass = TextFunction;

export class TextTemporalNode extends TemporalNodeBase {
    /** Per-line painted occupancy, relative to the text box (empty lines occupy no ink). */
    lineBounds: { x: number; y: number; w: number; h: number }[] = [];
    declare ast: TextFunction;
    declare box: LayoutBox;

    private style: TextStyle;
    private textBaselineY = 0;
    private centerOffsets: number[] = [];
    private textXs: number[] = [];

    constructor(ast: TextFunction, host?: VisualTemporalNode) {
        super();
        this.ast = ast;
        // Inline text is a zero-time control, not a positive-duration note column.
        // Keep source order so parallel voices cannot merge a note into this control.
        this.style = { fontSize: ast.size, fontFamily: ast.font, fill: "#000", textAlign: ast.align };
        if (ast.weight !== 400) this.style.fontWeight = ast.weight;
        if (host) this.style.semantic = { role: 'annotation', sourceSpan: host.ast.sourceSpan };
        this.initLayoutBox();
    }

    override prepareLayout(context: LayoutPrepareContext) {
        const { lines, align, lineAdvance } = this.ast;
        const measure = (text: string) => context.textMeasurer.measureText(text, this.style);
        this.centerOffsets = lines.map(line=>measure(line).centerOffset ?? 0);
        const metrics = lines.map(measure);
        const advanceWidth = Math.max(...metrics.map(m => m.w));
        const xs = metrics.map((_, index) => align === "right" ? advanceWidth
            : align === "center" ? advanceWidth / 2 - this.centerOffsets[index] : 0);
        const alignedAdvance = (m: typeof metrics[number]) => align === "right" ? m.advance ?? m.w
            : align === "center" ? (m.advance ?? m.w) / 2 : 0;
        // A frame must preserve its inset beyond painted overhang as well as
        // logical advance. Keep each line's alignment and shift the whole cell.
        const inkLeft = this.ast.frame ? Math.min(0, ...metrics.map((m, index) => xs[index] - alignedAdvance(m) + (m.inkLeft ?? 0))) : 0;
        const inkRight = this.ast.frame ? Math.max(advanceWidth, ...metrics.map((m, index) => xs[index] - alignedAdvance(m) + (m.inkRight ?? m.w))) : advanceWidth;
        const width = inkRight - inkLeft;
        // All lines share a baseline advance, but their ink need not have the
        // first line's ascent/descent (for example A / g / Chinese text).
        const top = Math.min(...metrics.map((m, index) => index * lineAdvance - m.baseline));
        const bottom = Math.max(...metrics.map((m, index) => index * lineAdvance - m.baseline + m.h));

        const inset = this.ast.frame ? 3.5 : 0;
        this.box.w = width + 2 * inset;
        this.box.h = bottom - top + 2 * inset;
        this.box.visualAxis = this.box.h / 2;
        this.textBaselineY = -top + inset;
        this.textXs = xs.map(x => inset + x - inkLeft);
        this.lineBounds = lines.flatMap((line, index) => {
            if (!line) return [];
            const m = metrics[index];
            const x = this.textXs[index] - alignedAdvance(m) + (m.inkLeft ?? 0);
            return [{ x, y: this.textBaselineY + index * lineAdvance - m.baseline,
                w: (m.inkRight ?? m.w) - (m.inkLeft ?? 0), h: m.h }];
        });
        if (align === "center") this.box.anchor = this.box.w / 2;
        else if (align === "right") {
            const lastChar = [...lines[0]].at(-1);
            this.box.anchor = inset + advanceWidth - inkLeft - (lastChar ? measure(lastChar).w / 2 : 0);
        } else {
            // 左对齐时锚点落在首字符中心，单字标记才能像音符一样对准宿主
            const firstChar = [...lines[0]][0];
            this.box.anchor = inset - inkLeft + (firstChar ? measure(firstChar).w / 2 : 0);
        }
    }

    override paint(painter: Painter) {
        const { lines, lineAdvance } = this.ast;
        if (this.ast.frame) painter.drawRect(this.box.x + 0.5, this.box.y + 0.5, this.box.w - 1, this.box.h - 1, { stroke: "#000", strokeWidth: 1 });
        let y = this.box.y + this.textBaselineY;
        for (const [index,line] of lines.entries()) {
            painter.drawText(line, this.box.x + this.textXs[index], y, this.style);
            y += lineAdvance;
        }
    }
}

class TextAboveAttachment implements LayoutAttachment {
    get spacingRole() { return this.ast.local ? 'local' as const : undefined; }
    readonly layer = "foreground" as const;
    readonly endPoints: readonly VisualTemporalNode[];
    readonly sourceSpan: SourceSpan;

    constructor(private readonly ast: TextFunction, private readonly host: VisualTemporalNode) {
        this.endPoints = [host];
        this.sourceSpan = { ...ast.sourceSpan };
    }

    createGeometry(context: AttachmentLayoutContext) {
        // Each geometry owns its text node, so later measurement passes cannot mutate its paint snapshot.
        const text = new TextTemporalNode(this.ast, this.host);
        text.prepareLayout(context);
        const box = text.box;
        const { host } = this;
        // Inline advance remains a logical spacing contract. Attachments must
        // additionally clamp and clear the actual paint, including overhang.
        const left = Math.min(0, ...text.lineBounds.map(region => region.x));
        const right = Math.max(box.w, ...text.lineBounds.map(region => region.x + region.w));
        box.x = this.ast.linestart ? context.originX - left : Math.max(context.originX - left, Math.min(
            host.box.x + host.box.anchor - box.anchor,
            context.originX + context.width - right,
        ));
        const line = context.lines[host.layoutLine];
        let start = line.columnOf(host), end = start;
        // Include the complete text width so neighboring notes and brackets also stay below it.
        line.columns.forEach((column, index) => {
            if (column.some(node => node.track === host.track
                && node.box.x <= box.x + right && node.box.x + node.box.w >= box.x + left)) {
                start = Math.min(start, index); end = Math.max(end, index);
            }
        });
        const extent = context.getRangeExtents(host.layoutLine, [start, end], host.track);
        // Local headings belong to the following music, so keep their inner gap
        // smaller than the separation between successive systems.
        const gap = this.ast.size * (this.ast.local ? 0.4 : 0.5);
        box.y = context.getVisualAxis(host.layoutLine, host.track) + (extent?.top ?? 0) - gap - box.h;
        return {
            regions: [{ x: box.x + left, y: box.y, w: right - left, h: box.h, line: host.layoutLine, track: host.track }],
            paint(painter: Painter) { text.paint(painter); },
        };
    }
}
