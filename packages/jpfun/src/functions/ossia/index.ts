// M3N addition: local alternative melody, with its own lyrics and native time columns.
import { ASTFunctionNode, type ASTFunctionClass, type ASTNodeBase, type FunctionArgs, type ParserContext, type SourceSpan } from '../ASTtypes.js';
import type { LoweringContext } from '../../lowering/loweringContext.js';
import type { MeasureFn, PlaceFn, Track } from '../../lowering/track.js';

const measure: MeasureFn = (members, gap) => {
    let bottom = 0;
    return members.map(extent => {
        if (!extent) return null;
        const offset = bottom - extent.top;
        bottom = offset + extent.bottom + gap * 0.4;
        return { offset, extent };
    });
};
const place: PlaceFn = (host, group, gap) => host.bottom + gap * 0.4 - group.top;
const arrangement = { laneKey: 'ossia', measure, place };

class OssiaFunction extends ASTFunctionNode {
    static override def = {
        name: ['ossia'], description: '主旋律下方的局部替代旋律', details: '@ossia({1 2}, {@set(fontsize=16) 3 4})',
        allowExtraArgs: false,
        args: [
            { name: 'host', type: 'content' as const, default: null, description: '主旋律' },
            { name: 'alternative', type: 'content' as const, default: null, description: '替代旋律' },
        ],
    };
    readonly host: ASTNodeBase;
    readonly alternative: ASTNodeBase;
    override get children() { return [this.host, this.alternative]; }
    override timeFlowModel() { return { children: this.children, mode: 'parallel' as const, tracks: arrangement }; }
    override loweringEnter(_ctx: LoweringContext, track: Track) {
        track.group(arrangement, 1).members[0].alternative = true;
        return [];
    }
    constructor(span: SourceSpan, args: FunctionArgs, ctx: ParserContext, parent: ASTNodeBase | null = null) {
        super(span, parent);
        [this.host, this.alternative] = this.getArgValue(args,ctx) as [ASTNodeBase,ASTNodeBase];
        this.host.parent = this; this.alternative.parent = this;
    }
    override toString(source: string) { return `@ossia(${this.host.toString(source)},${this.alternative.toString(source)})`; }
}
export const OssiaNode: ASTFunctionClass = OssiaFunction;
