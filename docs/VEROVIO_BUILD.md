# Verovio 精简构建

M3N 的 Verovio 输入只有 MEI，用于五线谱 SVG、MIDI 和播放时间映射。简谱显示继续独立于 Verovio，只有五线谱显示或播放需要时才加载引擎。

## 版本与裁剪范围

- 上游：`rism-digital/verovio`，6.2.0，commit `43f806031bfff2c64003fc8ddd9910820445f6ab`。
- 工具链：Emscripten **4.0.20**；本次使用 CMake **3.31.6**、GNU Make 和 Node.js。
- 产物：`packages/score-renderer/vendor/verovio/verovio-module.mjs` 与相邻的 `verovio-module.wasm`；`build.json` 保存源码、两个产物的 SHA-256、工具链版本和裁剪清单。
- 保留 **Leipzig** 音乐字体的全部字形、CSS 和度量，以及 `data/text` 中全部 Times 正体、粗体、斜体度量。应用将默认与回退音乐字体都固定为 Leipzig，不按内置曲库裁剪字形。
- 保留初始化所需的 **`Bravura.xml`** 完整符号名称映射和度量，移除未使用的 **`Bravura/` 字形目录与 `Bravura.css`**。M3N 没有音乐字体切换入口，生成的 MEI 也不指定 Bravura；精简引擎只支持 Leipzig，不能直接用于要求 Bravura 字形的 MEI 或自定义选项。
- 排除 **Gootville、Leland、Petaluma** 的全部资源，以及从未启用的 **Liberation.css**。`fontTextLiberation` 默认是 `false`，M3N 不提供开启该选项的入口；Times 及中文浏览器字体回退保持原有行为。
- 通过上游 CMake 选项关闭 DARMS、PAE、ABC、GABC、MXL、Humdrum。DARMS 原本就默认关闭，npm 普通 WASM 版本也已关闭 Humdrum；收益来自其余新增裁剪。
- 关闭 **MusicXML 和 Verovio 内部编辑器**。`public/licenses/verovio/mei-only.patch` 补全 6.2.0 的编译保护；将 MEI custom tuning 共用的变音记号转换函数原样移到 MusicXML 保护范围之外；关闭内部编辑器后不再创建 editor toolkit。M3N 自己的源码编辑器不依赖 Verovio 的编辑协议。
- WASM 导出限制为应用实际调用的 10 个方法、6 个诊断/验证方法和 2 个日志函数，完整名单记录在 `build.json`。MusicXML/ZIP 导入、PAE/MEI 导出、内部编辑与其他未调用接口不再成为链接入口。
- C++ 使用 **`-Os`**，链接使用 **`-Oz`**，同时启用 **`-flto`**，以跨文件优化清除未使用代码。

SVG、MEI 输入、MIDI、分页和播放时间查询均保留。应用与 renderer 测试直接导入同一份精简模块；`verovio/esm` 包装器仍使用精确固定的 npm `verovio@6.2.0`，以免二进制和包装器版本漂移；只调用裁剪清单内保留的方法。完整 npm WASM 仅供验证工具作基准，不进入应用构建。

WASM 改为独立二进制，通过模块中的 `new URL('verovio-module.wasm', import.meta.url)` 引用。Vite 会生成带内容哈希的本站 `/assets/*.wasm` URL；Node 验证工具读取模块旁的同一文件。浏览器首次使用五线谱或播放时按需下载一次，随后复用已初始化模块；纯简谱显示不加载 JS 引擎或 WASM。没有 CDN 请求。

## 重建

正常 `npm install`、`npm run build` 和 CI 使用已经提交的 JS 与 WASM，无需安装 C++ 工具链。只有调整裁剪或升级引擎时需要重建；分发 renderer 包时必须保留 vendor 目录下的两个文件。

1. 安装 CMake、GNU Make、patch、tar、Node.js。
2. 从 `https://github.com/emscripten-core/emsdk` 安装并激活固定版本：

   ```sh
   ./emsdk install 4.0.20
   ./emsdk activate 4.0.20
   source ./emsdk_env.sh
   ```

3. 在 M3N 仓库根目录执行：

   ```sh
   npm run build:verovio
   npm run test:verovio
   npm run check
   ```

`tools/build-verovio.mjs` 校验本地源码压缩包的 SHA-256，并拒绝其他 Emscripten 版本。中间文件放在忽略的 `.tmp/verovio-build/`；默认最多并行 6 个编译任务，可用 `VEROVIO_BUILD_JOBS=2 npm run build:verovio` 调低。重建时不需要下载 Verovio 源码。

构建时固定 `git_commit.h` 并替换 CMake 中读取 Git 版本的步骤，防止错误地记录外层 M3N 仓库版本，然后应用随附的 MusicXML/editor 编译保护补丁。链接阶段固定 `BINARYEN_CORES=1`，避免并行异常处理优化产生字节布局差异；本次重复重建的两个产物 SHA-256 均一致。`build.json` 同时记录补丁 SHA-256、导出清单与优化配置。保留上游 WASM exceptions、128MB 初始内存、64MB 栈及内存增长配置；未修改排版与播放算法。

LGPL 许可证、字体声明、完整原始源码压缩包、源码补丁和对应构建脚本随站点发布在 `/licenses/verovio/`，入口为 `README.txt`。这些文件仅供按需下载，不参与乐谱显示或播放的资源请求。生成脚本会同步该目录下的构建脚本副本。

## 验证与体积

`npm run test:verovio` 将精简引擎与原版 npm WASM 在相同参数、固定 XML ID seed 下对照：82 首内置曲目，加一份包含中英文、粗斜体和 SMuFL 文字符号的 MEI，均使用应用支持的 Leipzig。共 **83 组、98 页**，逐项验证完整 SVG、MIDI、timemap、音符起始时间和时刻对应元素完全一致。脚本同时核验两个产物、补丁 SHA-256 与 WASM 导出清单，并要求 JS 与 WASM **分别 gzip 后的合计大小**比原版模块至少下降 55%；报告输出在 `.tmp/verovio-verification.json`。

以下为 2026-10-16 的生产渲染资源，使用 Node `zlib` 的 gzip level 9 和 Brotli quality 11 测量；单位为字节。原版和上一轮只有 `verovio-score-*.js`，本轮为该 JS 与 `verovio-module-*.wasm` 分别压缩后的合计，不会遗漏拆出的下载量：

| 编码 | 原版 | 上一轮裁剪 | 本轮裁剪 | 本轮减少 |
| --- | ---: | ---: | ---: | ---: |
| 未压缩 | 7,912,481 | 4,483,158 | 3,037,213 | 32.3% |
| gzip | 2,340,553 | 1,246,887 | 986,525 | 20.9% |
| Brotli | 1,815,492 | 951,849 | 755,547 | 20.6% |

本轮 JS 为 56,255 字节（gzip 18,500 / Brotli 16,740），WASM 为 2,980,958 字节（gzip 968,025 / Brotli 738,807）。收益来自移除未使用的 Bravura 字形与 CSS，以及独立二进制避免内嵌 base64 的开销；Leipzig 仍保留全部字形，没有用曲库中恰好出现的字形集合限制用户新写的乐谱。

上一轮关闭未使用的 MusicXML/内部编辑器并启用跨文件优化时，本机将 82 首曲目热身后循环 3 轮，交替运行此前模块与两种新优化配置：`-Os` / `-Oz` 链接的曲库排版总耗时相差约 1%，MIDI/时间表耗时相差约 1%；未见明显性能退化。这是本机实验记录，不作为跨设备性能保证或 CI 时间门槛。本轮没有改变编译优化配置。

线上实际传输大小仍取决于服务器使用的编码。这里不把压缩算法差异计作裁剪收益；比较的每一行都使用相同编码参数。

`npm run check` 还覆盖 renderer 的真实 WASM 测试、680 组简谱布局检查和浏览器端五线谱显示、播放高亮、分页与导出。资源端到端测试阻断外站请求，并验证切换与播放时 JS 引擎、独立 WASM 各只加载一次，简谱独立显示时两者均不加载。
