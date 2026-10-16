import { ASTFunctionClass, ASTFunctionNode, ASTNodeBase, FunctionArgs, ParserContext, SourceSpan, LengthValue } from "../ASTtypes.js";
// M3N modification: optional anchored annotations avoid previously laid out music.
import { ErrorDiagnostic } from "../../diagnostic.js";
import { findClosingQuote, quote, removeQuote } from "../../parser/parse-utils/string-utils.js";
import type { GrammarCallNodeTyped } from "../../parser/grammarType.js";
import { DEFAULT_KEY, isVisualTemporalNode, TemporalNodeBase, type VisualTemporalNode } from "../temporal.js";
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
    constructor(sourceSpan: SourceSpan, args: FunctionArgs, ctx: ParserContext, parent: ASTNodeBase | null = null) {
        super(sourceSpan, parent);
        const [text, size, lineHeight, align, font, above] = this.getArgValue(args, ctx) as [string, LengthValue, number, TextAlign, string | null, ASTNodeBase | string];
        this.font = font || ctx.variables.font;
        this.above = above instanceof ASTNodeBase ? above : null;
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
        return `@text(${quote(this.lines.join("\n"))}, size=${this.size}px, lineheight=${lineHeight}, align=${this.align}, font=${quote(this.font)}${above})`;
    }
}

export const TextNode: ASTFunctionClass = TextFunction;

class TextTemporalNode extends TemporalNodeBase {
    declare ast: TextFunction;
    declare box: LayoutBox;

    private style: TextStyle;
    private textBaselineY = 0;

    constructor(ast: TextFunction, host?: VisualTemporalNode) {
        super();
        this.ast = ast;
        this.mergeKey = DEFAULT_KEY;
        this.style = { fontSize: ast.size, fontFamily: ast.font, fill: "#000", textAlign: ast.align };
        if (host) this.style.semantic = { role: 'annotation', sourceSpan: host.ast.sourceSpan };
        this.initLayoutBox();
    }

    override prepareLayout(context: LayoutPrepareContext) {
        const { lines, align, lineAdvance } = this.ast;
        const measure = (text: string) => context.textMeasurer.measureText(text, this.style);
        const first = measure(lines[0]);
        let width = first.w;
        for (let i = 1; i < lines.length; i++) width = Math.max(width, measure(lines[i]).w);

        this.box.w = width;
        this.box.h = (lines.length - 1) * lineAdvance + first.h;
        this.box.visualAxis = this.box.h / 2;
        this.textBaselineY = first.baseline;
        if (align === "center") this.box.anchor = width / 2;
        else if (align === "right") {
            const lastChar = [...lines[0]].at(-1);
            this.box.anchor = width - (lastChar ? measure(lastChar).w / 2 : 0);
        } else {
            // 左对齐时锚点落在首字符中心，单字标记才能像音符一样对准宿主
            const firstChar = [...lines[0]][0];
            this.box.anchor = firstChar ? measure(firstChar).w / 2 : 0;
        }
    }

    override paint(painter: Painter) {
        const { lines, align, lineAdvance } = this.ast;
        const x = this.box.x + (align === "center" ? this.box.w / 2 : align === "right" ? this.box.w : 0);
        let y = this.box.y + this.textBaselineY;
        for (const line of lines) {
            painter.drawText(line, x, y, this.style);
            y += lineAdvance;
        }
    }
}

class TextAboveAttachment implements LayoutAttachment {
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
        box.x = Math.max(context.originX, Math.min(
            host.box.x + host.box.anchor - box.anchor,
            context.originX + context.width - box.w,
        ));
        const line = context.lines[host.layoutLine];
        let start = line.columnOf(host), end = start;
        // Include the complete text width so neighboring notes and brackets also stay below it.
        line.columns.forEach((column, index) => {
            if (column.some(node => node.track === host.track
                && node.box.x <= box.x + box.w && node.box.x + node.box.w >= box.x)) {
                start = Math.min(start, index); end = Math.max(end, index);
            }
        });
        const extent = context.getRangeExtents(host.layoutLine, [start, end], host.track);
        box.y = context.getVisualAxis(host.layoutLine, host.track) + (extent?.top ?? 0) - this.ast.size * 0.5 - box.h;
        return {
            regions: [{ x: box.x, y: box.y, w: box.w, h: box.h, line: host.layoutLine, track: host.track }],
            paint(painter: Painter) { text.paint(painter); },
        };
    }
}
