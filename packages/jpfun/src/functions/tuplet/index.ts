import { paintedCommandRegions } from "../../layout/painted-ink.js";
import { ErrorDiagnostic } from "../../diagnostic.js";
import { Fraction } from "../../fraction.js";
import type { AttachmentLayoutContext, LayoutAttachment } from "../../layout/types.js";
import type { LoweringContext } from "../../lowering/loweringContext.js";
import type { Track } from "../../lowering/track.js";
import {
    isVisualTemporalNode,
    type VisualTemporalNode,
} from "../temporal.js";
import type { LoweringContent, LoweringGroup, LoweringResult } from "../../lowering/types.js";
import type { Painter, TextStyle } from "../../render/types.js";
import {
    ASTFunctionNode,
    type ASTFunctionClass,
    type ASTNodeBase,
    type FunctionArgs,
    type ParserContext,
    type SourceSpan,
} from "../ASTtypes.js";

/**
 * 多连音是范围时值变换，不产生自己的 Temporal：
 * actual = 内容原总时值 / 最短正时值
 * 目标总时值 = 最短正时值 * normal
 */
class TupletFunction extends ASTFunctionNode {
    static override def = {
        name: ["tuplet"],
        description: "多连音",
        details: `\
~~~jpfun
@tuplet({1/ 2 3}, normal=4)
~~~
本例最短单位为八分音符，原内容占 5 个单位，缩放后占 4 个单位：形成五连音，总时长为一个二分音符`,
        allowExtraArgs: false,
        args: [
            {
                type: "content" as const,
                description: "连音内容，各元素按同一比例缩放时值",
                default: null,
            },
            {
                name: "normal",
                description: "目标总时长，以内容中的最短时值为单位",
                type: "number" as const,
                default: null,
            },
        ],
    };

    static override loweringFinalize = (result: LoweringResult) => {
        for (const attachment of result.attachments) {
            if (attachment instanceof TupletLayoutAttachment) attachment.validate();
        }
    };

    readonly content: ASTNodeBase;
    readonly normal: number;
    readonly font: string;

    override get children() { return [this.content]; }

    override timeFlowModel() {
        return {
            mode: "sequence" as const,
            children: [this.content],
        };
    }

    override loweringEnter(ctx: LoweringContext) {
        const group: LoweringGroup & LoweringContent = {
            nodes: [],
            attachments: [],
            onTemporal(node) { group.nodes.push(node); },
            onAttachment(attachment) { group.attachments.push(attachment); },
        };
        ctx.beginLoweringGroup(this, group);
        return [];
    }

    override loweringExit(ctx: LoweringContext, _track: Track, timeOffset: Fraction) {
        const content = ctx.endLoweringGroup(this) as LoweringGroup & LoweringContent;

        // 零时长控制事件不构成连音单位，但稍后仍要随整组移动其开始位置。
        const positive = content.nodes.filter(event => event.T.compare(0) > 0);
        if (positive.length === 0) {
            throw new ErrorDiagnostic(
                "E_TUPLET_EMPTY",
                "@tuplet 的内容必须产生至少一个正时值事件",
                this.sourceSpan,
            );
        }

        // 一个 tuplet 只拥有一个时间游标和一条括线；并行分支无法用这组语义表达。
        const track = positive[0].track;
        if (positive.some(event => event.track !== track)) {
            throw new ErrorDiagnostic(
                "E_TUPLET_PARALLEL_CONTENT",
                "@tuplet 的内容不能包含并行音轨",
                this.sourceSpan,
            );
        }

        // writtenTotal / shortest 必须精确为整数，该整数就是谱面上显示的 actual
        const shortest = positive[0].T.clone();
        const writtenTotal = new Fraction();
        for (const event of positive) {
            if (event.T.compare(shortest) < 0) shortest.copyFrom(event.T);
            writtenTotal.add(event.T);
        }

        const units = writtenTotal.div(shortest);
        const actual = units.numerator;
        if (units.denominator !== 1 || actual < 2 || !Number.isSafeInteger(actual)) {
            throw new ErrorDiagnostic(
                "E_TUPLET_NON_INTEGRAL_UNITS",
                "@tuplet 的总时值必须是最短正时值的整数倍，且至少包含2个单位",
                this.sourceSpan,
            );
        }
        if (this.normal === actual) {
            throw new ErrorDiagnostic(
                "E_TUPLET_INVALID_RATIO",
                `@tuplet 的 normal 不能等于推导出的 actual (${actual})`,
                this.sourceSpan,
            );
        }

        // 以作用域最早时间为仿射缩放原点，不能直接缩放绝对 t，否则嵌套位置会漂移。
        let start = content.nodes[0].t;
        for (let i = 1; i < content.nodes.length; i++) {
            if (content.nodes[i].t.compare(start) < 0) start = content.nodes[i].t;
        }
        start = start.clone();

        // t、T 与 lowering 游标必须一起修改；后继节点才会从缩放后的组尾继续。
        const offset = new Fraction();
        for (const event of content.nodes) {
            offset.copyFrom(event.t).sub(start).mul(this.normal, actual);
            event.t.copyFrom(start).add(offset);
            event.T.mul(this.normal, actual);
        }
        timeOffset.copyFrom(start).add(shortest.mul(this.normal));

        // 括线只依附可见主体；时值缩放本身仍覆盖所有收集到的事件。
        const visible = positive.filter(isVisualTemporalNode);
        if (visible.length >= 2) {
            ctx.addAttachment(new TupletLayoutAttachment(visible, actual, this.sourceSpan, this.font, content));
        }
        return [];
    }

    constructor(span: SourceSpan, args: FunctionArgs, ctx: ParserContext, parent: ASTNodeBase | null = null) {
        super(span, parent);
        const [content, normal] = this.getArgValue(args, ctx) as [ASTNodeBase, number];
        this.font = ctx.variables.numberfont;
        // normal 是目标包含的“最短时值单位数”，不是 QN 数，也不是显示的 actual。
        if (!Number.isSafeInteger(normal) || normal <= 0) {
            throw new ErrorDiagnostic(
                "E_TUPLET_INVALID_NORMAL",
                "@tuplet 的 normal 必须是正的安全整数",
                span,
            );
        }
        this.content = content;
        this.normal = normal;
        content.parent = this;
    }

    override toString(source: string) {
        return `@tuplet(${this.content.toString(source)}, ${this.normal})`;
    }
}

export const TupletNode: ASTFunctionClass = TupletFunction;

/**
 * 多连音括线是跨多个宿主的前景 attachment。lowering 冻结端点与 actual，
 * layout 根据最终宿主坐标测量数字和括线，paint 只回放已冻结的绝对几何。
 */
class TupletLayoutAttachment implements LayoutAttachment {
    readonly alignmentKind = 'tuplet';
    layer = "foreground" as const;

    /** lowering 固化的连音语义；重复 layout 时保持不变 */
    readonly endPoints: readonly VisualTemporalNode[];
    private readonly actual: number;
    readonly sourceSpan: SourceSpan;

    /** 由端点最大字号冻结的绘制规格 */
    private readonly style: TextStyle;
    private readonly size: number;

    constructor(endPoints: readonly VisualTemporalNode[], actual: number, sourceSpan: SourceSpan, font: string,
        private readonly content: LoweringContent) {
        this.endPoints = endPoints;
        this.actual = actual;
        this.sourceSpan = sourceSpan;
        this.size = endPoints.reduce((size, endpoint) => Math.max(size, endpoint.ast.size), 0);
        this.style = {
            fontSize: this.size * 0.72,
            fontFamily: font,
            textAlign: "center",
            fill: "#000",
        };
    }

    validate() {
        const first = this.endPoints[0];
        // 当前实现只有单段括线，没有跨谱面行的首段/末段几何。
        if (this.endPoints.some(endpoint => endpoint.layoutLine !== first.layoutLine)) {
            throw new ErrorDiagnostic(
                "E_TUPLET_CROSS_LINE",
                "@tuplet 的内容不能跨越谱面行",
                this.sourceSpan,
            );
        }
    }

    private bracketShape(context: AttachmentLayoutContext) {
        const first = this.endPoints[0];
        const last = this.endPoints[this.endPoints.length - 1];

        // 括线覆盖首末主体的核心范围；没有 body 端口时回退到完整盒边界。
        const firstLeft = first.ports["body.left"]?.x ?? 0;
        const lastRight = last.ports["body.right"]?.x ?? last.box.w;
        let left = first.box.x + firstLeft;
        let right = last.box.x + lastRight;
        if (left > right) [left, right] = [right, left];

        // 数字位于跨度中心，水平线在数字两侧断开，并预留一个字号相关的空隙。
        const metrics = context.textMeasurer.measureText(String(this.actual), this.style);
        const center = (left + right) / 2;
        const textGap = this.size * 0.12;
        const hookHeight = this.size * 0.18;
        const strokeWidth = Math.max(1, this.size * 0.055);
        const textBaseline = -metrics.h / 2 + metrics.baseline;
        const textLeft = center - metrics.w / 2 - textGap;
        const textRight = center + metrics.w / 2 + textGap;
        // 先记录左右横线，再记录两端向下的短钩；短跨度允许省略横线但保留端钩
        const lines: [x1: number, y1: number, x2: number, y2: number][] = [];
        if (textLeft > left) lines.push([left, 0, textLeft, 0]);
        if (textRight < right) lines.push([textRight, 0, right, 0]);
        lines.push([left, 0, left, hookHeight], [right, 0, right, hookHeight]);

        const textX = center - (metrics.centerOffset ?? 0);
        const lineStyle = { stroke: "#000", strokeWidth };
        const commands = [
            ...lines.map(([x1, y1, x2, y2]) => ({ kind: "line" as const, x1, y1, x2, y2, style: lineStyle })),
            { kind: "text" as const, text: String(this.actual), x: textX, y: textBaseline, style: this.style },
        ];
        return { commands, pieces: commands.flatMap(command => paintedCommandRegions(command, context.textMeasurer)) };
    }

    createGeometry(context: AttachmentLayoutContext) {
        const first = this.endPoints[0];
        const peers = context.getAlignmentPeers?.(this, first.layoutLine) ?? [this];
        const lineY = Math.min(...peers.map(peer => peer instanceof TupletLayoutAttachment ? peer.bracketY(context) : Infinity));
        const { commands, pieces } = this.bracketShape(context);
        const left = Math.min(...pieces.map(piece => piece.x));
        const right = Math.max(...pieces.map(piece => piece.x + piece.w));
        const top = Math.min(...pieces.map(piece => piece.y));
        const bottom = Math.max(...pieces.map(piece => piece.y + piece.h));
        // Within the same system the whole rhythm bracket stays below slurs
        // and expression marks, even beside its count. That ordering envelope
        // is separate from the real ink used to pack different systems.
        const occupancy = [{ x: left, y: top + lineY, w: right - left, h: bottom - top, line: first.layoutLine, track: first.track }];
        return {
            // The count is taller than the bracket strokes. Keep their painted
            // envelopes separate so empty space beside it cannot move a nearby
            // system. The attachment box still unions all pieces.
            regions: pieces.map(piece => ({ ...piece, y: piece.y + lineY, line: first.layoutLine, track: first.track })),
            occupancy,
            getInkRegions: () => occupancy,
            paint(painter: Painter) {
                for (const command of commands) {
                    if (command.kind === "line") painter.drawLine(command.x1, command.y1 + lineY, command.x2, command.y2 + lineY, command.style);
                    else painter.drawText(command.text, command.x, command.y + lineY, command.style);
                }
            },
        };
    }

    private bracketY(context: AttachmentLayoutContext) {
        const first = this.endPoints[0], last = this.endPoints[this.endPoints.length - 1];
        const metrics = context.textMeasurer.measureText(String(this.actual), this.style);
        const axis = context.getVisualAxis(first.layoutLine, first.track);
        // Start from the musical bodies and nested content. Side accidentals
        // reserve system height, but only their intersections with the final
        // bracket primitives may raise this bracket (checked below).
        const bounds = context.getContentBounds(this.content, { bodyOnly: true });
        const hostTop = bounds?.y ?? axis;
        const gap = this.size * 0.14;
        let level = hostTop - gap - Math.max(this.size * 0.18, metrics.h / 2);
        const { pieces } = this.bracketShape(context);
        // Include controls and side ink from this track, even when their time
        // column lies just outside the span. Test each painted primitive.
        const hosts = context.lines[first.layoutLine].columns.flat().filter(host => host.track === first.track);
        for (const host of hosts) for (const ink of context.getHostInk?.(host) ?? []) for (const mark of pieces) {
            if (ink.x + ink.w <= mark.x || ink.x >= mark.x + mark.w) continue;
            level = Math.min(level, ink.y - gap - mark.y - mark.h);
        }
        return level;
    }
}
