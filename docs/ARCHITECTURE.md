# M3N 前端架构

## 目标

本项目的核心资产不是页面，而是 M3N 语法、转换正确性和乐谱交互。架构以纯领域逻辑为中心，React 页面只负责组合功能和管理界面状态。

依赖方向必须保持单向：

```text
pages -> components -> features -> lib/notation
                            \-> third-party adapters (Verovio, SpessaSynth, jsPDF)
```

`lib/notation` 不得依赖 React、DOM 或具体页面。转换函数应保持确定性：相同输入总是产生相同输出与诊断。
同一编辑操作的派生计算应复用已解析的领域文档，避免各模块重新扫描相同源码。

领域层明确使用两个模型：

- `M3NSyntaxTree` 是无损且可容错的语法模型，保留原始行、token 与绝对源码范围，服务格式化、诊断和编辑器定位。
- `ScoreDocument` 是规范化音乐语义模型，不承载排版空白等文本细节，服务校验、复杂度分析、播放计划与 MEI 序列化。

交互调用方通过 `analyzeM3N` 建立一次分析会话并消费其派生结果，不应在同一次编辑更新中自行重复解析。

## 当前边界

- `lib/notation/syntax-tree.ts`：无损容错语法树、行节点与源码范围。
- `lib/notation/score-document.ts`：规范化乐谱、声部、小节、事件、歌词和演奏区间契约。
- `lib/notation/analysis.ts`：交互调用方的统一分析入口。
- `lib/notation/types.ts`：转换结果和源码映射契约。
- `lib/notation/diagnostics.ts`：结构化诊断契约；迁移期间保留旧字符串诊断 API，以兼容现有调用方。
- `lib/notation/m3n-primitives.ts`：调号、音符和时值等最小语法内核。
- `lib/notation/repeats.ts`：反复次数、跳房子及 D.S./D.C. 的纯播放计划；Direct、MEI 和歌词对位共享其语义。
- `lib/m3n-direct.ts`：从源码构造 `ScoreDocument`；旧 `Direct*` 类型名称只作为迁移兼容别名保留。
- `lib/m3n-lyric-alignment.ts`：以已解析文档为输入的书写小节歌词目标和强制延音目标语义，供格式化与校验共享。
- `lib/m3n-validate.ts`：语义校验，只依赖最小语法内核。
- `features/score-renderer`：播放段落展开、导出文档与画布适配。
- `lib/m3n-mei.ts`：M3N 到 MEI 中间文档、稳定 `xml:id` 与源码映射。
- `features/score-renderer/verovio-score.ts`：Verovio SVG 排版、MIDI 生成和时间映射。
- `features/score-renderer/spessa-player.ts`：SpessaSynth 播放与 zPiano-SF3 音色加载。
- `features/score-renderer/render-scheduler.ts`：串行调度 Verovio WASM 排版任务。
- `features/score-renderer/playback-coordinator.ts`：显式管理多个乐谱实例间的播放互斥。
- `components/ScoreRenderer.tsx`：组合 MEI 渲染、播放和光标事件。
- `components/ScoreExportDialog.tsx`：导出状态、预览及 PNG/PDF 工作流。
- `components/SourceEditor.tsx`：源码输入与尺寸同步。
- `pages`：路由级组合，不承载领域算法。
- `scores/*.m3n`：曲库正文的唯一来源；`lib/samples.ts` 在构建时直接读取正文并生成曲目元数据。

## 质量门禁

提交前执行 `npm run check`，依次完成 lint、单元/语料测试、严格类型检查和生产构建。测试分三层：

1. 基础语法单元测试，覆盖音符、时值、调号和行式歌词、低音对位。
2. 转换契约测试，覆盖往返、诊断和源码映射。
3. 全量内置乐谱语料测试，防止真实乐谱在重构后无法转换。

已修复的回归必须先有失败测试。第三方库细节应封装在 feature 或 component 边界，不得渗入 notation 内核。

## 后续演进

按以下顺序继续，且每一步保持公共转换 API 兼容：

1. 以 `notation/repeats` 的播放计划为单一事实来源，逐步让歌词对位直接消费书写小节到演奏轮次的映射。
2. 继续扩充 M3N 直接解析器对出版语义和演奏语义的覆盖。
3. 逐条把旧校验状态机规则迁移为消费 `M3NSyntaxTree` 与 `ScoreDocument` 的语义规则；迁移期间字符串 API 仅作为兼容输出。
4. 诊断使用 `{ code, severity, message, range }`；当前已有稳定类别与行范围，后续规则直接从节点 span 产生精确范围。
5. `typecheck:notation` 已对新语法内核启用 `noUncheckedIndexedAccess`；扩大范围时必须消除真实风险，不使用无依据的非空断言。
7. 增加浏览器级编辑、播放、导出和键盘可访问性测试。

不建议为缩短文件而制造一行转发层；拆分应围绕稳定职责、可独立测试的状态机或第三方适配边界进行。
