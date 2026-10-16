// M3N addition: native range parentheses with per-system spacing and pagination.
import { Diagnostic, ErrorDiagnostic } from '../../diagnostic.js';
import { getLayoutBounds } from '../../layout/engine.js';
import type { AttachmentLayoutContext, HorizontalLineView, LayoutAttachment, LayoutHost, LayoutRegion } from '../../layout/types.js';
import type { LoweringContext } from '../../lowering/loweringContext.js';
import type { Painter, PathCommand } from '../../render/types.js';
import { ASTFunctionNode, type ASTFunctionClass, type ASTNodeBase, type FunctionArgs, type ParserContext, type SourceSpan } from '../ASTtypes.js';
import { isVisualTemporalNode, type TemporalNodeBase, type VisualTemporalNode } from '../temporal.js';

class ParenFunction extends ASTFunctionNode {
    static override def = {
        name: ['paren'],
        description: '给音符区间添加圆括号',
        details: `1@a 2 3@b @paren(a,b)
端点须位于同一音轨，可以相同或逆序。每个含音符的谱行片段各显示一对圆括号；
括号预留横向空间，随音符换行、分页，不改变时值或播放。`,
        allowExtraArgs: false,
        args: [
            { name: 'from', description: '区间首个音符标签', type: 'label' as const, default: null },
            { name: 'to', description: '区间末个音符标签', type: 'label' as const, default: null },
        ],
    };

    readonly from: ASTNodeBase;
    readonly to: ASTNodeBase;
    readonly size: number;

    constructor(span: SourceSpan, args: FunctionArgs, ctx: ParserContext, parent: ASTNodeBase | null = null) {
        super(span, parent);
        [this.from, this.to] = this.getArgValue(args, ctx) as [ASTNodeBase, ASTNodeBase];
        this.size = ctx.variables.fontsize;
    }

    override loweringEnter(ctx: LoweringContext) {
        const host = (node: TemporalNodeBase | undefined) => {
            while (node?.foldedInto) node = node.foldedInto;
            return node && isVisualTemporalNode(node) ? node : undefined;
        };
        const from = host(ctx.getTemporalNodes(this.from).at(0));
        const to = host(ctx.getTemporalNodes(this.to).at(-1));
        if (!from || !to) {
            ctx.diagnostics.push(Diagnostic.warning.UnresolvedEndpoint('paren', this.sourceSpan));
            return [];
        }
        if (from.track !== to.track) {
            throw new ErrorDiagnostic('E_PAREN_CROSS_TRACK', '@paren 的两个端点必须位于同一音轨', this.sourceSpan);
        }
        ctx.addAttachment(new ParenAttachment(this, from, to));
        return [];
    }

    override toString(source: string) {
        const label = (node: ASTNodeBase) => (node as ASTFunctionNode).label ?? node.toString(source);
        return `@paren(${label(this.from)},${label(this.to)})`;
    }
}

export const ParenNode: ASTFunctionClass = ParenFunction;

class ParenAttachment implements LayoutAttachment {
    readonly layer = 'foreground' as const;
    readonly endPoints: readonly [VisualTemporalNode, VisualTemporalNode];
    private readonly width: number;
    private readonly gap: number;
    private readonly stroke: number;
    get sourceSpan() { return this.ast.sourceSpan; }

    constructor(private readonly ast: ParenFunction, from: VisualTemporalNode, to: VisualTemporalNode) {
        this.endPoints = from.t.compare(to.t) <= 0 ? [from, to] : [to, from];
        this.width = ast.size * 0.22;
        this.gap = ast.size * 0.15;
        this.stroke = Math.max(1, ast.size * 0.055);
    }

    private members(line: Pick<HorizontalLineView, 'trackRuns'>): readonly LayoutHost[] {
        const [from, to] = this.endPoints;
        return (line.trackRuns.get(from.track) ?? []).filter(node => !node.T.isZero()
            && node.t.compare(from.t) >= 0 && node.t.compare(to.t) <= 0);
    }

    prepareHorizontal(lines: HorizontalLineView[]) {
        const inset = this.gap + this.width + this.stroke;
        for (const line of lines) {
            const members = this.members(line);
            const first = members[0], last = members.at(-1);
            if (!first || !last) continue;
            line.registerHorizontalLayoutHook(first, last, ({ columns, start, end }) => {
                const left = columns[start].find(element => element.time === first);
                const right = columns[end].find(element => element.time === last);
                if (left) left.WL += inset;
                if (right) right.WR += inset;
            });
        }
    }

    createGeometry(context: AttachmentLayoutContext) {
        const regions: LayoutRegion[] = [];
        const paths: PathCommand[][] = [];
        const half = this.stroke / 2;
        for (const line of context.lines) {
            const members = this.members(line);
            if (!members.length) continue;
            const bounds = members.map(node => getLayoutBounds(node, true));
            const top = Math.min(...bounds.map(box => box.y)) - this.ast.size * 0.08;
            const bottom = Math.max(...bounds.map(box => box.y + box.h)) + this.ast.size * 0.08;
            const left = Math.min(...bounds.map(box => box.x)) - this.gap - this.width;
            const right = Math.max(...bounds.map(box => box.x + box.w)) + this.gap;
            const h = bottom - top;
            for (const [x, direction] of [[left, 1], [right + this.width, -1]]) {
                const inner = x + direction * this.width;
                paths.push([
                    { op: 'M', x: inner, y: top },
                    { op: 'C', cx1: x, cy1: top + h * 0.18, cx2: x, cy2: bottom - h * 0.18, x: inner, y: bottom },
                ]);
                regions.push({ x: Math.min(x, inner) - half, y: top - half, w: this.width + this.stroke, h: h + this.stroke,
                    line: line.index, track: members[0].track });
            }
        }
        const strokeWidth = this.stroke;
        return {
            regions,
            paint(painter: Painter) {
                for (const path of paths) painter.drawPath(path, { stroke: '#000', strokeWidth });
            },
        };
    }
}
