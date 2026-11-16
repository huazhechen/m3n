import { DEFAULT_TONALITY, TemporalNodeBase, type TimeState } from "../temporal.js";
import { ASTFunctionClass, ASTFunctionNode, ASTNodeBase, FunctionArgs, LengthValue, ParserContext, SourceSpan } from "../ASTtypes.js";
import { Diagnostic, ErrorDiagnostic, WarningDiagnostic } from "../../diagnostic.js";
import { parseNoteName } from "../note/noteNameFSM.js";
import { acc2Offset, NoteNameMap, tonality2Midi } from "../../parser/parse-utils/note-utils.js";
import { paintAccidental, placeAccidentals, type PlacedAccidental } from "../note/accidentals.js";
import type { LayoutBox, LayoutPrepareContext } from "../../layout/types.js";
import type { Painter, TextStyle } from "../../render/types.js";

/**
 * 把宽松的调性写法收敛成 tonality2Midi 认得的 [音名][最多一个 #b][绝对八度]
 *
 * 本来就合法就原样返回，彻底读不懂返回 null
 * `C###` 这种超过一个变音记号的写法按实际音高换字母（→ D#4），落在黑键上则跟随原来的升降方向拼写
 */
function normalizeTonality(tonality: string): string | null {
    try {
        tonality2Midi(tonality, 4);
        return tonality;
    } catch { /* 落到下面归一化 */ }

    const parsed = parseNoteName(tonality.replace(/^[a-g]/, letter => letter.toUpperCase()));
    if (parsed instanceof Diagnostic || parsed.next !== tonality.length) return null;
    const pitchClass = NoteNameMap[parsed.name];
    if (pitchClass === undefined) return null;

    const offset = acc2Offset(parsed.acc ?? "", false);
    const octave = parsed.absOctave ? parsed.octave ?? 4 : 4 + (parsed.octave ?? 0);
    const midi = (octave + 1) * 12 + pitchClass + offset;
    // NoteNameMap 里同一音高的升号拼写在前、降号在后，正好用来挑方向；数字音名不参与拼写
    const spellings = Object.keys(NoteNameMap).filter(name =>
        NoteNameMap[name] === ((midi % 12) + 12) % 12 && /^[A-G]/.test(name));
    return (offset < 0 ? spellings.at(-1)! : spellings[0]) + (Math.floor(midi / 12) - 1);
}


type KeyDisplay = { prefix: string; displayName: string; displayAcc: string };

function keyDisplay(tonality: string, degree: number, label = ""): KeyDisplay {
    let displayName = tonality[0];
    let displayAcc = tonality[1] === "#" || tonality[1] === "b" ? tonality[1] : "";
    if (degree === 6) {
        const letters = "CDEFGAB", naturals = [0, 2, 4, 5, 7, 9, 11];
        const written = /^([A-G])([#b]*)(?:-?\d+)?$/.exec(tonality);
        const index = letters.indexOf(written?.[1] ?? displayName), target = (index + 5) % 7;
        const offset = (naturals[index] + acc2Offset(written?.[2] ?? displayAcc, false) + 9 - naturals[target] + 12) % 12;
        displayName = letters[target];
        displayAcc = offset <= 2 ? "#".repeat(offset) : "b".repeat(12 - offset);
    }
    return { prefix: `${label ? label + ". " : ""}${degree}=`, displayName, displayAcc };
}

class KeyFunction extends ASTFunctionNode {
    static override def = {
        name: ["key", "1"],
        description: "设置时间线上的 1= 调性基准",
        details: `\
~~~jpfun
1 ^ @key(F#3)
~~~
调性沿时间线影响后续数字音名。谱面记号显示音名与升降号，省略八度；通常用 \`^\` 叠在音符上方。`,
        allowExtraArgs: false,
        args: [
            {
                name: "tonality",
                description: "`1=` 的音高基准，如 `C4`、`F#3`",
                type: "string" as const,
                default: null,
            },
            {
                name: "size",
                description: "调性记号字号",
                type: "length" as const,
                default: {
                    value: 1,
                    unit: "em",
                } as LengthValue,
            },
            { name: "degree", description: "谱面主音唱名（1 或 6），不改变 1 的音高基准", type: "number" as const, default: 1 },
            { name: "visits", description: "各遍调号组成一个居中的多行块，例如 1:C4;2:Db4", type: "string" as const, default: "" },
        ],
    };

    tonality: string;
    size: number;
    readonly font: string;
    /** 只用于绘制：音名与升降号，八度不上谱 */
    readonly displayName: string;
    readonly displayAcc: string;
    readonly prefix: string;
    readonly rows: KeyDisplay[];
    readonly visits: string;

    constructor(sourceSpan: SourceSpan, args: FunctionArgs, ctx: ParserContext, parent: ASTNodeBase | null = null) {
        super(sourceSpan, parent);
        const [tonality, size, degree, visits] = this.getArgValue(args, ctx) as [string, LengthValue, number, string];
        if (degree !== 1 && degree !== 6) throw new ErrorDiagnostic("E_KEY_DEGREE", "@key 的 degree 必须为 1 或 6", sourceSpan);
        this.prefix = `${degree}=`;
        this.font = ctx.variables.numberfont;
        this.tonality = tonality;
        this.size = ctx.length2px(size);

        const normalized = normalizeTonality(tonality);
        if (normalized !== tonality) {
            if (ctx.variables.strict) throw new ErrorDiagnostic(
                "E_KEY_TONALITY",
                `@key 无法解析调性 "${tonality}"`,
                sourceSpan
            );
            this.tonality = normalized ?? DEFAULT_TONALITY;
            ctx.diagnostics.push(new WarningDiagnostic(
                "W_KEY_TONALITY",
                `@key 的调性 "${tonality}" 不是规范写法，已自动切换到 ${this.tonality}`,
                sourceSpan,
            ));
        }
        const display = keyDisplay(degree === 6 ? tonality : this.tonality, degree);
        this.displayName = display.displayName;
        this.displayAcc = display.displayAcc;
        this.rows = visits ? visits.split(";").map(row => {
            const match = /^([\d,–-]+):(.+)$/.exec(row);
            if (!match || !normalizeTonality(match[2])) throw new ErrorDiagnostic("E_KEY_VISITS", "@key 的 visits 须为 遍次:调性，以分号分隔", sourceSpan);
            return keyDisplay(match[2], degree, match[1]);
        }) : [display];
        this.visits = visits;
    }

    override loweringEnter() {
        return [new KeyTemporalNode(this)];
    }

    override toString() {
        return `@1(${this.tonality}${this.prefix === '6=' ? ',degree=6' : ''}${this.visits ? `,visits=${JSON.stringify(this.visits)}` : ''})`;
    }
}

export const KeyNode: ASTFunctionClass = KeyFunction;

class KeyTemporalNode extends TemporalNodeBase {
    declare ast: KeyFunction;
    declare box: LayoutBox;

    private rows: Array<{ display: KeyDisplay; accidentals: PlacedAccidental[]; nameX: number; baseline: number; x: number; y: number; width: number; height: number }> = [];

    /** 字号在解析时已经固化，样式随之不再变 */
    private readonly style: TextStyle;

    constructor(ast: KeyFunction) {
        super();
        this.ast = ast;
        this.style = {
            fontSize: ast.size,
            fontFamily: ast.font,
            fill: "#000",
        };
        this.initLayoutBox();
    }

    override onTimeState(state: TimeState) {
        state.keySignature = this.ast.tonality;
    }

    override prepareLayout(context: LayoutPrepareContext) {
        const size = this.ast.size;
        this.rows = this.ast.rows.map(display => {
            const prefix = context.textMeasurer.measureText(display.prefix, this.style);
            const name = context.textMeasurer.measureText(display.displayName, this.style);
            const { placed, right, top } = placeAccidentals(display.displayAcc, size, prefix.w, prefix.baseline, size * 0.02);
            const shift = -top;
            for (const accidental of placed) accidental.y += shift;
            return { display, accidentals: placed, nameX: right, baseline: shift + prefix.baseline,
                x: 0, y: 0, width: right + name.w, height: shift + Math.max(prefix.h, name.h) };
        });
        this.box.w = Math.max(...this.rows.map(row => row.width));
        let y = 0;
        for (const row of this.rows) {
            row.x = (this.box.w - row.width) / 2;
            row.y = y;
            y += row.height + size * 0.2;
        }
        this.box.h = y - size * 0.2;
        this.box.anchor = this.rows.length > 1 ? this.box.w / 2
            : context.textMeasurer.measureText(this.ast.prefix[0], this.style).w / 2;
        this.box.visualAxis = this.box.h / 2;
    }

    override paint(painter: Painter) {
        for (const row of this.rows) {
            const box = { ...this.box, x: this.box.x + row.x, y: this.box.y + row.y };
            painter.drawText(row.display.prefix, box.x, box.y + row.baseline, this.style);
            for (const placed of row.accidentals) paintAccidental(painter, placed, box, "#000");
            painter.drawText(row.display.displayName, box.x + row.nameX, box.y + row.baseline, this.style);
        }
    }
}
