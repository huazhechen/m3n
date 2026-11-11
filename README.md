# M3N — Max's Markup Music Notation

M3N 是一种面向旋律制谱的文本记谱语言。本仓库实现浏览器端的 M3N 编辑器：在线编写、阅读、试听和导出简谱与五线谱，并在 `/docs` 提供 M3N 指南与手册。

## 仓库结构

| 目录 | 内容 |
| --- | --- |
| `packages/notation` | `@m3n/notation`：无平台依赖的语法、领域模型、诊断、格式化、分析和 MEI 转换。 |
| `packages/score-renderer` | `@m3n/score-renderer`：五线谱（Verovio）的浏览器渲染、播放、导出与资源调度。 |
| `packages/numbered-notation` | `ScoreDocument` 到简谱引擎的语义与交互适配。 |
| `packages/jpfun` | 固定版本、保留补丁与许可记录的简谱排版核心。 |
| `src` | React Web 应用、路由、曲库装载及分享服务。 |
| `worker` | Cloudflare Worker 部署入口，不依赖 Web UI。 |
| `docs` | 应用内用户文档与开发内部文档，见[文档索引](docs/README.md)。 |
| `tools` | 构建与辅助脚本。 |
| `tests` | 端到端测试（Playwright）。 |

包依赖方向保持 `src -> score-renderer -> notation` 和 `src -> numbered-notation -> notation / jpfun`；`notation` 不依赖 React、DOM 或渲染器。详细约定见[前端架构](docs/ARCHITECTURE.md)与[代码图谱](docs/CODEGRAPH.md)。

## 开发

```sh
npm install
npm run dev      # 启动本地开发服务器
npm run check    # lint、类型检查、单元测试、构建与端到端测试
npm run deploy   # 构建并部署到 Cloudflare
```

编辑器提供语法高亮、补全、可定位诊断和后台分析；手机可切换源码／预览，桌面可调整分栏。阅读按容器宽度排版，打印版宽独立保存。两种谱式都可导出 SVG、PNG 和多页矢量 PDF；中文文字导出为轮廓，首次导出按需下载本站约 16 MB 字体。练习支持选中小节起播、A–B 循环、声部静音与播放跟随。

常用脚本：`npm run build`、`npm run test`、`npm run test:e2e`、`npm run lint`、`npm run typecheck:packages`、`npm run check:boundaries`。

### 本地乐谱与提交

- “保存并预览”把作品保存在此浏览器，编辑已有本地作品时更新原 ID；新保存的作品不自动过期，旧版临时记录仍按原期限清理。存储失败会保留输入并显示错误。
- 编辑器自动恢复和保存草稿；“导入”和“下载 M3N”支持文件备份与跨设备迁移。清除浏览器数据会删除本地作品和草稿。
- “临时分享”生成保留 15 天的链接。本地调试时默认模拟分享（写入 localStorage），需要请求真实接口时设置 `VITE_SUBMIT_MODE=remote`。
- 内置曲库元数据由 Vite 插件在构建时生成，正文按曲目异步加载，新增 `.m3n` 文件自动进入索引和语料测试。
- `npm run test:e2e` 会构建本地模拟分享版本并临时启动 `127.0.0.1:4173` 的生产预览；已有该地址服务时复用。测试不启动开发服务器。

## 文档

- 应用内文档由 `docs/HOME.md`、`docs/GUIDE.md`、`docs/MANUAL.md` 组成，面向 M3N 用户，在 `/docs` 页面展示。
- 开发内部文档包括 [ARCHITECTURE.md](docs/ARCHITECTURE.md)、[CODEGRAPH.md](docs/CODEGRAPH.md) 与 [VEROVIO.md](docs/VEROVIO.md)。
