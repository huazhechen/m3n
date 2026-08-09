# M3N Code Graph

本文从源码入口和静态 import 关系整理仓库的主要模块、依赖方向与运行时数据流。箭头表示调用或依赖方向；测试文件和构建产物未纳入图中。

## 仓库边界

```mermaid
flowchart LR
  browser[Browser]
  app["src<br/>React Web App"]
  renderer["@m3n/score-renderer<br/>render / playback / export"]
  notation["@m3n/notation<br/>syntax / domain / MEI"]
  scores["src/scores/*.m3n<br/>built-in score corpus"]
  docs["docs/*.md<br/>guide and manual"]
  worker["worker<br/>Cloudflare Worker"]
  kv["M3N_SCORES<br/>KV store"]
  assets["ASSETS<br/>static site"]

  browser --> app
  browser --> worker
  app --> notation
  app --> renderer
  renderer --> notation
  scores --> app
  docs --> app
  worker --> kv
  worker --> assets
```

允许的包依赖方向为 `src -> @m3n/score-renderer -> @m3n/notation`，同时 `src` 可以直接调用 `@m3n/notation`。`worker` 是独立部署入口，不依赖 React 或两个业务包。

## Web 应用

```mermaid
flowchart TD
  main["main.tsx"] --> app["App.tsx"]
  app --> home["HomePage"]
  app --> editorPage["EditorPage"]
  app --> scoresPage["ScoresPage"]
  app --> readerPage["ScoreReaderPage"]
  app --> docsPage["DocsPage"]

  editorPage --> notationEditor["NotationEditor"]
  notationEditor --> sourceEditor["SourceEditor"]
  notationEditor --> analyze["analyzeM3N / formatM3N"]
  notationEditor --> scoreRenderer["ScoreRenderer"]

  readerPage --> samples["lib/samples"]
  readerPage --> shared["lib/shared-scores"]
  readerPage --> analyze
  readerPage --> scoreRenderer
  readerPage --> exportDialog["ScoreExportDialog"]

  scoresPage --> samples
  samples --> corpus["scores/*.m3n"]

  docsPage --> markdownBook["MarkdownBook"]
  markdownBook --> docsNav["lib/docs-navigation"]
  markdownBook --> notationEditor
  docsPage --> markdown["docs/*.md"]

  scoreRenderer --> rendererPkg["@m3n/score-renderer"]
  exportDialog --> rendererPkg
  analyze --> notationPkg["@m3n/notation"]
  shared --> api["/api/scores"]
```

页面由 `App.tsx` 懒加载。编辑器和阅读页共享分析与渲染路径；曲库元数据在构建时由 `lib/samples.ts` 从 `.m3n` 正文生成。

## Notation 领域流水线

```mermaid
flowchart LR
  source["M3N source"]
  tokens["m3n-tokens"]
  syntax["syntax-tree<br/>lossless syntax"]
  projection["m3n-document<br/>structure projection"]
  direct["m3n-direct<br/>ScoreDocument builder"]
  score["ScoreDocument<br/>normalized semantics"]
  validation["m3n-validate"]
  syntaxRules["syntax-rules"]
  scoreRules["score-rules"]
  diagnostics["ScoreDiagnostic[]"]
  analysis["analyzeM3N"]
  complexity["melody complexity"]
  mei["m3n-mei"]
  meiParts["mei-events / mei-layout<br/>mei-document / mei-lyrics"]
  xml["MEI XML + source map"]
  format["m3n-format"]
  formatted["formatted M3N"]

  source --> tokens --> syntax --> projection --> direct --> score
  source --> analysis
  analysis --> syntax
  analysis --> projection
  analysis --> direct
  analysis --> validation
  analysis --> complexity
  analysis --> mei
  syntax --> syntaxRules --> diagnostics
  score --> scoreRules --> diagnostics
  score --> validation --> diagnostics
  score --> complexity
  score --> mei
  syntax --> mei
  mei --> meiParts --> xml
  source --> format
  syntax --> format
  projection --> format
  score --> format --> formatted
```

`M3NSyntaxTree` 保留原文和源码范围，供格式化、结构规则和定位使用；`ScoreDocument` 提供规范化音乐语义，供校验、复杂度计算、播放计划和 MEI 序列化使用。交互调用方以 `analyzeM3N` 为聚合入口，复用一次解析得到的派生结果。

## 渲染、播放与导出

```mermaid
flowchart LR
  mei["MEI XML"] --> verovio["VerovioScore"]
  scheduler["RenderScheduler"] --> verovio
  verovio --> svg["SVG score"]
  verovio --> midi["MIDI + time map"]
  midi --> player["SpessaPlayer"]
  soundfont["FluidR3 GM Piano SF3"] --> player
  coordinator["PlaybackCoordinator"] --> player
  player --> cursor["playback cursor events"]
  svg --> collisions["lyric collision / rendition"]
  collisions --> screen["ScoreRenderer"]
  cursor --> screen
  svg --> header["score-header-svg"]
  header --> exporter["score-export"]
  exporter --> png["PNG"]
  exporter --> pdf["PDF via jsPDF"]
```

Verovio WASM 的排版任务由 `RenderScheduler` 串行化；`PlaybackCoordinator` 保证多个乐谱实例之间播放互斥。导出路径复用渲染 SVG，并在输出前组合标题信息。

## 分享 API

```mermaid
sequenceDiagram
  participant UI as Editor / Reader
  participant Worker as worker/index.ts
  participant KV as M3N_SCORES
  participant Assets as ASSETS

  UI->>Worker: POST /api/scores or /api/scores/submissions
  Worker->>Worker: validate source and derive/validate id
  Worker->>KV: put score with TTL
  KV-->>Worker: stored
  Worker-->>UI: 201 { id }

  UI->>Worker: GET /api/scores/:id
  Worker->>KV: get score:id
  KV-->>Worker: shared score
  Worker-->>UI: source and createdAt

  Note over Worker,Assets: Other requests are forwarded to static assets
```

临时分享 ID 来自源码 SHA-256 的前 6 字节并保留 7 天；投稿 ID 由前端生成并经 Worker 校验，保留 15 天。

## 公共入口

| 边界 | 公共入口 | 主要消费者 |
| --- | --- | --- |
| Notation | `packages/notation/src/index.ts` | Web 应用、score-renderer、工具脚本与测试 |
| Score renderer | `packages/score-renderer/src/index.ts` | `ScoreRenderer`、`ScoreExportDialog` |
| Web app | `src/main.tsx`、`src/App.tsx` | 浏览器路由与页面 |
| Worker | `worker/index.ts` | Cloudflare Workers runtime |

更新模块边界、公共入口或关键数据流时，应同步更新本图和 [架构文档](ARCHITECTURE.md)。
