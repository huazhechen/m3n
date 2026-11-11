// M3N addition: local uniform-height groups without changing time, wrapping or playback.
import { ASTFunctionNode, type ASTFunctionClass, type ASTNodeBase, type FunctionArgs, type SourceSpan } from '../ASTtypes.js';
import type { ParserContext } from '../../parser/parserContext.js';
import type { LoweringContext } from '../../lowering/loweringContext.js';
import type { Track } from '../../lowering/track.js';
import { quote } from '../../parser/parse-utils/string-utils.js';

class SpacingFunction extends ASTFunctionNode {
    static override def = {
        name: ['spacing'],
        description: '为段落指定独立的等行高分组',
        details: '使用 @spacing({音乐},group="段落标识")；只限定等行高共享范围，不改变时间、分行或播放。',
        allowExtraArgs: false,
        args: [
            { type: 'content' as const, default: null },
            { name: 'group', type: 'string' as const, default: '', namedOnly: true },
        ],
    };
    readonly content: ASTNodeBase;
    readonly group: string;
    constructor(span: SourceSpan, args: FunctionArgs, ctx: ParserContext, parent: ASTNodeBase | null = null) {
        super(span, parent);
        [this.content, this.group] = this.getArgValue(args, ctx) as [ASTNodeBase, string];
        this.content.parent = this;
    }
    override get children() { return [this.content]; }
    override loweringEnter(ctx: LoweringContext, _track: Track) {
        ctx.beginLoweringGroup(this, { onTemporal: node => {
            node.addon = { ...node.addon, systemHeightGroup: node.addon?.systemHeightGroup ?? this.group };
        } });
        return [];
    }
    override timeFlowModel() { return { mode: 'sequence' as const, children: [this.content] }; }
    override loweringExit(ctx: LoweringContext) { ctx.endLoweringGroup(this); return []; }
    override toString(source: string) { return `@spacing(${this.content.toString(source)},group=${quote(this.group)})`; }
}
export const SpacingNode: ASTFunctionClass = SpacingFunction;
