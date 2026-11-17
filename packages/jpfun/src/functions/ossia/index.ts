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
const place: PlaceFn = (host, group, gap) => host.bottom + gap * 0.25 - group.top;
const arrangement = { laneKey: 'ossia', measure, place, localHost: true };

class OssiaFunction extends ASTFunctionNode {
    static override def = {
        name: ['ossia'], description: '主旋律下方的局部替代旋律', details: '@ossia({1 2}, {3 4})',
        allowExtraArgs: false,
        args: [
            { name: 'host', type: 'content' as const, default: null, description: '主旋律' },
            { name: 'alternative', type: 'content' as const, default: null, description: '替代旋律' },
            { name: 'lane', type: 'string' as const, default: 'default', description: '独立替代行' },
        ],
    };
    readonly lane: string;
    readonly arrangement: typeof arrangement;
    readonly host: ASTNodeBase;
    readonly alternative: ASTNodeBase;
    override get children() { return [this.host, this.alternative]; }
    override timeFlowModel() { return { children: this.children, mode: 'parallel' as const, tracks: this.arrangement }; }
    override loweringEnter(_ctx: LoweringContext, track: Track) {
        track.group(this.arrangement, 1).members[0].alternative = true;
        return [];
    }
    constructor(span: SourceSpan, args: FunctionArgs, ctx: ParserContext, parent: ASTNodeBase | null = null) {
        super(span, parent);
        const [host,alternative,lane] = this.getArgValue(args,ctx) as [ASTNodeBase,ASTNodeBase,string];
        this.host=host; this.alternative=alternative; this.lane=lane;
        const fontSize = ctx.variables.fontsize;
        this.arrangement={...arrangement,laneKey:`ossia/${lane}`,
            // This local clearance follows the music font, independently of
            // taller bars, headings, or text elsewhere on the system.
            place: (host, group) => host.bottom + fontSize * 0.32 - group.top,
        };
        this.host.parent = this; this.alternative.parent = this;
    }
    override toString(source: string) { return `@ossia(${this.host.toString(source)},${this.alternative.toString(source)},lane=${JSON.stringify(this.lane)})`; }
}
export const OssiaNode: ASTFunctionClass = OssiaFunction;
