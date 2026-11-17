// M3N modification: register additional basic articulation symbols.
import { articulationSymbols } from './symbols/articulations.js';
import { paintedCommandRegions } from "../../layout/painted-ink.js";
import { RecordingPainter } from "../../render/recording.js";
import { ErrorDiagnostic, WarningDiagnostic } from "../../diagnostic.js";
import type { AttachmentLayoutContext, LayoutAttachment, LayoutBox, LayoutPrepareContext, Rect } from "../../layout/types.js";
import { DEFAULT_KEY, isVisualTemporalNode, TemporalNodeBase, type TimeState, type VisualTemporalNode } from "../temporal.js";
import type { GrammarCallNodeTyped } from "../../parser/grammarType.js";
import type {
    PlaybackColumnOf, PlaybackCursor, PlaybackEmitter, PlaybackFlow, PlaybackFlowAction, PlaybackFlowHook,
} from "../../playback/types.js";
import type { Painter, TextStyle } from "../../render/types.js";
import {
    ASTFunctionNode,
    type ASTFunctionClass,
    type ASTNodeBase,
    type FunctionArgs,
    type LengthValue,
    type ParserContext,
    type SourceSpan,
} from "../ASTtypes.js";
import type { LoweringContext } from "../../lowering/loweringContext.js";
import { paintSymbol, symbolBounds, type SymbolShape } from "./shape.js";

import { accentSymbol } from "./symbols/accent.js";
import { dcSymbol } from "./symbols/dc.js";
import { dsSymbol } from "./symbols/ds.js";
import { dynamicSymbols } from "./symbols/dynamics.js";
import { fermataSymbol } from "./symbols/fermata.js";
import { fineSymbol } from "./symbols/fine.js";
import { mordentSymbol } from "./symbols/mordent.js";
import { prallSymbol } from "./symbols/prall.js";
import { segnoSymbol } from "./symbols/segno.js";
import { trSymbol } from "./symbols/tr.js";

/**
 * 一个乐谱符号：固定图形加可选的播放语义
 *
 * 每个符号自成一个文件、彼此没有依赖，新增一个符号就是新增一个对象字面量
 */
export interface SymbolDefinition {
    /** Close articulations participate in the musical arc endpoint. */
    readonly tiePort?: boolean;
    readonly name: string;
    readonly description: string;
    /** 查表未命中时使用；忽略大小写，从名称开头匹配，不允许 g/y */
    readonly pattern?: {
        readonly regex: RegExp;
        readonly resolve: (match: RegExpExecArray) => SymbolDefinition;
    };

    /** 固定图形；文字记号改用 text */
    readonly shapes?: readonly SymbolShape[];
    /** 交给宿主字体绘制的文字记号，与 shapes 二选一 */
    readonly text?: { readonly content: string; readonly fontFamily: string };

    /** 符号高度 = size × weight，用来修正宽扁字形的视觉重量；默认 1 */
    readonly weight?: number;
    /** 图形下方留白，使用符号自身坐标并随 scale 缩放；默认 0 */
    readonly paddingBottom?: number;
    /** 横向对齐点，使用符号自身坐标；默认采用完整图形的中心 */
    readonly anchor?: number;
    /** 写入本位置之后持续生效的状态，例如力度记号的 velocity */
    readonly onTimeState?: (state: TimeState) => void;
    /** 发布系统控制，或注册对同一折叠序列后续音符的局部变换 */
    readonly emitPlayback?: (emitter: PlaybackEmitter) => void;
    /** 贴在所在列上的标记，供 D.S. 这类跳转回查 */
    readonly playbackMarks?: () => readonly string[];
    /** 播放到达本符号所在列时决定去留；符号恒占一列，所以生效范围不由符号自己声明 */
    readonly onVisit?: (cursor: PlaybackCursor, at: number) => PlaybackFlowAction | undefined;
}

type SymbolPattern = NonNullable<SymbolDefinition["pattern"]>;
const symbolTable = new Map<string, SymbolDefinition>();
const symbolPatterns: SymbolPattern[] = [];
for (const definition of [trSymbol, fermataSymbol, prallSymbol, mordentSymbol, accentSymbol,
    ...dynamicSymbols, ...articulationSymbols, dcSymbol, dsSymbol, segnoSymbol, fineSymbol]) {
    const name = definition.name.toLowerCase();
    if (symbolTable.has(name)) throw new Error(`Duplicate symbol name: ${definition.name}`);
    symbolTable.set(name, definition);
    const pattern = definition.pattern;
    if (!pattern) continue;
    const { regex } = pattern;
    if (regex.global || regex.sticky) throw new Error(`Symbol pattern must not use g or y flags: ${name}`);
    symbolPatterns.push(regex.ignoreCase ? pattern
        : { ...pattern, regex: new RegExp(regex.source, `${regex.flags}i`) });
}

class SymbolFunction extends ASTFunctionNode {
    static override def = {
        name: ["symbol", "$"],
        description: "创建一个乐谱符号",
        details: `\
~~~jpfun
1 ^ @symbol(p, size=0.5em)
~~~
**简写**：\`$name\`，如 \`1 ^ $p\`。名称读取到下一个空白或当前内容区间末尾，连续的标点也属于名称。

**内置记号**
${[...symbolTable.values()].map(item => `- \`$${item.name}\`：${item.description}`).join("\n")}`,
        allowExtraArgs: false,
        args: [
            {
                name: "name",
                description: "内置记号名称，见函数说明中的记号列表",
                type: "string" as const,
                default: null
            },
            {
                name: "size",
                description: "记号尺寸",
                type: "length" as const,
                default: { value: 0.5, unit: "em" } as LengthValue,
            },
            {
                name: "above",
                description: "可选宿主标签；在宿主及先前关系记号外侧排放符号，不增加时间列",
                type: "label" as const,
                namedOnly: true,
                default: "",
            },
        ],
    };

    static override deSugarAtom(source: string, start: number, end: number) {
        if (source[start] !== "$") return null;
        const name = /^\S+/.exec(source.slice(start + 1, end))?.[0];
        if (!name) return null;
        const next = start + 1 + name.length;
        const node: GrammarCallNodeTyped = {
            kind: "call",
            typed: true,
            name: "symbol",
            args: new Map([[0, name]]),
            span: { start, end: next },
            syntaxKind: "atom",
        };
        return { next, node };
    }

    readonly size: number;
    readonly above: ASTNodeBase | null;
    readonly definition?: SymbolDefinition;

    constructor(sourceSpan: SourceSpan, args: FunctionArgs, ctx: ParserContext, parent: ASTNodeBase | null = null) {
        super(sourceSpan, parent);
        const [name, size, above] = this.getArgValue(args, ctx) as [string, LengthValue, ASTNodeBase | string];
        this.above = typeof above === "string" ? null : above;
        this.size = ctx.length2px(size);
        const normalized = name.toLowerCase();
        let definition = symbolTable.get(normalized);
        if (!definition) {
            let matched: { pattern: SymbolPattern; match: RegExpExecArray } | undefined;
            for (const pattern of symbolPatterns) {
                const match = pattern.regex.exec(normalized);
                if (!match || match.index !== 0 || match[0] !== normalized) continue;
                if (matched) throw new Error(`Ambiguous symbol patterns: ${normalized}`);
                matched = { pattern, match };
            }
            definition = matched?.pattern.resolve(matched.match);
        }
        if (!definition) {
            const message = `@symbol: 未知符号: $${name}`;
            if (ctx.variables.strict) throw new ErrorDiagnostic("E_UNKNOWN_SYMBOL", message, sourceSpan);
            ctx.diagnostics.push(new WarningDiagnostic("W_UNKNOWN_SYMBOL", message, sourceSpan));
            return;
        }
        this.definition = definition;
    }

    override loweringEnter(ctx: LoweringContext): TemporalNodeBase[] {
        if (this.above && this.definition) {
            let host = ctx.getTemporalNodes(this.above).at(-1);
            while (host?.foldedInto) host = host.foldedInto;
            if (!host || !isVisualTemporalNode(host)) throw new ErrorDiagnostic("E_SYMBOL_INVALID_HOST", "@symbol 的 above 标签必须指向可见对象", this.sourceSpan);
            // Navigation/playback actions must remain temporal objects. Dynamics
            // can attach to the host without losing their onset state change.
            if (this.definition.onVisit || this.definition.playbackMarks) throw new ErrorDiagnostic("E_SYMBOL_INVALID_HOST", "导航符号不能作为 above 附件", this.sourceSpan);
            const previous = host.onTimeState?.bind(host), update = this.definition.onTimeState;
            if (update) host.onTimeState = state => { update(state); return previous?.(state); };
            if (this.definition.emitPlayback) {
                // Match an up group's local playback sequence: publish the
                // zero-time effect before visiting the timed host. A direct
                // call on the host emitter would affect its following sibling.
                const target = Object.create(host) as VisualTemporalNode;
                target.emitPlayback = host.emitPlayback?.bind(host);
                const effect = new SymbolTemporal(this as ResolvedSymbolFunction);
                host.emitPlayback = emitter => {
                    emitter.play(effect, emitter.start, emitter.start.clone().sub(emitter.start));
                    emitter.play(target);
                };
            }
            ctx.addAttachment(new SymbolAboveAttachment(this as ResolvedSymbolFunction, host));
            return [];
        }
        return [this.definition
            ? new SymbolTemporal(this as ResolvedSymbolFunction)
            : new TemporalNodeBase()];
    }
    override toString(source: string) {
        return this.definition ? `@symbol(${this.definition.name}${this.above ? `,size=${this.size}px,above=${(this.above as ASTFunctionNode).label}` : ""})` : super.toString(source);
    }
}

export const SymbolNode: ASTFunctionClass = SymbolFunction;

type ResolvedSymbolFunction = SymbolFunction & { readonly definition: SymbolDefinition };

class SymbolTemporal extends TemporalNodeBase implements PlaybackFlow {
    declare ast: ResolvedSymbolFunction;
    declare box: LayoutBox;

    /** 符号自身坐标系里的固有包围盒，与布局轮次无关 */
    private readonly bounds: Rect;
    private readonly height: number;
    /** 文字记号的内容与字号，图形记号为空 */
    private readonly label?: { content: string; style: TextStyle };
    private scale = 1;
    private baseline = 0;
    private paintOffset = { x: 0, y: 0 };

    constructor(ast: ResolvedSymbolFunction, private readonly semanticHost?: VisualTemporalNode) {
        super();
        this.ast = ast;
        // Segno marks an onset. Consume it before shared rest insertion,
        // including when only one of the parallel voices writes the mark.
        this.mergeKey = ast.definition.name === "segno" ? Number.MAX_SAFE_INTEGER : DEFAULT_KEY;
        this.onTimeState = ast.definition.onTimeState;
        this.emitPlayback = ast.definition.emitPlayback;
        this.playbackMarks = ast.definition.playbackMarks;
        this.bounds = symbolBounds(ast.definition.shapes ?? []);
        this.height = ast.size * (ast.definition.weight ?? 1);
        const text = ast.definition.text;
        // 文字记号的字号也是 size × weight，所以与图形记号视觉等高
        this.label = text && {
            content: text.content,
            style: { fontSize: this.height, fontFamily: text.fontFamily,
                ...(semanticHost ? { semantic: { role: 'mark' as const, sourceSpan: semanticHost.ast.sourceSpan } } : {}) },
        };
        this.initLayoutBox();
    }

    override prepareLayout(context: LayoutPrepareContext) {
        if (this.label) {
            const metrics = context.textMeasurer.measureText(this.label.content, this.label.style);
            this.box.w = metrics.w;
            this.box.h = metrics.h;
            this.baseline = metrics.baseline;
        } else {
            this.scale = this.height / this.bounds.h;
            const recording = new RecordingPainter();
            paintSymbol(recording, this.ast.definition.shapes ?? [], this.bounds, { ...this.box, x: 0, y: 0 }, this.scale);
            const ink = recording.commands.flatMap(command => paintedCommandRegions(command, context.textMeasurer));
            const left = Math.min(...ink.map(r => r.x)), top = Math.min(...ink.map(r => r.y));
            const right = Math.max(...ink.map(r => r.x + r.w)), bottom = Math.max(...ink.map(r => r.y + r.h));
            this.paintOffset = ink.length ? { x: -left, y: -top } : { x: 0, y: 0 };
            this.box.w = ink.length ? right - left : this.bounds.w * this.scale;
            this.box.h = (ink.length ? bottom - top : this.height) + (this.ast.definition.paddingBottom ?? 0) * this.scale;
        }
        this.box.anchor = !this.label && this.ast.definition.anchor !== undefined
            ? (this.ast.definition.anchor - this.bounds.x) * this.scale + this.paintOffset.x
            : this.box.w / 2;
        this.box.visualAxis = this.box.h / 2;
        if (this.ast.definition.tiePort) this.ports["tie.top"] = { x: this.box.anchor, y: 0 };
    }

    override paint(painter: Painter) {
        if (this.label) painter.drawText(this.label.content, this.box.x, this.box.y + this.baseline, this.label.style);
        else paintSymbol(painter, this.ast.definition.shapes ?? [], this.bounds, { ...this.box, x: this.box.x + this.paintOffset.x, y: this.box.y + this.paintOffset.y }, this.scale,
            this.semanticHost ? { role: 'mark', sourceSpan: this.semanticHost.ast.sourceSpan } : undefined);
    }

    /** 控制流在生成事件之前展开，emitPlayback 够不到，所以单独接一次 */
    playbackFlow(columnOf: PlaybackColumnOf): PlaybackFlowHook | undefined {
        const onVisit = this.ast.definition.onVisit;
        if (!onVisit) return;
        const at = columnOf(this);
        return at === undefined ? undefined : { range: [at, at], run: cursor => onVisit(cursor, at) };
    }
}


/** Expression symbols clear rhythm brackets and arcs declared before them. */
class SymbolAboveAttachment implements LayoutAttachment {
    readonly layer = "foreground" as const;
    readonly endPoints: readonly VisualTemporalNode[];
    readonly sourceSpan: SourceSpan;
    constructor(private readonly ast: ResolvedSymbolFunction, private readonly host: VisualTemporalNode) {
        this.endPoints = [host];
        this.sourceSpan = { ...ast.sourceSpan };
    }
    createGeometry(context: AttachmentLayoutContext) {
        const symbol = new SymbolTemporal(this.ast, this.host);
        symbol.prepareLayout(context);
        const { box } = symbol, { host } = this;
        // Attached marks reserve their complete paint, including scaled strokes,
        // rather than the temporal symbol's optional internal layout padding.
        const recording = new RecordingPainter(); symbol.paint(recording);
        const pieces = recording.commands.flatMap(command => paintedCommandRegions(command, context.textMeasurer));
        const ink = pieces.length ? {
            left: Math.min(...pieces.map(r => r.x)), top: Math.min(...pieces.map(r => r.y)),
            right: Math.max(...pieces.map(r => r.x + r.w)), bottom: Math.max(...pieces.map(r => r.y + r.h)),
        } : { left: 0, top: 0, right: box.w, bottom: box.h };
        const width = ink.right - ink.left;
        box.x = Math.max(context.originX, Math.min(host.box.x + host.box.anchor - box.anchor + ink.left,
            context.originX + context.width - width)) - ink.left;
        const line = context.lines[host.layoutLine];
        let start = line.columnOf(host), end = start;
        line.columns.forEach((column, index) => {
            if (column.some(node => node.track === host.track && node.box.x <= box.x + ink.right && node.box.x + node.box.w >= box.x + ink.left)) {
                start = Math.min(start, index); end = Math.max(end, index);
            }
        });
        const extent = context.getInkExtents ? context.getInkExtents(host.layoutLine, box.x + ink.left, box.x + ink.right, host.track)
            : context.getRangeExtents(host.layoutLine, [start, end], host.track);
        box.y = context.getVisualAxis(host.layoutLine, host.track) + (extent?.top ?? 0) - host.ast.size * 0.12 - ink.bottom;
        return {
            regions: [{ x: box.x + ink.left, y: box.y + ink.top, w: width, h: ink.bottom - ink.top, line: host.layoutLine, track: host.track }],
            paint(painter: Painter) { symbol.paint(painter); },
        };
    }
}
