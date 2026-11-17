// M3N modification: lyric metadata/spacing and optional connectors on every system.
import { ASTNodeBase, ASTBraceNode, FunctionArgs, SourceSpan, ASTFunctionNode, ASTFunctionClass, ASTTextNode } from "../ASTtypes.js";
import { measureLyricFragment, lyricSilentPunctuation as LYRIC_SILENT_PUNCTUATION, type LyricPiece } from "./lyric-fragment.js";
import { Diagnostic, ErrorDiagnostic, WarningDiagnostic } from "../../diagnostic.js";
import { findRightParen } from "../../parser/parse-utils/call-utils.js";
import { findClosingQuote, quote, removeQuote } from "../../parser/parse-utils/string-utils.js";
import { GrammarNode, GrammarSugarNode, type CallArgumentInfo } from "../../parser/grammarType.js";
import { ParserContext, skipSpaces } from "../../parser/parserContext.js";
import type { LoweringContext } from "../../lowering/loweringContext.js";
import type { LoweringResult } from "../../lowering/types.js";
import { isLayoutAttachment } from "../../layout/types.js";
import { getLayoutBounds } from "../../layout/engine.js";
import { paintedCommandRegions, paintedNodeRegions } from "../../layout/painted-ink.js";
import { RecordingPainter } from "../../render/recording.js";
import {
    isVisualTemporalNode,
    TemporalNodeBase,
} from "../temporal.js";
import type { MeasureFn, Track } from "../../lowering/track.js";
import type {
    AttachmentLayoutContext,
    Extent,
    HorizontalLineView,
    LayoutAttachment,
    LayoutBox,
    LayoutPrepareContext,
    LayoutRegion,
} from "../../layout/types.js";
import type { Painter, PathCommand, TextStyle } from "../../render/types.js";
import {
    CURVED_BRACE_BOUNDS, CURVED_BRACE_COMMANDS,
    parseConnections, resolveConnections, serializeConnections,
    type ConnectionSpec, type VoiceConnection,
} from "./connections.js";

const WHITEPACE_RE = /\s/;
// 分词跟后面的标点
const LYRIC_OPENING_PUNCTUATION = new Set("（([［｛〈《「『【〔〖〘〚‘“");
const visibleLyricText = (text: string) => text.replaceAll('\u200B', '').trim().length > 0;

/**
 * voices 块在宿主基线上局部居中：首末两条 voice 基线的中点对齐宿主轴
 *
 * 居中只看**基线**，不看成员的整体视觉边界，也不取所有基线的算术平均值。
 * 因此嵌套的 stack、歌词、装饰只会撑开相邻基线的间距和行高，
 * 不会把整个块相对于主旋律的语义中心挪走。
 *
 * 本行没有实质高度的成员（空声部，或内容都在上一行）仍然占一个默认高度的槽位，
 * 声部数量因而保持稳定，居中结果也不会因为某一声部没写东西而跳变。
 */
function makeVoicesMeasure(emptySlotHeight: number): MeasureFn {
    const half = emptySlotHeight / 2;
    return (members, gap) => {
        const extents: Extent[] = members.map(member =>
            member && member.bottom - member.top > 1e-6 ? member : { top: -half, bottom: half });
        const offsets: number[] = [];
        let y = 0;
        for (let i = 0; i < extents.length; i++) {
            if (i > 0) y += extents[i - 1].bottom + gap - extents[i].top;
            offsets.push(y);
        }
        const center = (offsets[0] + offsets[offsets.length - 1]) / 2;
        return offsets.map((offset, i) => ({ offset: offset - center, extent: extents[i] }));
    };
}

class VoiceFunction extends ASTFunctionNode {
    static override def = {
        name: ["voice", "v"],
        description: "声部",
        details: `\
~~~jpfun
@voice({1 2 3}, 钢琴, 男=ha ha ha, 女=la la la)
~~~
- **额外参数**：每项为一行歌词；命名参数同时给出歌词行名，位置参数表示无行名。省略声部名但仍需歌词时，保留空位，如 \`@voice({1 2 3}, , ha ha ha)\`。

歌词可用引号包裹；显式调用中含逗号等歧义字符时必须加引号。英文用空格或连字符 \`-\` 分词，用 \`@\` 占位。

**简写**：\`N\` 声明音符行，\`L\` 声明歌词行，括号内的名称可省略：
~~~jpfun
N(钢琴): 1 2 3
L(男): ha ha ha
L: la la la
~~~
行首允许空白，换行结束当前声明；在行末加 \`\\\` 可续行。这种写法中的歌词允许直接使用逗号。`,
        allowExtraArgs: true,
        extraArgType: "string" as const,
        args: [
            {
                type: "content" as const,
                description: "声部的音符内容",
                default: null,
            },
            {
                name: "name",
                description: "显示在左侧的声部名称，空值隐藏名称",
                type: "string" as const,
                default: "",
            },
            {
                name: "lyricunderlines",
                namedOnly: true,
                description: "需加下划线的歌词槽，使用从 0 开始的 行:槽 索引，以逗号分隔",
                type: "string" as const,
                default: "",
            },
            {
                name: "lyricprefixes",
                namedOnly: true,
                description: "歌词左侧的独立标记，JSON 对象以从 0 开始的 行:槽 为键、标记文本为值",
                type: "string" as const,
                default: "{}",
            },
            {
                name: "compactlyrics",
                namedOnly: true,
                description: "按每行每轨的可见歌词收起空歌词行，保留原始行索引",
                type: "boolean" as const,
                default: false,
            },
            // 之后的参数都当作歌词参数
        ],
    };

    // 去糖第一阶段识别两个标签 这里先不消费换行符，因为 br 可能需要
    static override deSugarAtom(source: string, start: number, end: number) {
        if (source[start] !== 'N' && source[start] !== 'L') return null;
        let pos = start + 1;
        let name = '';
        if (source[pos] === '(') {
            // `X(name)` 提取括号
            const at = findRightParen(source, pos + 1, end);
            if (at < 0) return null;    // 没有找到匹配的右括号 不去糖
            name = removeQuote(source.slice(pos + 1, at).trim());
            pos = at + 1;
        }
        if (source[pos++] !== ':') return null;   // `:` 之前不允许有空格
        // 识别具体内容
        if (source[start] === 'N') {
            // 等到第二轮寻找该层级的终止符 \n 来确定内容范围
            const node: GrammarSugarNode = {
                kind: "sugar",
                data: {
                    class: VoiceFunction,
                    name,
                },
                span: { start, end: pos },
            }; return { next: pos, node };
        } else {
            // 字符串收集
            pos = skipSpaces(source, pos, end);
            if (pos >= end) return null;    // 没有内容了 不去糖
            let lyric: string;
            // 双引号才是字符串，单引号不是
            if (source[pos] === '"') {
                // 未闭合就不去糖，词法层每次击键都跑，不能抛
                const close = findClosingQuote(source, pos, end);
                if (close < 0) return null;
                lyric = removeQuote(source.slice(pos, close + 1));
                pos = close + 1;
            } else {
                // 没有引号的 以换行符为界切分 预处理已经跳过了转义的换行符了
                const from = pos;
                while (pos < end && source[pos] !== '\n') pos++;
                lyric = source.slice(from, pos).trim();
            }
            const node: GrammarSugarNode = {
                kind: "sugar",
                data: {
                    class: VoiceFunction,
                    lyric,
                    name,
                },
                span: { start, end: pos },
            }; return { next: pos, node };
        }
    }

    static override deSugarRelation(ctx: ParserContext, nodes: (GrammarNode | number)[], at: number, members?: VoiceFunction[]) {
        const n = nodes[at++] as GrammarSugarNode;
        if (n.data?.class !== VoiceFunction) return null;
        if (n.data?.lyric !== void 0) {
            // 歌词 需要找到最近的voice节点并添加歌词
            let voiceNode: VoiceFunction | null = null;
            let voiceNodeAt = ctx.nodes.length - 1;
            for (; voiceNodeAt >= 0; voiceNodeAt--) {
                const n = ctx.nodes[voiceNodeAt];
                if (n instanceof ASTTextNode) {
                    if (!ctx.variables.strict) continue;   // 非严格模式下允许文本节点夹在N和L之间
                    // ParserContext.parseGrammar 处理后不会有空白字符
                    throw new ErrorDiagnostic(
                        "E_LYRICS_WITHOUT_VOICE_NOTES",
                        `strict 模式下，语法糖 'L:' 或 'L(name)' 必须跟在 @voice 的音符之后，但在其前面发现了未知文本`,
                        n.sourceSpan
                    );
                }
                if (n instanceof VoiceFunction) voiceNode = n;
                else if (n instanceof VoicesFunction) voiceNode = n.voices.at(-1) ?? null;
                break;
            }
            if (voiceNode === null) {
                throw new ErrorDiagnostic(
                    "E_LYRICS_WITHOUT_VOICE_NOTES",
                    `语法糖 'L:' 或 'L(name):' 必须跟在 @voice（或 N:）之后，但没有找到符合要求的 voice；请检查语法或直接使用 @voice 函数`,
                    n.span
                );
            }
            voiceNode.addLyric(n.data.name, n.data.lyric, n.span, ctx);
            ctx.nodes.length = voiceNodeAt + 1;   // 清除voiceNodeAt之后的TextNode 因为被夹在N和L之间
            // 消费后面可能的换行符 只消费一个
            if (at < nodes.length && typeof nodes[at] === "number" && ctx.source[nodes[at] as number] === '\n') at++;
            return at;
        }
        // 当前层的换行或 N/L/V 声明结束音符内容，不能把下一组吞进声部
        let breakAt = at;
        let endWithBr = 0;
        for (; breakAt < nodes.length; breakAt++) {
            const n = nodes[breakAt];
            if (typeof n === "number") {
                if (ctx.source[n] === '\n') {
                    // 换行符应该被 N: 消费
                    endWithBr = 1;
                    break;
                }
            } else if (n.kind === "sugar"
                && (n.data?.class === VoiceFunction || n.data?.class === VoicesFunction)) break;
        }
        // 解析后面的内容 得到 VoiceFunction
        const newCtx = new ParserContext(ctx);
        const slicedNodes = nodes.slice(at, breakAt);   // 防止子解析越界
        breakAt += endWithBr;   // 不让子内容有换行符
        newCtx.makeNodes(slicedNodes);
        if (newCtx.nodes.length === 0) {
            throw Diagnostic.error.EmptyContent("voice", "content", n.span);
        }
        const span: SourceSpan = { start: n.span.start, end: newCtx.nodes.at(-1)!.sourceSpan.end };
        const argMap: FunctionArgs = new Map();
        if (newCtx.nodes.length === 1 && newCtx.nodes[0] instanceof ASTBraceNode) argMap.set(0, newCtx.nodes[0]);
        // 复制一份：voice 的 span 之后会被歌词撑大，内容 brace 不该跟着长
        else argMap.set(0, new ASTBraceNode({ ...span }, newCtx.nodes));
        argMap.set("name", n.data.name);
        const newVoice = new VoiceFunction(span, argMap, ctx, null);

        // V 声明直接收集成员，最后统一组装，避免创建临时 voices
        if (members) {
            ctx.pushNode(newVoice);
            members.push(newVoice);
            return breakAt;
        }

        // 如果前面紧挨着 VoicesFunction | VoiceFunction 则直接加入
        let voicesNode: VoicesFunction | null = null;
        let voicesNodeAt = ctx.nodes.length - 1;
        let textBetween: ASTTextNode | null = null;
        ifCombine: for (; voicesNodeAt >= 0; voicesNodeAt--) {
            const n = ctx.nodes[voicesNodeAt];
            if (n instanceof ASTTextNode) {
                if (ctx.variables.strict) break;
                // 如果中间有换行符，直接说明是两个独立的 voice 组件，不能合并
                for (let i = n.sourceSpan.start; i < n.sourceSpan.end; i++) {
                    if (ctx.source[i] === '\n') break ifCombine;
                }
                textBetween = n;
                continue;
            }
            if (n instanceof VoicesFunction) {
                if (!n.createdBySugar) break;   // 不会合并到函数创建的 voices 中
                voicesNode = n;
            } else if (n instanceof VoiceFunction) {
                const args: FunctionArgs = new Map();
                args.set(0, n);
                voicesNode = new VoicesFunction({
                    start: n.sourceSpan.start,
                    end: n.sourceSpan.end
                }, args, ctx, null);
                voicesNode.createdBySugar = true;
            } break;
        }
        if (voicesNode) {
            ctx.nodes[voicesNodeAt] = voicesNode;
            voicesNode.addVoice(newVoice);
            if (textBetween) {
                ctx.nodes.length = voicesNodeAt + 1;
                ctx.diagnostics.push(new WarningDiagnostic(
                    "W_VOICES_TEXT_BETWEEN",
                    `两个 @voice 之间有未知文本。当前处于非 strict 模式，会忽略该内容、合并为一个 @voices`,
                    textBetween.sourceSpan
                ));
            }
        } else ctx.pushNode(newVoice);
        return breakAt;
    }

    content: ASTBraceNode;   // 声部内容
    name: string;   // 声部名称
    size: number;   // 声部的字体大小
    readonly font: string;
    readonly reserveLyricPunctuation: boolean;
    readonly underlinedLyricSlots: ReadonlySet<string>;
    readonly lyricPrefixes: ReadonlyMap<string, string>;
    readonly compactLyrics: boolean;
    lyrics: {
        name: string,
        tokens: string[]   // 分词后的歌词内容
    }[];
    override get children() { return [this.content]; }
    override timeFlowModel() {
        return {
            children: this.children,
            mode: "sequence" as const,
        };
    }

    /**
     * voice 的音符内容仍按普通 sequence 进入全局时间列
     * 此处只建立歌词作用域，并按需在内容前创建声部名对象
     */
    override loweringEnter(ctx: LoweringContext) {
        // 无名声部也要产出一个（不可见的）名称事件，才能保证同一个 voices 块内
        // 每个成员的列结构完全一致，从而把所有声部名归并到同一列
        const parent = this.parent;
        // 多声部时同时在名称右侧预留大括号的横向空间
        const braceSpace = parent instanceof VoicesFunction && parent.voices.length > 1
            ? parent.braceSpace
            : 0;
        const nameHost = new VoiceNameTemporal(this, braceSpace);

        // 收集范围内的
        const temporalMembers: TemporalNodeBase[] = [];
        const frames: LayoutAttachment[] = [];
        ctx.beginLoweringGroup(this, {
            attachment: new VoiceLyricsAttachment(temporalMembers, nameHost, frames),
            onAttachment(attachment) {
                if (isLayoutAttachment(attachment) && attachment.layer === "background") frames.push(attachment);
            },
            onTemporal(node) { temporalMembers.push(node); },
        });

        return [nameHost];
    }

    override loweringExit(ctx: LoweringContext) {
        ctx.endLoweringGroup(this);
        return [];
    }

    constructor(span: SourceSpan, args: FunctionArgs, ctx: ParserContext, parent: ASTNodeBase | null = null) {
        super(span, parent);
        this.size = ctx.variables.fontsize;
        const [content, name, lyricUnderlines, lyricPrefixes, compactLyrics] = this.getArgValue(args, ctx) as [ASTBraceNode, string, string, string, boolean];
        this.content = content; this.name = name;
        this.compactLyrics = compactLyrics;
        this.content.parent = this;
        this.font = ctx.variables.font;
        this.reserveLyricPunctuation = ctx.variables.lyricspacing === "reserve";
        this.underlinedLyricSlots = new Set(lyricUnderlines.split(','));
        try {
            const prefixes: unknown = JSON.parse(lyricPrefixes);
            if (!prefixes || typeof prefixes !== 'object' || Array.isArray(prefixes)
                || Object.entries(prefixes).some(([key, value]) => !/^\d+:\d+$/.test(key) || typeof value !== 'string')) {
                throw new Error('Invalid lyric prefixes');
            }
            this.lyricPrefixes = new Map(Object.entries(prefixes));
        } catch {
            throw new ErrorDiagnostic('E_VOICE_INVALID_LYRIC_PREFIXES', 'lyricprefixes 必须是以 行:槽 为键、标记文本为值的 JSON 对象', span);
        }
        args.delete('lyricunderlines');
        args.delete('lyricprefixes');
        args.delete('compactlyrics');
        args.delete(0);
        args.delete("name");
        args.delete(1);

        this.lyrics = [];
        for (const [key, value] of args) {
            if (typeof value === "string") {
                this.addLyric(key, value);
                continue;
            }
            const arg = value as CallArgumentInfo;
            const v = ctx.parseArgWithType(arg.valueSpan, "string", span.start);
            if (v === null) {
                ctx.diagnostics.push(new WarningDiagnostic(
                    "W_VOICE_INVALID_LYRIC",
                    `@voice 的歌词参数值解析失败, 参数[${key}]将被忽略`,
                    arg.valueSpan
                ));
            } else this.addLyric(key, v as string);
        }
    }

    addLyric(name: string | number, lyric: string, span: SourceSpan | null = null, ctx: ParserContext | null = null) {
        if (typeof name === "number") name = "";
        const tokens = VoiceFunction.parseLyric(lyric as string);
        if (tokens.length === 0 && ctx && span) {
            ctx.diagnostics.push(new WarningDiagnostic(
                "W_EMPTY_LYRIC",
                `@voice的歌词${name}是空的`,
                span
            ));
        }
        this.lyrics.push({ name, tokens });
        if (span) {
            // 歌词是成节点之后才补上来的，祖先的 span 得一起长，否则按源码位置查节点会漏掉歌词那几行
            for (let node: ASTNodeBase | null = this; node; node = node.parent) {
                node.sourceSpan.start = Math.min(span.start, node.sourceSpan.start);
                node.sourceSpan.end = Math.max(span.end, node.sourceSpan.end);
            }
        }
    }

    /**
     * 把歌词拆成与音符一一对应的槽位。
     * 例如 `hello world` 拆成 `hello`、`world`，`hel-lo` 拆成 `hel-`、`lo`；
     * `你好吗` 默认逐字拆分，`你 @ 好` 中的 `@` 留出一个空槽，`{你好} 啊` 则把 `你好` 放在同一个槽位。
     * 转义符：hel\-lo \@ {你\}好} 会得到 ["hel-lo", "@", "你}好"]，而不是把 -、@、} 当控制符
     */
    static parseLyric(value: string): string[] {
        const result: string[] = [];
        let token = "";
        let prefix = "";
        const pushSlot = (text: string) => {
            result.push(prefix + text);
            prefix = "";
        };
        const pushToken = () => {
            if (token) pushSlot(token);
            token = "";
        };
        for (let i = 0; i < value.length; i++) {
            const ch = String.fromCodePoint(value.codePointAt(i)!);
            i += ch.length - 1;
            if (ch === "\\" && i + 1 < value.length && /[\\{}@-]/.test(value[i + 1])) {
                token += value[++i];
            } else if (ch === "{") {
                let close = i + 1;
                let grouped = "";
                for (; close < value.length && value[close] !== "}"; close++) {
                    if (value[close] === "\\" && close + 1 < value.length && /[\\{}@-]/.test(value[close + 1])) {
                        grouped += value[++close];
                    }
                    else grouped += value[close];
                }
                if (close < value.length) {
                    pushToken();
                    pushSlot(grouped);
                    i = close;
                } else token += ch;
            } else if (WHITEPACE_RE.test(ch)) {
                pushToken();
            } else if (ch === "-") {
                // 如果前面有内容 则把-放到前一个词里
                token += ch;
                if (token.length > 1) pushToken();
            } else if (ch === "@") {
                if (token) {
                    token += ch;
                    pushToken();
                }
                result.push('');
            } else if (LYRIC_OPENING_PUNCTUATION.has(ch)) {
                pushToken();
                prefix += ch;
            } else if (LYRIC_SILENT_PUNCTUATION.has(ch)) {
                if (token) token += ch;
                else if (prefix || !result.at(-1)) prefix += ch;
                else result[result.length - 1] += ch;
            } else if (ch.charCodeAt(0) > 0x7F) {
                // 遇到中文等非ASCII字符 直接切分成单个字符
                pushToken();
                pushSlot(ch);
            } else token += ch;
        }
        pushToken();
        if (prefix) {
            if (result.at(-1)) result[result.length - 1] += prefix;
            else result.push(prefix);
        }
        return result;
    }

    override toString(source: string) {
        const parameters = [`${this.content.toString(source)},${quote(this.name)}`];
        for (const lyric of this.lyrics) {
            const text = quote(lyric.tokens.map(token => token.length === 0
                ? "@" : `{${token.replace(/[\\{}@-]/g, "\\$&")}}`).join(" "));
            parameters.push(lyric.name ? `${lyric.name}=${text}` : text);
        }
        const underlines = [...this.underlinedLyricSlots].filter(Boolean);
        if (underlines.length) parameters.push(`lyricunderlines=${quote(underlines.join(','))}`);
        if (this.lyricPrefixes.size) parameters.push(`lyricprefixes=${quote(JSON.stringify(Object.fromEntries(this.lyricPrefixes)))}`);
        if (this.compactLyrics) parameters.push('compactlyrics=true');
        return `@voice(\n\t${parameters.join(",\n\t")}\n)`;
    }
}

class VoicesFunction extends ASTFunctionNode {
    static override def = {
        name: ["voices", "vs"],
        description: "多个声部",
        details: `\
~~~jpfun
@voices(
    @voice({1 2 3}, 钢琴, 男=ha ha ha),
    @voice({3 4 5}, , "la la la")
)
~~~

接受多个声部作为位置参数，将它们按时间对齐、分行排布；声部名称和歌词由各自的 \`@voice\` 提供

**视觉连接**：仅命名参数 \`connect\` 使用字符串，如 \`connect="[1-4]{5-7}"\`。
\`[]\` 是现有括线，\`{}\` 是弯曲大括号；编号从 1 开始，省略起点/终点表示首/末声部。
默认 \`"[-]"\` 连接全部声部；\`""\` 只保留公共细连谱线。未指定的声部仍有细线，范围可以重叠，不改变声部或播放关系。
用 \`@set(voices.connect="{1-2}[3-]")\` 设置后续多声部块的默认方案，显式参数写在所有声部之后。
\`repeatconnect=true\` 在后续每个谱表系统左侧重复连接符并预留空间，声部名称仍只显示一次。

**简写**：连续声明多个 \`N:\` 声部及其 \`L:\` 歌词，会自动组成 \`voices\`

~~~jpfun
N(钢琴): 1 2 3
L(男): ha ha ha
N: 3 4 5
L: la la la
~~~

连接声明 \`V{}:\`、\`V[]:\`、\`V|:\` 分别指定后续声部的弯曲大括号、现有括线和仅细线，后面的 \`N:\` 可以同行，也可以换行。
到下一条 V 声明或当前块末尾结束，组间不空行；空行结束整个多声部块。
出现 V 声明时，当前块完整替换默认连接方案，不影响后面的块。V 不创建音轨，L 仍属于前面的 N。

~~~jpfun
V{}: N(右手): 1 2 3
N(左手): 5 6 7
V[]: N(女高): 6 6 5
L: 啊 啊 啊
N(女低): 1 2 3
~~~`,
        allowExtraArgs: true,
        extraArgType: "content" as const,
        args: [{
            name: "connect",
            namedOnly: true,
            type: "string" as const,
            default: "[-]",
            description: '视觉连接：[1-4] 为现有括线，{5-7} 为弯曲大括号；省略端点表示首/末声部，空字符串只保留公共连谱线。',
        }, {
            name: "repeatconnect",
            namedOnly: true,
            type: "boolean" as const,
            default: false,
            description: "在换行或分页后的每个谱表系统重复连接符。",
        }]
    };

    static override deSugarAtom(source: string, start: number, end: number) {
        if (source[start] !== "V") return null;
        const match = /^V(\{\}|\[\]|\|):/.exec(source.slice(start, end));
        if (!match) return null;
        const next = start + match[0].length;
        const node: GrammarSugarNode = {
            kind: "sugar",
            data: {
                class: VoicesFunction,
                kind: match[1] === "{}" ? "brace" : match[1] === "[]" ? "bracket" : "line",
            },
            span: { start, end: next },
        };
        return { next, node };
    }

    static override deSugarRelation(ctx: ParserContext, nodes: (GrammarNode | number)[], at: number) {
        const first = nodes[at];
        if (typeof first === "number" || first.kind !== "sugar" || first.data?.class !== VoicesFunction) return null;

        let previousIndex = ctx.nodes.length - 1;
        while (previousIndex >= 0 && ctx.nodes[previousIndex] instanceof ASTTextNode) {
            const { sourceSpan } = ctx.nodes[previousIndex];
            const text = ctx.source.slice(sourceSpan.start, sourceSpan.end);
            if (text.includes("\n") || text.trim()) break;
            previousIndex--;
        }
        const previous = ctx.nodes[previousIndex];
        const members = previous instanceof VoiceFunction ? [previous]
            : previous instanceof VoicesFunction && previous.createdBySugar ? [...previous.voices] : [];
        const mergePrevious = members.length > 0;
        const connections: ConnectionSpec[] = [];
        let cursor = at;
        while (cursor < nodes.length) {
            const marker = nodes[cursor];
            if (typeof marker === "number" || marker.kind !== "sugar" || marker.data?.class !== VoicesFunction) break;
            cursor++;
            const carriageReturn = nodes[cursor];
            if (typeof carriageReturn === "number" && ctx.source[carriageReturn] === "\r") cursor++;
            const newline = nodes[cursor];
            if (typeof newline === "number" && ctx.source[newline] === "\n") cursor++;

            // 每段单独解析 N/L，防止歌词越过 V 声明附着到上一段
            const section = new ParserContext(ctx);
            const from = members.length + 1;
            while (cursor < nodes.length) {
                const node = nodes[cursor];
                if (typeof node === "number" || node.kind !== "sugar" || node.data?.class !== VoiceFunction) break;
                cursor = VoiceFunction.deSugarRelation(section, nodes, cursor, members)!;
            }
            if (members.length < from) {
                throw new ErrorDiagnostic("E_VOICES_GROUP_EMPTY", "V 声部分组必须至少包含一条 N: 声部声明", marker.span);
            }
            if (marker.data.kind === "brace" || marker.data.kind === "bracket") {
                connections.push({ kind: marker.data.kind, from, to: members.length });
            }
        }
        const args: FunctionArgs = new Map();
        members.forEach((member, index) => args.set(index, member));
        args.set("connect", serializeConnections(connections));
        const voices = new VoicesFunction({
            start: mergePrevious ? previous.sourceSpan.start : first.span.start,
            end: members.at(-1)!.sourceSpan.end,
        }, args, ctx);
        voices.createdBySugar = true;
        if (mergePrevious) ctx.nodes.length = previousIndex;
        ctx.pushNode(voices);
        return cursor;
    }

    voices: VoiceFunction[];
    createdBySugar: boolean = false;    // 不同创建方式的不能合并
    readonly size: number;              // parse 期冻结的字号，px
    /** 声部名右侧为大括号预留的横向空间 */
    readonly braceSpace: number;
    private readonly connect: string;
    readonly repeatconnect: boolean;
    // 收集阶段只冻结配置，避免提前校验随后会被 V 声明覆盖的默认值。
    private get connectionSpecs(): ConnectionSpec[] {
        return parseConnections(this.connect, this.sourceSpan);
    }
    /** 闭包捕获 parse 期冻结的字号，用来决定空声部槽位的默认高度（1em） */
    private readonly measure: MeasureFn;
    override get children() { return this.voices; }
    override timeFlowModel() {
        return {
            children: this.children,
            mode: "parallel" as const,
            tracks: {
                laneKey: `voices/${this.voices.length}`,
                hostIndex: null,    // 宿主不是成员：第一个 voice 也必须拥有独立轨道
                measure: this.measure,
            },
        };
    }

    /** 收集本块产生的声部名事件，退出时注册左侧大括号 */
    override loweringEnter(ctx: LoweringContext) {
        const names: VoiceNameTemporal[] = [];
        ctx.beginLoweringGroup(this, {
            attachment: new VoicesBraceAttachment(names, this, resolveConnections(this.connectionSpecs, this.voices.length, this.sourceSpan)),
            onTemporal: node => {
                if (node instanceof VoiceNameTemporal && node.ast.parent === this) names.push(node);
            },
        });
        return [];
    }

    override loweringExit(ctx: LoweringContext) {
        ctx.endLoweringGroup(this);
        return [];
    }

    static override loweringFinalize(result: LoweringResult) {
        const insertions = new Map<TemporalNodeBase[], VoiceNameTemporal[]>();
        let order = 0;
        for (const nodes of result.astToTemporal.values()) for (const node of nodes) order = Math.max(order, node.order + 1);
        for (const attachment of [...result.attachments]) {
            if (!(attachment instanceof VoicesBraceAttachment)) continue;
            for (const { column, names, connector } of attachment.continuations(result)) {
                for (const name of names) {
                    name.order = order++;
                    result.astToTemporal.get(name.ast)!.push(name);
                }
                insertions.set(column, [...(insertions.get(column) ?? []), ...names]);
                result.attachments.push(connector);
            }
        }
        if (insertions.size) result.columns = result.columns.flatMap(column => {
            const names = insertions.get(column);
            return names ? [names, column] : [column];
        });
    }

    constructor(span: SourceSpan, args: FunctionArgs, ctx: ParserContext, parent: ASTNodeBase | null = null) {
        super(span, parent);
        this.voices = [];
        this.size = ctx.variables.fontsize;
        this.braceSpace = this.size;
        this.measure = makeVoicesMeasure(ctx.variables.fontsize);
        [this.connect, this.repeatconnect] = this.getArgValue(args, ctx) as [string, boolean];
        for (const [key, value] of args) {
            if (key === "connect" || key === "repeatconnect") continue;
            const valueSpan = value instanceof ASTNodeBase ? value.sourceSpan : (value as CallArgumentInfo).valueSpan;
            const voice = value instanceof ASTNodeBase ? value : ctx.parseArgWithType(valueSpan, "content", span.start);
            if (!(voice instanceof VoiceFunction)) {
                throw new ErrorDiagnostic(
                    "E_VOICES_INVALID_CHILD",
                    `@voices 的参数必须是 @voice 函数，但发现了其他类型 ${voice?.constructor.name}`,
                    valueSpan
                );
            }
            this.addVoice(voice);
        }
        if (this.voices.length === 0) {
            throw new ErrorDiagnostic(
                "E_VOICES_EMPTY",
                `@voices 必须至少包含一个 @voice 函数`,
                span
            );
        }
    }

    addVoice(v: VoiceFunction) {
        this.voices.push(v);
        v.parent = this;
        this.sourceSpan.start = Math.min(v.sourceSpan.start, this.sourceSpan.start);
        this.sourceSpan.end = Math.max(v.sourceSpan.end, this.sourceSpan.end);
    }

    toString(source: string) {
        const parameters = this.voices.map(voice => `\t${voice.toString(source)}`);
        parameters.push(`\tconnect=${quote(serializeConnections(this.connectionSpecs))}`);
        if (this.repeatconnect) parameters.push("\trepeatconnect=true");
        return `@voices(\n${parameters.join(",\n")}\n)`;
    }
}

export const VoiceNode: ASTFunctionClass = VoiceFunction;
export const VoicesNode: ASTFunctionClass = VoicesFunction;

/** 歌词与歌词行名称相对声部字号的字号 */
const LYRIC_SIZE_RATIO = 0.82;

/** 无大括号时标签右侧的空隙，相对声部字号 */
const NAME_GAP_RATIO = 0.6;

/** 歌词行名称的宽度决定标签列宽度，因此声部名事件和歌词附件必须用同一个样式测量 */
function lyricNameStyle(size: number, fontFamily: string): TextStyle {
    return {
        fontFamily,
        fontSize: size * LYRIC_SIZE_RATIO,
        fill: "#000",
        fontWeight: 600,
    };
}

class VoiceNameTemporal extends TemporalNodeBase {
    declare ast: VoiceFunction;
    declare box: LayoutBox;

    /** 名称右侧为大括号预留的横向空间，0 表示不需要 */
    private readonly braceSpace: number;
    private textBaselineY = 0;

    constructor(ast: VoiceFunction, braceSpace: number, private readonly continuation = false) {
        super();
        this.ast = ast;
        this.braceSpace = braceSpace;
        this.mergeKey = -2;
        // 既没有名称、也不需要括号空间和标签列时只保留不可见的占位事件：
        // 它不进入可见对象，也不让空声部失去默认槽位高度
        if (ast.name || braceSpace > 0 || ast.lyrics.some(lyric => lyric.name)) this.initLayoutBox();
    }

    override prepareLayout(context: LayoutPrepareContext) {
        const metrics = this.ast.name && !this.continuation
            ? context.textMeasurer.measureText(this.ast.name, this.style)
            : { w: 0, h: 0, baseline: 0 };
        // 声部名和歌词行名称共用这一列，列宽取其中最宽的一个
        let labelWidth = metrics.w;
        for (const lyric of this.ast.lyrics) {
            if (this.continuation) break;
            if (!lyric.name) continue;
            const lyricMetrics = context.textMeasurer.measureText(lyric.name, lyricNameStyle(this.ast.size, this.ast.font));
            labelWidth = Math.max(labelWidth, lyricMetrics.w);
        }

        // 没有大括号时也要在标签右侧留出与内容分离的空隙
        const rightSpace = this.braceSpace > 0 ? this.braceSpace
            : labelWidth > 0 ? this.ast.size * NAME_GAP_RATIO : 0;

        // 对齐点放在标签右边界：同一列共享 `x + anchor`，因此长短不一的声部名会右对齐，
        // 括号空间统一落在对齐点右侧
        this.box.w = labelWidth + rightSpace;
        this.box.h = metrics.h;
        this.box.anchor = labelWidth;
        this.box.visualAxis = metrics.h / 2;
        this.textBaselineY = metrics.baseline;

        // 声部名与第一个音符之间需要稳定但可压缩的横向间距
        this.springConfig.alpha_R = 0.45;
    }

    private get style(): TextStyle {
        return {
            fontSize: this.ast.size * 0.85,
            fontFamily: this.ast.font,
            fill: "#000",
            fontWeight: 600,
            textAlign: "right",
        };
    }

    override paint(painter: Painter) {
        if (!this.ast.name || this.continuation) return;
        painter.drawText(this.ast.name, this.box.x + this.box.anchor, this.box.y + this.textBaselineY, this.style);
    }
}

/**
 * 画在声部名与音符之间的多声部括线
 *
 * 共享一条细竖线，按连接范围添加粗括线或弯曲大括号
 * 端点按对应谱行首末声部的音乐主体实绘包络定位；所有尺寸随音乐字号缩放。
 */
class VoicesBraceAttachment implements LayoutAttachment {
    layer = "background" as const;

    private readonly names: VoiceNameTemporal[];
    private readonly ast: VoicesFunction;
    get sourceSpan() { return this.ast.sourceSpan; }

    constructor(names: VoiceNameTemporal[], ast: VoicesFunction, private readonly connections: VoiceConnection[]) {
        this.names = names;
        this.ast = ast;
    }

    *continuations(result: LoweringResult) {
        if (!this.ast.repeatconnect || this.names.length < 2) return;
        const firstLine = this.names[0].layoutLine;
        const seen = new Set<number>();
        for (const column of result.columns) {
            const line = column[0].layoutLine;
            if (line <= firstLine || seen.has(line)) continue;
            const belongs = column.some(node => {
                if (!isVisualTemporalNode(node)) return false;
                for (let ast: ASTNodeBase | null = node.ast; ast; ast = ast.parent) {
                    if (ast === this.ast) return true;
                }
                return false;
            });
            if (!belongs) continue;
            seen.add(line);
            // Zero-time native hosts reserve a connector column before controls,
            // repeats and notes. Their track axes also follow pagination.
            const names = this.names.map(original => {
                const name = new VoiceNameTemporal(original.ast, this.ast.braceSpace, true);
                name.track = original.track;
                name.t.copyFrom(column[0].t);
                name.layoutLine = line;
                return name;
            });
            yield { column, names, connector: new VoicesBraceAttachment(names, this.ast, this.connections) };
        }
    }

    createGeometry(context: AttachmentLayoutContext) {
        if (this.names.length < 2) return { regions: [], paint() {} };
        const em = this.ast.size;
        // Measure only timed music in this voices block. Grace notes, labels,
        // lyrics and outer expressions must not lengthen a remote connector.
        const bodies = this.names.map(name => {
            const pieces = (context.lines[name.layoutLine]?.columns.flat() ?? []).flatMap(host => {
                if (!(host instanceof TemporalNodeBase) || !isVisualTemporalNode(host)
                    || host.track !== name.track || host.T.isZero()) return [];
                for (let ast: ASTNodeBase | null = host.ast; ast; ast = ast.parent) {
                    if (ast === this.ast) return [
                        ...paintedNodeRegions(host, context.textMeasurer, true),
                        // Joined beams claim the local decoration's paint, but
                        // its own stroke still belongs to this voice's body.
                        ...host.decorations.filter(decoration => decoration.systemCore)
                            .flatMap(decoration => (decoration.getIntrinsicInk?.() ?? [])
                                .map(ink => ({ ...ink, x: ink.x + host.box.x, y: ink.y + host.box.y }))),
                    ];
                }
                return [];
            });
            const axis = name.box.y + name.box.visualAxis;
            return pieces.length ? { top: Math.min(...pieces.map(piece => piece.y)),
                bottom: Math.max(...pieces.map(piece => piece.y + piece.h)) }
                : { top: axis - em / 2, bottom: axis + em / 2 };
        });
        const top = bodies[0].top, bottom = bodies.at(-1)!.bottom;
        if (bottom - top < 1e-6) return { regions: [], paint() {} };
        const first = this.names[0].box;
        const x = first.x + first.anchor + em * .3;
        const thickness = em * .17, reach = em * .56;
        const recording = new RecordingPainter();
        for (const connection of this.connections) {
            const groupTop = bodies[connection.from - 1].top;
            const groupBottom = bodies[connection.to - 1].bottom;
            if (connection.kind === "bracket") {
                const rise = Math.min(em * .2, (groupBottom - groupTop) / 4);
                recording.drawRect(x, groupTop + rise * .65, thickness,
                    groupBottom - groupTop - rise * 1.3, { fill: "#000" });
                const hook = (y: number, direction: number) => {
                    const point = (dx: number, dy: number) => ({ x: x + dx, y: y + direction * dy });
                    const a = point(thickness, rise * .6), b = point(reach * .65, rise * .35);
                    const c = point(reach * .5, rise * .12), d = point(thickness * .5, rise * .4);
                    const commands: PathCommand[] = [
                        { op: "M", ...point(0, rise) }, { op: "L", ...point(thickness, rise) },
                        { op: "C", cx1: a.x, cy1: a.y, cx2: b.x, cy2: b.y, ...point(reach, 0) },
                        { op: "L", ...point(reach - em * .025, 0) },
                        { op: "C", cx1: c.x, cy1: c.y, cx2: d.x, cy2: d.y, ...point(0, rise * .65) },
                        { op: "Z" },
                    ];
                    recording.drawPath(commands, { fill: "#000" });
                };
                hook(groupTop, 1); hook(groupBottom, -1);
            } else {
                const width = em * .35, left = x + em * .32 - em * .12 - width;
                const scaleX = width / CURVED_BRACE_BOUNDS.w;
                const scaleY = (groupBottom - groupTop) / CURVED_BRACE_BOUNDS.h;
                recording.drawPath(CURVED_BRACE_COMMANDS, { fill: "#000" }, {
                    x: left - CURVED_BRACE_BOUNDS.x * scaleX,
                    y: groupTop - CURVED_BRACE_BOUNDS.y * scaleY, scaleX, scaleY,
                });
            }
        }
        const rise = Math.min(em * .2, (bottom - top) / 4);
        recording.drawLine(x + em * .32, top + rise * .4, x + em * .32,
            bottom - rise * .4, { stroke: "#000", strokeWidth: em * .055 });
        return {
            regions: recording.commands.flatMap(command => paintedCommandRegions(command, context.textMeasurer)),
            paint(painter: Painter) { recording.replay(painter); },
        };
    }
}

/** 一段已经定位好的歌词文本，同时就是报给引擎的占用区域 */
type PreparedLyricText = LayoutRegion & {
    text: string;          // 最终绘制的 token 或歌词行名称
    style: TextStyle;      // 当前文本使用的字体和颜色
    textBaselineY: number; // 字体 baseline 距文本盒顶部的距离
    textOffsetX?: number; // 实际文本起点相对墨迹盒左缘
    underline?: { left: number; right: number; y: number; stroke: number };
};

class VoiceLyricsAttachment implements LayoutAttachment {
    layer = "foreground" as const;
    readonly spacingRole = 'lyrics' as const;

    get sourceSpan() { return this.nameHost.ast.sourceSpan; }

    /** lowering 持续填入成员与内层框，布局阶段再读取 */
    constructor(
        private readonly temporalMembers: readonly TemporalNodeBase[],
        private readonly nameHost: VoiceNameTemporal,
        private readonly frames: readonly LayoutAttachment[],
    ) {}

    prepareHorizontal(lines: HorizontalLineView[], context: LayoutPrepareContext) {
        const targets = this.temporalMembers
            .filter(isVisualTemporalNode)
            .filter(node => node.ports?.["lyric"] && (!node.track.alternative || node.track === this.nameHost.track));
        const { lyrics, size } = this.nameHost.ast;
        if (targets.length === 0 || lyrics.length === 0) return;

        const style: TextStyle = { fontSize: size * LYRIC_SIZE_RATIO, fontFamily: this.nameHost.ast.font, fill: "#000" };
        for (let i = 0; i < targets.length; i++) {
            const target = targets[i];
            let leftWidth = 0, rightWidth = 0;
            for (const [row, lyric] of lyrics.entries()) {
                const text = lyric.tokens[i];
                if (text && (!this.nameHost.ast.compactLyrics || visibleLyricText(text))) {
                    const annotation = this.nameHost.ast.lyricPrefixes.get(`${row}:${i}`);
                    const fragment = measureLyricFragment(text, annotation,
                        this.nameHost.ast.underlinedLyricSlots.has(`${row}:${i}`), style, context.textMeasurer);
                    if (this.nameHost.ast.reserveLyricPunctuation) {
                        leftWidth = Math.max(leftWidth, -fragment.left + 1);
                        rightWidth = Math.max(rightWidth, fragment.right + 1);
                    } else {
                        leftWidth = Math.max(leftWidth, fragment.bodyHalf);
                        rightWidth = Math.max(rightWidth, fragment.bodyHalf);
                        if (annotation) leftWidth = Math.max(leftWidth, -fragment.left + 1);
                    }
                }
            }
            if (leftWidth === 0 && rightWidth === 0) continue;
            // 只扩大求解占用；视觉盒和端口不动，音符内部几何因此保持原位。
            lines[target.layoutLine]?.registerHorizontalLayoutHook(target, target, ({ columns, start }) => {
                const element = columns[start].find(item => item.time === target);
                if (!element) return;
                const lyricOffset = target.ports["lyric"].x - target.box.anchor;
                element.WL = Math.max(element.WL, leftWidth - lyricOffset);
                element.WR = Math.max(element.WR, rightWidth + lyricOffset);
            });
        }
    }

    createGeometry(context: AttachmentLayoutContext) {
        const text = this.prepareGeometry(context);
        const preparedText = this.nameHost.ast.compactLyrics ? text.filter(item => visibleLyricText(item.text)) : text;
        // 同一行同一轨的多行歌词由引擎合并成一段占用
        return {
            regions: preparedText,
            paint(painter: Painter) {
                for (const item of preparedText) {
                    painter.drawText(item.text, item.x + (item.textOffsetX ?? 0), item.y + item.textBaselineY, item.style);
                    if (item.underline) {
                        const y = item.y + item.underline.y;
                        painter.drawLine(item.x + item.underline.left, y, item.x + item.underline.right, y, { stroke: item.style.fill, strokeWidth: item.underline.stroke });
                    }
                }
            },
        };
    }

    private prepareGeometry(context: AttachmentLayoutContext) {
        const { lyrics, size } = this.nameHost.ast;
        const preparedText: PreparedLyricText[] = [];

        const targets = this.temporalMembers
            .filter(isVisualTemporalNode)
            .filter(node => node.ports?.["lyric"] && (!node.track.alternative || node.track === this.nameHost.track));
        if (targets.length === 0 || lyrics.length === 0) return preparedText;

        // 同一行、原始轨共用下沿，跨轨框外的占用可归属另一条轨
        type LyricBaseline = { bottom: number; owner: Track; rows: number[]; tiers: Map<number, PreparedLyricText[]> };
        const baselines = new Map<number, Map<Track, LyricBaseline>>();
        const append = (item: PreparedLyricText, baseline: LyricBaseline, row: number) => {
            preparedText.push(item);
            const tier = baseline.tiers.get(row) ?? [];
            tier.push(item);
            baseline.tiers.set(row, tier);
        };
        for (const target of targets) {
            let byTrack = baselines.get(target.layoutLine);
            if (!byTrack) baselines.set(target.layoutLine, byTrack = new Map());
            const baseline = byTrack.get(target.track) ?? { bottom: -Infinity, owner: target.track, rows: [], tiers: new Map() };
            const bounds = getLayoutBounds(target);
            let bottom = bounds.y + bounds.h;
            // Adjacent @voice scopes (notably replacement measures in one
            // ossia lane) share a musical baseline across the complete system.
            // Exclude zero-duration controls and other tracks from this envelope.
            if (!byTrack.has(target.track)) {
                for (const host of context.lines[target.layoutLine].trackRuns.get(target.track) ?? []) {
                    if (host.T.isZero() || !host.ports["lyric"]) continue;
                    const music = getLayoutBounds(host, true);
                    bottom = Math.max(bottom, music.y + music.h);
                }
            }
            if (context.uniformSystemHeight) {
                const reserved = context.getHostExtent(target.layoutLine, target.track);
                if (reserved) bottom = Math.max(bottom, context.getVisualAxis(target.layoutLine, target.track) + reserved.bottom);
            }
            let owner = target.track;
            for (const frame of this.frames) {
                const box = context.getAttachmentBox(frame);
                if (box.x + box.w < bounds.x || box.x > bounds.x + bounds.w || box.y + box.h <= bottom) continue;
                const regions = context.getAttachmentOccupancy(frame);
                if (!regions) throw new Error("Layout attachment dependency has not been measured");
                const tracks = regions.filter(region => region.line === target.layoutLine);
                if (regions.some(region => region.line !== undefined) && tracks.length === 0) continue;
                bottom = box.y + box.h;
                for (const region of tracks) {
                    if (region.line !== undefined && context.getVisualAxis(region.line, region.track)
                        > context.getVisualAxis(target.layoutLine, owner)) owner = region.track;
                }
            }
            if (bottom >= baseline.bottom) baseline.owner = owner;
            baseline.bottom = Math.max(baseline.bottom, bottom);
            byTrack.set(target.track, baseline);
        }

        // Empty placeholders keep their original row metadata for playback, but
        // only visible rows contribute height on this system and track.
        for (const [line, byTrack] of baselines) for (const [track, baseline] of byTrack) {
            baseline.rows = lyrics.flatMap((lyric, row) => !this.nameHost.ast.compactLyrics
                || (line === this.nameHost.layoutLine && track === this.nameHost.track && visibleLyricText(lyric.name))
                || targets.some((target, i) => target.layoutLine === line && target.track === track && visibleLyricText(lyric.tokens[i] ?? ''))
                ? [row] : []);
        }

        const fontSize = size * LYRIC_SIZE_RATIO;
        const rowGap = size * 0.24;
        const firstRowGap = size * 0.32;
        const lyricStyle: TextStyle = { fontSize, fontFamily: this.nameHost.ast.font, fill: "#000" };
        const nameStyle = lyricNameStyle(size, this.nameHost.ast.font);
        // Absent verse slots at a different ending must not reserve a blank row.
        // Zero-width placeholders still belong to their verse and keep alignment.
        const rowAtSlot = (rows: number[], row: number, slot: number) => Math.max(0,
            (this.nameHost.ast.compactLyrics ? rows.filter(index => Boolean(lyrics[index].tokens[slot])) : rows).indexOf(row));
        // 歌词行名称与声部名共用左侧那一列，因此只出现在声部名所在的那一行
        const { box: labelBox, layoutLine: labelLine, track: labelTrack } = this.nameHost;
        const labelBaseline = baselines.get(labelLine)?.get(labelTrack);

        for (let row = 0; row < lyrics.length; row++) {
            const lyric = lyrics[row];

            for (let i = 0; i < lyric.tokens.length && i < targets.length; i++) {
                const text = lyric.tokens[i];
                const target = targets[i];
                const baseline = baselines.get(target.layoutLine)?.get(target.track);
                if (!text || !baseline) continue;

                const underlined = this.nameHost.ast.underlinedLyricSlots.has(`${row}:${i}`);
                const annotation = this.nameHost.ast.lyricPrefixes.get(`${row}:${i}`);
                const fragment = measureLyricFragment(text, annotation, underlined, lyricStyle, context.textMeasurer);
                const addPiece = (piece: LyricPiece, role: 'lyric' | 'lyric-prefix') => {
                    // Semantic metadata does not change style equality or upstream recordings.
                    const style = Object.defineProperty({ ...lyricStyle }, 'semantic', {
                        value: { role, sourceSpan: target.ast.sourceSpan, row, ...(role === 'lyric' && underlined ? { underlined: true } : {}) }, enumerable: false,
                    });
                    append({
                        text: piece.text,
                        style,
                        textOffsetX: piece.origin - piece.left,
                        textBaselineY: -piece.top,
                        x: target.box.x + target.ports["lyric"].x + piece.left,
                        y: piece.top,
                        w: piece.right - piece.left,
                        h: piece.bottom - piece.top,
                        ...(piece.underline ? { underline: {
                            left: piece.underline.left - piece.left,
                            right: piece.underline.right - piece.left,
                            y: piece.underline.y - piece.top,
                            stroke: piece.underline.stroke,
                        } } : {}),
                        line: target.layoutLine,
                        track: baseline.owner,
                    }, baseline, rowAtSlot(baseline.rows, row, i));
                };
                addPiece(fragment.lyric, 'lyric');
                if (fragment.label) addPiece(fragment.label, 'lyric-prefix');
            }

            if (!lyric.name || !labelBox || !labelBaseline) continue;

            const metrics = context.textMeasurer.measureText(lyric.name, nameStyle);
            append({
                text: lyric.name,
                style: nameStyle,
                textBaselineY: metrics.baseline,
                x: labelBox.x + labelBox.anchor - metrics.w,
                y: -metrics.baseline,
                w: metrics.w,
                h: metrics.h,
                line: labelLine,
                track: labelBaseline.owner,
            }, labelBaseline, Math.max(0, labelBaseline.rows.indexOf(row)));
        }
        // One baseline per visual tier, sized by the union of its actual ink.
        // M supplies a row only for explicit placeholders; it never locates
        // visible Chinese, descenders, row names or visit prefixes.
        for (const [line, byTrack] of baselines) {
            const ownerBottoms = new Map<Track, number>();
            const ordered = [...byTrack].sort(([left], [right]) =>
                context.getVisualAxis(line, left) - context.getVisualAxis(line, right));
            for (const [, baseline] of ordered) {
                const previous = this.frames.length ? ownerBottoms.get(baseline.owner) : undefined;
                let bottom = Math.max(baseline.bottom, previous ?? -Infinity);
                const count = baseline.tiers.size ? Math.max(...baseline.tiers.keys()) + 1 : 0;
                for (let tier = 0; tier < count; tier++) {
                    const items = baseline.tiers.get(tier) ?? [];
                    const visible = items.filter(item => visibleLyricText(item.text));
                    const fallback = visible.length ? undefined : context.textMeasurer.measureText("M", lyricStyle);
                    const top = fallback ? -fallback.baseline : Math.min(...visible.map(item => item.y));
                    const lower = fallback ? fallback.h - fallback.baseline : Math.max(...visible.map(item => item.y + item.h));
                    const y = bottom + (tier || previous !== undefined ? rowGap : firstRowGap) - top;
                    for (const item of items) item.y += y;
                    bottom = y + lower;
                }
                if (count) ownerBottoms.set(baseline.owner, bottom);
            }
        }
        return preparedText;
    }
}
