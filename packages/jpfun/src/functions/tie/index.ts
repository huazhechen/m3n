// M3N modification: level arc endpoints and clear intervening notes and overlapping ribbons.
import { ASTNodeBase, FunctionArgs, SourceSpan, ParserContext, ASTFunctionNode, ASTFunctionClass, type LengthValue } from "../ASTtypes.js";
import type { CallArgumentInfo } from "../../parser/grammarType.js";
import { Diagnostic, ErrorDiagnostic } from "../../diagnostic.js";
import type { LoweringContext } from "../../lowering/loweringContext.js";
import {
    isVisualTemporalNode,
    type VisualTemporalNode,
} from "../temporal.js";
import { pathBounds } from "../../layout/path.js";
import { getLayoutBounds } from "../../layout/engine.js";
import type {
    AttachmentLayoutContext,
    LayoutAttachment,
    LayoutHost,
    LayoutPoint,
    Rect,
} from "../../layout/types.js";
import type { Painter, PathCommand } from "../../render/types.js";
import type {
    PlaybackRelation,
    PlaybackRelationContext,
} from "../../playback/types.js";
import type { Track } from "../../lowering/track.js";

/** 三次贝塞尔控制点的抬高系数：两个控制点同高时，实际弧高恰好是抬高的 3/4 */
const CUBIC_LIFT = 4 / 3;
/** 弧带中部最大厚度与字号之比 */
const THICKNESS_RATIO = 0.09;
/** 参考弧线的跨度约为弧高的 5 倍；在 2.5em 处平滑达到 0.5em 上限 */
const AUTO_SPAN_RATIO = 2.5;
const AUTO_HEIGHT_RATIO = 0.5;
const CROSS_LINE_HEIGHT_RATIO = 0.45;

class TieFunction extends ASTFunctionNode {
    static override def = {
        name: ["tie"],
        description: "连音线",
        details: `\
~~~jpfun
1@a 2 3@b @tie(a, b, height=0.5em)
~~~
- **位置参数**：端点标签，可传多个，按顺序连接；省略时查找最近的可标记对象，包括增时线
- **height**：仅命名的弧线高度参数，默认 \`0\`（自动）；非正数按水平跨度自动调整，在 \`2.5em\` 跨度处平滑达到 \`0.5em\` 上限，正数指定固定弧高。em 相对调用处字号；可用 \`@set(tie.height=0.8em)\` 设置局部默认值，显式传参优先

同行端点用一条弧线连接，自动高度按水平跨度计算；跨行时自动拆成多段，自动模式下各段统一使用 \`0.45em\` 高度。同轨同音且时间连续的音段建立播放连接，各段保留自己的装饰，例如 \`1 ^ $tr 1 @tie()\` 的后一音段不继承颤音。涉及增时线的连接仅绘制，不合并播放音符。`,
        allowExtraArgs: true,
        extraArgType: "label" as const,
        args: [{
            name: "height",
            namedOnly: true,
            description: "弧线高度，支持 px/em；em 相对调用处字号，非正数自动调整，最高 0.5em",
            type: "length" as const,
            default: { value: 0, unit: "em" as const },
        }]
    };

    endPoints: ASTNodeBase[] = [];
    readonly height: number;
    private readonly fontSize: number;

    constructor(sourceSpan: SourceSpan, args: FunctionArgs, ctx: ParserContext, parent: ASTNodeBase | null = null) {
        super(sourceSpan, parent);
        // 命名选项统一解析默认值，位置参数仍全部作为端点
        const [height] = this.getArgValue(args, ctx) as [LengthValue];
        for (const [key, value] of args) {
            if (key === "height") continue;
            const v = value instanceof ASTFunctionNode
                ? value
                : ctx.parseArgWithType((value as CallArgumentInfo).valueSpan, "label", sourceSpan.start);
            if (v !== null) this.endPoints.push(v as ASTFunctionNode);
        }
        // 数目不足，则找最近的；用 unshift 而不是按下标赋值，否则空洞会让 length 虚高、骗过下面的校验
        let k = ctx.labelableNodes.length - 1;
        while (this.endPoints.length < 2 && k >= 0) {
            const candidate = ctx.labelableNodes[k--];
            if (!candidate || this.endPoints.includes(candidate)) continue;
            this.endPoints.unshift(candidate);
        }
        if (this.endPoints.length < 2) throw new ErrorDiagnostic("E_NOT_ENOUGH_ARGS", "@tie 连音线需要至少两个端点", sourceSpan);
        this.height = Math.max(0, ctx.length2px(height));
        this.fontSize = ctx.variables.fontsize;
    }

    /**
     * tie 不推进时间
     * lowering 只把 AST 端点解析成稳定的 temporal 对象引用
     */
    override loweringEnter(ctx: LoweringContext) {
        const endPoints: VisualTemporalNode[] = [];
        for (const ast of this.endPoints) {
            const temporal = ctx.getTemporalNodes(ast).at(-1);
            if (!temporal || !isVisualTemporalNode(temporal)) continue;
            endPoints.push(temporal);
        }

        if (endPoints.length < 2) {
            ctx.diagnostics.push(Diagnostic.warning.UnresolvedEndpoint("tie", this.sourceSpan));
            return [];
        }
        // M3N: folded zero-time marks need space outside the note's tie arc.
        for (const node of endPoints) {
            node.addon ??= {};
            node.addon['@tie'] = Math.max(Number(node.addon['@tie'] ?? 0), this.height || this.fontSize * AUTO_HEIGHT_RATIO);
        }
        ctx.addAttachment(new TieLayoutAttachment(endPoints, this.height, this.fontSize, this.sourceSpan));
        return [];
    }

    override toString(source: string) {
        const labels = this.endPoints.map(endpoint => (endpoint as ASTFunctionNode).label);
        if (labels.some(label => label === undefined)) return source.slice(this.sourceSpan.start, this.sourceSpan.end);
        return `@tie(${labels.join(", ")}, height=${this.height}px)`;
    }
}

export const TieNode: ASTFunctionClass = TieFunction;

interface TieSegment extends Rect {
    commands: PathCommand[];
    line: number;
    track: Track;
}

class TieLayoutAttachment implements LayoutAttachment, PlaybackRelation {
    get alignmentKind() { return this.height === 0 ? 'tie' : undefined; }
    layer = "foreground" as const;
    readonly sourceSpan: SourceSpan;

    readonly endPoints: VisualTemporalNode[];
    private readonly height: number;
    private readonly fontSize: number;
    /** 弧带中部厚度；两端收尖到 0。端点字号不随布局变化，可以一次算定 */
    private readonly thickness: number;

    constructor(endPoints: VisualTemporalNode[], height: number, fontSize: number, sourceSpan: SourceSpan) {
        this.endPoints = endPoints;
        this.height = height;
        this.fontSize = fontSize;
        this.sourceSpan = sourceSpan;
        const size = endPoints.reduce(
            (current, endpoint) => Math.max(current, endpoint.ast.size),
            0,
        );
        this.thickness = Math.max(1.2, size * THICKNESS_RATIO);
    }

    /**
     * 为同轨、同音且时间相接的逻辑音段建立连接，各次反复及各段装饰保持独立
     * 此时只匹配来源和逻辑音高，实际子音是否能合并由声音展开后的核心处理
     */
    applyPlayback(context: PlaybackRelationContext) {
        // 整体端点可能包含和弦多个成员或多遍访问，每个首段分别寻找自己的连接链。
        for (const head of context.notes.filter(note =>
            note.origins.some(origin => origin.node === this.endPoints[0]))) {
            let previous = head;
            // 按显式端点顺序延续；某一端点没有相接音段就停止，不能跨过缺口连接。
            for (let index = 1; index < this.endPoints.length; index++) {
                // connect 同时认领候选：配对冲突时继续找其他成员，重复声明可复用原配对。
                const next = context.notes.find(note => note !== previous
                    && note.origins.some(origin => origin.node === this.endPoints[index])
                    && note.track === previous.track
                    && note.midi === previous.midi
                    && note.percussion === previous.percussion
                    && previous.end.equals(note.start)
                    && context.connect(previous, note));
                if (!next) break;
                previous = next;
            }
        }
    }

    createGeometry(context: AttachmentLayoutContext) {
        const segments = this.createSegments(context);
        if (context.alignRelations) this.clearEarlierArcs(context, segments);
        const regions = segments.map(({ commands: _commands, ...region }) => region);
        const occupancy = segments.map(segment => {
            // 只申报主体上方那一段，下半截由主体自己占；本行没有主体时就只有弧带本身
            // 同轨弧线的避让已在几何中完成；这里只裁去宿主本身占用的下半截。
            const hostExtent = context.getHostExtent(segment.line, segment.track);
            const bottom = hostExtent
                ? Math.max(segment.y, context.getVisualAxis(segment.line, segment.track) + hostExtent.top)
                : segment.y + segment.h;
            return {
                x: segment.x,
                y: segment.y,
                w: segment.w,
                h: bottom - segment.y,
                line: segment.line,
                track: segment.track,
            };
        });
        return {
            regions,
            occupancy,
            paint(painter: Painter) {
                for (const segment of segments) {
                    // 弧带本身就是闭合轮廓，直接填充就能得到两端收尖、中部较粗的乐谱弧线
                    painter.drawPath(segment.commands, { fill: "#000" });
                }
            },
        };
    }

    /** Later arc declarations form the outer layer; adjacent arcs still share their original ports. */
    private clearEarlierArcs(context: AttachmentLayoutContext, segments: TieSegment[]) {
        const track = this.endPoints[0].track;
        if (this.endPoints.some(node => node.track !== track)) return;
        const first = this.endPoints.reduce((a, b) => a.t.compare(b.t) < 0 ? a : b);
        const last = this.endPoints.reduce((a, b) => a.t.compare(b.t) > 0 ? a : b);
        const obstacles: TieSegment[] = [];
        for (const peer of context.getPrecedingAttachments?.() ?? []) {
            if (!(peer instanceof TieLayoutAttachment) || peer.endPoints.some(node => node.track !== track)) continue;
            const start = peer.endPoints.reduce((a, b) => a.t.compare(b.t) < 0 ? a : b);
            const end = peer.endPoints.reduce((a, b) => a.t.compare(b.t) > 0 ? a : b);
            // A common endpoint alone is adjacency, not an overlapping musical span.
            if (end.t.compare(first.t) <= 0 || start.t.compare(last.t) >= 0) continue;
            const occupancy = context.getAttachmentOccupancy(peer);
            if (!occupancy) continue;
            peer.createSegments(context).forEach((segment, index) => {
                const placed = occupancy[index];
                if (placed) obstacles.push(shiftSegment(segment, placed.y - segment.y));
            });
        }
        const gap = this.fontSize * 0.15;
        for (let index = 0; index < segments.length; index++) {
            const segment = segments[index];
            let lift = 0;
            for (const obstacle of obstacles) {
                if (obstacle.line !== segment.line) continue;
                const left = Math.max(segment.x, obstacle.x);
                const right = Math.min(segment.x + segment.w, obstacle.x + obstacle.w);
                if (right <= left) continue;
                // Sample at most one pixel apart, including both endpoints. A small
                // extra margin covers interpolation between samples and rasterization.
                const steps = Math.max(1, Math.ceil(right - left));
                for (let step = 0; step <= steps; step++) {
                    const x = left + (right - left) * step / steps;
                    const outer = ribbonAtX(segment.commands, x);
                    const inner = ribbonAtX(obstacle.commands, x);
                    if (outer && inner) lift = Math.max(lift, outer.bottom - inner.top + gap);
                }
            }
            if (lift > 0) segments[index] = shiftSegment(segment, -lift - this.fontSize * 0.02);
        }
    }

    private tiePort(node: LayoutHost): LayoutPoint {
        const port = node.ports["tie.top"];
        if (port) {
            return {
                x: node.box.x + port.x,
                y: node.box.y + port.y,
            };
        }

        return {
            x: node.box.x + node.box.anchor,
            y: getLayoutBounds(node, true).y,
        };
    }

    /** 根据端点固化后的行号选择同行弧线或跨行分段 */
    private createSegments(context: AttachmentLayoutContext) {
        const segments: TieSegment[] = [];

        for (let i = 1; i < this.endPoints.length; i++) {
            let startNode = this.endPoints[i - 1];
            let endNode = this.endPoints[i];
            // 标签书写顺序不保证时间顺序，先按谱面行升序规范化
            if (startNode.layoutLine > endNode.layoutLine) [startNode, endNode] = [endNode, startNode];

            let start = this.tiePort(startNode);
            let end = this.tiePort(endNode);
            const level = context.alignRelations && startNode.track === endNode.track;
            const append = (segment: TieSegment) => segments.push(level
                ? this.clearInterveningNotes(context, segment, startNode, endNode) : segment);

            if (startNode.layoutLine === endNode.layoutLine) {
                if (level) {
                    const y = Math.min(start.y, end.y);
                    start = { ...start, y }; end = { ...end, y };
                }
                const startTop = this.hostTop(context, startNode.layoutLine, startNode.track);
                const endTop = this.hostTop(context, endNode.layoutLine, endNode.track);
                append(this.arcSegment(
                    start,
                    end,
                    startNode.layoutLine,
                    startTop <= endTop ? startNode.track : endNode.track,
                    this.alignedHeight(context, startNode.layoutLine, Math.abs(end.x - start.x)),
                ));
                continue;
            }

            const height = this.height > 0 ? this.height : this.fontSize * CROSS_LINE_HEIGHT_RATIO;
            // 首行先起弧，再沿水平段延伸到当前谱面行最右侧
            append(this.openingSegment(
                start,
                this.lineRightX(context, startNode.layoutLine),
                height,
                startNode.layoutLine,
                startNode.track,
            ));

            // 中间行可能没有任何可见对象，仍然需要逐行补一段水平线
            for (let line = startNode.layoutLine + 1; line < endNode.layoutLine; line++) {
                append(this.horizontalSegment(
                    this.lineEntryX(context, line, startNode.track),
                    this.lineRightX(context, line),
                    this.hostTop(context, line, startNode.track) - height,
                    line,
                    startNode.track,
                ));
            }

            // 跳过声部名、大括号等位于端点列之前的系统前缀，再落弧到终点
            append(this.closingSegment(
                this.lineEntryX(context, endNode.layoutLine, endNode.track),
                end,
                height,
                endNode.layoutLine,
                endNode.track,
            ));
        }
        return segments;
    }

    /** Test the ribbon's lower edge against the musical tops inside this system fragment. */
    private clearInterveningNotes(context: AttachmentLayoutContext, segment: TieSegment, start: VisualTemporalNode, end: VisualTemporalNode) {
        let lift = 0;
        const columns = context.getRangeColumns(segment.line, [start, end], start.track);
        for (const host of columns.flat()) {
            if (host.T.isZero() || host.track !== start.track || host === start || host === end) continue;
            const bounds = getLayoutBounds(host, true);
            const left = Math.max(segment.x, bounds.x), right = Math.min(segment.x + segment.w, bounds.x + bounds.w);
            if (right < left) continue;
            const top = this.tiePort(host).y;
            // These arc edges have their highest lower-edge value at an end of
            // the tested interval; octave dots are included in the musical port.
            for (const x of [left, right]) {
                const edge = ribbonAtX(segment.commands, x);
                if (edge) lift = Math.max(lift, edge.bottom - top);
            }
        }
        return lift > 0 ? shiftSegment(segment, -lift) : segment;
    }

    private resolveHeight(span: number) {
        if (this.height > 0) return this.height;
        const ratio = Math.min(1, span / (this.fontSize * AUTO_SPAN_RATIO));
        return this.fontSize * AUTO_HEIGHT_RATIO * ratio * (2 - ratio);
    }

    private alignedHeight(context: AttachmentLayoutContext, line: number, span: number) {
        if (!context.alignRelations || this.height > 0) return this.resolveHeight(span);
        let height = this.resolveHeight(span);
        for (const peer of context.getAlignmentPeers?.(this, line) ?? []) {
            if (!(peer instanceof TieLayoutAttachment)) continue;
            for (let i = 1; i < peer.endPoints.length; i++) {
                const a = peer.endPoints[i - 1], b = peer.endPoints[i];
                if (a.layoutLine !== line || b.layoutLine !== line) continue;
                height = Math.max(height, peer.resolveHeight(Math.abs(peer.tiePort(b).x - peer.tiePort(a).x)));
            }
        }
        return height;
    }

    private lineEntryX(
        context: AttachmentLayoutContext,
        lineIndex: number,
        track: Track,
    ) {
        const line = context.lines[lineIndex];
        const host = line.trackRuns.get(track)?.find(host => !host.T.isZero());
        return host?.box.x ?? context.originX;
    }

    private lineRightX(context: AttachmentLayoutContext, lineIndex: number) {
        const runs = context.lines[lineIndex].trackRuns;
        if (runs.size === 0) return context.originX + context.width;

        let right = context.originX;
        for (const run of runs.values()) {
            for (const host of run) right = Math.max(right, host.box.x + host.box.w);
        }
        return right;
    }

    private hostTop(context: AttachmentLayoutContext, line: number, track: Track) {
        return context.getVisualAxis(line, track) + (context.getHostExtent(line, track)?.top ?? 0);
    }

    /** 一条三次贝塞尔的外缘配上反向内缘，得到两端收尖、中部最厚的乐谱弧线 */
    private arcSegment(
        startInput: LayoutPoint,
        endInput: LayoutPoint,
        line: number,
        track: Track,
        height: number,
    ) {
        let start = startInput;
        let end = endInput;
        if (start.x > end.x) [start, end] = [end, start];

        const run = (end.x - start.x) * 0.25;
        const leftX = start.x + run;
        const rightX = end.x - run;
        const lift = height * CUBIC_LIFT;
        const inner = Math.max(0, lift - this.thickness * CUBIC_LIFT);

        const commands: PathCommand[] = [
            { op: "M", x: start.x, y: start.y },
            { op: "C", cx1: leftX, cy1: start.y - lift, cx2: rightX, cy2: end.y - lift, x: end.x, y: end.y },
            { op: "C", cx1: rightX, cy1: end.y - inner, cx2: leftX, cy2: start.y - inner, x: start.x, y: start.y },
            { op: "Z" },
        ];

        return makeSegment(commands, line, track);
    }

    /** 跨行首段：从端点起弧，随后水平延伸到右边界 */
    private openingSegment(
        start: LayoutPoint,
        right: number,
        height: number,
        line: number,
        track: Track,
    ) {
        const plateauY = start.y - height;
        const run = height * 1.2;
        right = Math.max(right, start.x + run);
        const curveX = start.x + run;
        const controlX = start.x + run * 0.45;
        const bottom = plateauY + this.thickness;

        return makeSegment([
            { op: "M", x: start.x, y: start.y },
            { op: "Q", cx: controlX, cy: plateauY, x: curveX, y: plateauY },
            { op: "L", x: right, y: plateauY },
            { op: "L", x: right, y: bottom },
            { op: "L", x: curveX, y: bottom },
            { op: "Q", cx: controlX, cy: bottom, x: start.x, y: start.y },
            { op: "Z" },
        ], line, track);
    }

    /** 跨行末段：从左边界水平进入，最后落弧到端点 */
    private closingSegment(
        left: number,
        end: LayoutPoint,
        height: number,
        line: number,
        track: Track,
    ) {
        const plateauY = end.y - height;
        const run = height * 1.2;
        left = Math.min(left, end.x - run);
        const curveX = end.x - run;
        const controlX = end.x - run * 0.45;
        const bottom = plateauY + this.thickness;

        return makeSegment([
            { op: "M", x: left, y: plateauY },
            { op: "L", x: curveX, y: plateauY },
            { op: "Q", cx: controlX, cy: plateauY, x: end.x, y: end.y },
            { op: "Q", cx: controlX, cy: bottom, x: curveX, y: bottom },
            { op: "L", x: left, y: bottom },
            { op: "Z" },
        ], line, track);
    }

    private horizontalSegment(
        left: number,
        right: number,
        y: number,
        line: number,
        track: Track,
    ) {
        return makeSegment([
            { op: "M", x: left, y },
            { op: "L", x: right, y },
            { op: "L", x: right, y: y + this.thickness },
            { op: "L", x: left, y: y + this.thickness },
            { op: "Z" },
        ], line, track);
    }
}

function makeSegment(
    commands: PathCommand[],
    line: number,
    track: Track,
): TieSegment {
    return { commands, line, track, ...pathBounds(commands) };
}

function shiftSegment(segment: TieSegment, dy: number): TieSegment {
    const commands = segment.commands.map(command => {
        if (command.op === 'Z') return command;
        if (command.op === 'C') return { ...command, y: command.y + dy, cy1: command.cy1 + dy, cy2: command.cy2 + dy };
        if (command.op === 'Q') return { ...command, y: command.y + dy, cy: command.cy + dy };
        return { ...command, y: command.y + dy };
    });
    return { ...segment, y: segment.y + dy, commands };
}

/** Tie ribbon edges are monotone in x, including the opening/closing cross-system curves. */
function ribbonAtX(commands: readonly PathCommand[], x: number) {
    let cursor: LayoutPoint = { x: 0, y: 0 };
    let top = Infinity, bottom = -Infinity;
    for (const command of commands) {
        if (command.op === 'Z') continue;
        if (command.op === 'M') { cursor = command; continue; }
        const start = cursor;
        cursor = command;
        if (x < Math.min(start.x, command.x) - 1e-7 || x > Math.max(start.x, command.x) + 1e-7) continue;
        const at = (t: number, axis: 'x' | 'y') => {
            const u = 1 - t;
            if (command.op === 'C') return u ** 3 * start[axis] + 3 * u * u * t * command[axis === 'x' ? 'cx1' : 'cy1']
                + 3 * u * t * t * command[axis === 'x' ? 'cx2' : 'cy2'] + t ** 3 * command[axis];
            if (command.op === 'Q') return u * u * start[axis] + 2 * u * t * command[axis === 'x' ? 'cx' : 'cy'] + t * t * command[axis];
            return u * start[axis] + t * command[axis];
        };
        let low = 0, high = 1;
        for (let iteration = 0; iteration < 28; iteration++) {
            const middle = (low + high) / 2;
            if ((at(middle, 'x') < x) === (command.x >= start.x)) low = middle;
            else high = middle;
        }
        const y = at((low + high) / 2, 'y');
        top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    return Number.isFinite(top) ? { top, bottom } : undefined;
}
