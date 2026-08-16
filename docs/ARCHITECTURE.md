# M3N 前端架构

## 目标

本项目的核心资产不是页面，而是 M3N 语法、转换正确性和乐谱交互。架构以纯领域逻辑为中心，React 页面只负责组合功能和管理界面状态。

依赖方向必须保持单向：

```text
web app -> @m3n/score-renderer -> @m3n/notation
       \-> @m3n/notation
       \-> React / routing / application services
```

`@m3n/notation` 不得依赖 React、DOM、具体页面或 `@m3n/score-renderer`。转换函数应保持确定性：相同输入总是产生相同输出与诊断。
同一编辑操作的派生计算应复用已解析的领域文档，避免各模块重新扫描相同源码。

领域层明确使用两个模型：

- `M3NSyntaxTree` 是无损且可容错的语法模型，保留原始行、token 与绝对源码范围，服务格式化、诊断和编辑器定位。
- `ScoreDocument` 是规范化音乐语义模型，不承载排版空白等文本细节，服务校验、复杂度分析、播放计划与 MEI 序列化。

交互调用方通过 `analyzeM3N` 建立一次分析会话并消费其派生结果，不应在同一次编辑更新中自行重复解析。

## Workspace 边界

- `packages/notation`（`@m3n/notation`）：无平台依赖的语法、领域模型、诊断、格式化、分析和 MEI 转换；可独立生成 JavaScript 与类型声明。
- `packages/score-renderer`（`@m3n/score-renderer`）：浏览器渲染、播放、导出与资源调度；只通过 `@m3n/notation` 的公共入口访问领域类型。
- `src`：React Web 应用、路由、曲库装载及分享服务；通过包名消费两个子包，不跨入其内部目录。
- `worker`：部署边缘入口，不依赖 Web UI。

包依赖只能是 `score-renderer -> notation`。根应用可以组合二者，但子包不得反向导入根应用。每个包在自身 `package.json` 中声明运行依赖，并提供独立的 `build`、`test`、`typecheck` 命令；根脚本显式按依赖顺序执行。

## 内部职责

- `packages/notation/src/notation/syntax-tree.ts`：无损容错语法树、行节点与源码范围。
- `packages/notation/src/notation/syntax-rules.ts`：直接消费 directive AST 节点的区间闭合与指令值规则。
- `packages/notation/src/notation/score-document.ts`：规范化乐谱、声部、小节、事件、歌词和演奏区间契约。
- `packages/notation/src/notation/analysis.ts`：交互调用方的统一分析入口。
- `packages/notation/src/notation/diagnostics.ts`：结构化诊断契约；规则在产生诊断的位置直接提供稳定 code、严重级别和源码范围，不保留字符串诊断模式。
- `packages/notation/src/notation/m3n-primitives.ts`：调号、音符和时值等最小语法内核。
- `packages/notation/src/notation/repeats.ts`：反复次数、跳房子及 D.S./D.C. 的纯播放计划；Direct、MEI 和歌词对位共享其语义。
- `packages/notation/src/notation/score-rules.ts`：只消费 `ScoreDocument` 的音乐语义规则；负责小节时值、延音目标和双谱表对齐。
- `packages/notation/src/m3n-direct.ts`：从源码构造 `ScoreDocument`；领域消费者统一使用 `Score*` 类型，不再暴露旧 `Direct*` 类型。
- `packages/notation/src/m3n-lyric-alignment.ts`：以已解析文档为输入的书写小节歌词目标和强制延音目标语义，供格式化与校验共享。
- `packages/notation/src/m3n-validate.ts`：语义校验，只依赖最小语法内核。
- `packages/score-renderer/src`：播放段落展开、导出文档与 Verovio 画布适配。
- `packages/numbered-notation/src`：`ScoreDocument` 到简谱 SVG 的原生排版与页面适配。
- `packages/notation/src/m3n-mei.ts`：M3N 到 MEI 中间文档、稳定 `xml:id` 与源码映射。
- `packages/notation/src/notation/mei-xml.ts`：MEI XML 转义与时值属性序列化。
- `packages/notation/src/notation/mei-lyrics.ts`：歌词、下划线、CJK 补偿和 verse 序列化。
- `packages/notation/src/notation/mei-document.ts`：通过 XML builder 组装 MEI 文档头、责任者元数据、`scoreDef` 和 section，统一处理文本转义与文档序列化。
- `packages/notation/src/notation/mei-layout.ts`：MEI section、ending 和 expansion 布局序列化。
- `packages/score-renderer/src/verovio-score.ts`：Verovio SVG 排版、MIDI 生成和时间映射。
- `packages/score-renderer/src/spessa-player.ts`：SpessaSynth 播放与 zPiano-SF3 音色加载。
- `packages/score-renderer/src/render-scheduler.ts`：串行调度 Verovio WASM 排版任务。
- `packages/score-renderer/src/playback-coordinator.ts`：显式管理多个乐谱实例间的播放互斥。
- `components/ScoreRenderer.tsx`：组合 MEI 渲染、播放和光标事件。
- `components/ScoreExportDialog.tsx`：导出状态、预览及 PNG/PDF 工作流。
- `components/SourceEditor.tsx`：源码输入与尺寸同步。
- `pages`：路由级组合，不承载领域算法。
- `scores/*.m3n`：曲库正文的唯一来源；`lib/samples.ts` 在构建时直接读取正文并生成曲目元数据。

## 质量门禁

提交前执行 `npm run check`，依次完成 lint、各包严格类型检查、包级与应用级测试、生产构建和端到端测试。测试分三层：

1. 基础语法单元测试，覆盖音符、时值、调号和行式歌词、低音对位。
2. 转换契约测试，覆盖往返、诊断和源码映射。
3. 全量内置乐谱语料测试，防止真实乐谱在重构后无法转换。

已修复的回归必须先有失败测试。第三方库细节应封装在 feature 或 component 边界，不得渗入 notation 内核。

## 后续演进

按以下顺序继续，且每一步保持公共转换 API 兼容：

1. `analyzeM3N` 在同一会话中构造语法树、结构投影和 `ScoreDocument`，派生消费者复用该上下文。
2. `notation/repeats` 通过单一播放计划同时提供演奏顺序和节点轮次。
3. 文档结构和区间指令规则消费 `M3NSyntaxTree`，节拍、延音和双谱表规则消费 `ScoreDocument`；源码规则直接消费原文 token，诊断内部统一为 `ScoreDiagnostic[]`。
4. 诊断只使用 `{ code, severity, message, messageArgs, range }`；UI 优先按稳定 code 和参数本地化，并以 `message` 作为未本地化 code 的显示回退。
5. `typecheck:notation` 已对语法内核、文档结构和 `ScoreDocument` builder 启用 `noUncheckedIndexedAccess`；扩大范围时必须消除真实风险，不使用无依据的非空断言。
7. Playwright 已覆盖真实浏览器编辑重排、播放/暂停、导出和源码双向定位；继续扩展键盘可访问性及多实例资源销毁场景。

不建议为缩短文件而制造一行转发层；拆分应围绕稳定职责、可独立测试的状态机或第三方适配边界进行。
