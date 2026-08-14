# M3N — Max's Markup Music Notation

M3N 是一种面向旋律制谱的文本记谱语言。本仓库实现浏览器端的 M3N 编辑器：在线编写、阅读和导出五线谱，并在 `/docs` 提供 M3N 指南与手册。

## 仓库结构

| 目录 | 内容 |
| --- | --- |
| `packages/notation` | `@m3n/notation`：无平台依赖的语法、领域模型、诊断、格式化、分析和 MEI 转换。 |
| `packages/score-renderer` | `@m3n/score-renderer`：浏览器渲染、播放、导出与资源调度。 |
| `src` | React Web 应用、路由、曲库装载及分享服务。 |
| `worker` | Cloudflare Worker 部署入口，不依赖 Web UI。 |
| `docs` | 应用内用户文档与开发内部文档，见[文档索引](docs/README.md)。 |
| `tools` | 构建与辅助脚本。 |
| `tests` | 端到端测试（Playwright）。 |

包依赖方向保持 `src -> @m3n/score-renderer -> @m3n/notation`；`@m3n/notation` 不依赖 React、DOM 或渲染器。详细约定见[前端架构](docs/ARCHITECTURE.md)与[代码图谱](docs/CODEGRAPH.md)。

## 开发

```sh
npm install
npm run dev      # 启动本地开发服务器
npm run check    # lint、类型检查、单元测试、构建与端到端测试
npm run deploy   # 构建并部署到 Cloudflare
```

常用脚本：`npm run build`、`npm run test`、`npm run test:e2e`、`npm run lint`、`npm run typecheck:packages`。

## 文档

- 应用内文档由 `docs/HOME.md`、`docs/GUIDE.md`、`docs/MANUAL.md` 组成，面向 M3N 用户，在 `/docs` 页面展示。
- 开发内部文档包括 [ARCHITECTURE.md](docs/ARCHITECTURE.md)、[CODEGRAPH.md](docs/CODEGRAPH.md) 与 [VEROVIO.md](docs/VEROVIO.md)。
