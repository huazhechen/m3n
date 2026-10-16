# Verovio 精简构建

M3N 的 Verovio 输入只有 MEI，用于五线谱 SVG、MIDI 和播放时间映射。简谱显示继续独立于 Verovio，只有五线谱显示或播放需要时才加载引擎。

## 版本与裁剪范围

- 上游：`rism-digital/verovio`，6.2.0，commit `43f806031bfff2c64003fc8ddd9910820445f6ab`。
- 工具链：Emscripten **4.0.20**；本次使用 CMake **3.31.6**、GNU Make 和 Node.js。
- 产物：`packages/score-renderer/vendor/verovio/verovio-module.mjs`；`build.json` 保存源码与产物 SHA-256、工具链版本和裁剪清单。
- 保留 **Leipzig** 默认音乐字体、**Bravura** 必需的完整符号表与回退字体，以及 `data/text` 中全部 Times 正体、粗体、斜体度量。音乐字体的 CSS、全部字形和文字度量不做字符子集化。
- 排除 **Gootville、Leland、Petaluma** 的全部资源，以及从未启用的 **Liberation.css**。`fontTextLiberation` 默认是 `false`，M3N 不提供开启该选项的入口；Times 及中文浏览器字体回退保持原有行为。
- 通过上游 CMake 选项关闭 DARMS、PAE、ABC、GABC、MXL、Humdrum。DARMS 原本就默认关闭，npm 普通 WASM 版本也已关闭 Humdrum；收益来自其余新增裁剪。
- 关闭 **MusicXML 和 Verovio 内部编辑器**。`public/licenses/verovio/mei-only.patch` 补全 6.2.0 的编译保护；将 MEI custom tuning 共用的变音记号转换函数原样移到 MusicXML 保护范围之外；关闭内部编辑器后不再创建 editor toolkit。M3N 自己的源码编辑器不依赖 Verovio 的编辑协议。
- WASM 导出限制为应用实际调用的 10 个方法、6 个诊断/验证方法和 2 个日志函数，完整名单记录在 `build.json`。MusicXML/ZIP 导入、PAE/MEI 导出、内部编辑与其他未调用接口不再成为链接入口。
- C++ 使用 **`-Os`**，链接使用 **`-Oz`**，同时启用 **`-flto`**，以跨文件优化清除未使用代码。

SVG、MEI 输入、MIDI、分页和播放时间查询均保留。应用与 renderer 测试直接导入同一份精简模块；`verovio/esm` 包装器仍使用精确固定的 npm `verovio@6.2.0`，以免二进制和包装器版本漂移；只调用裁剪清单内保留的方法。完整 npm WASM 仅供验证工具作基准，不进入应用构建。

WASM 继续内嵌在模块中。体积下降来自实际移除嵌入资源和代码，没有把下载量转移到另一个 WASM 文件，也没有引入 CDN 请求。

## 重建

正常 `npm install`、`npm run build` 和 CI 使用已经提交的模块，无需安装 C++ 工具链。只有调整裁剪或升级引擎时需要重建。

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

构建时固定 `git_commit.h` 并替换 CMake 中读取 Git 版本的步骤，防止错误地记录外层 M3N 仓库版本，然后应用随附的 MusicXML/editor 编译保护补丁。`build.json` 同时记录补丁 SHA-256、导出清单与优化配置。保留上游 WASM exceptions、128MB 初始内存、64MB 栈及内存增长配置；未修改排版与播放算法。

LGPL 许可证、字体声明、完整原始源码压缩包、源码补丁和对应构建脚本随站点发布在 `/licenses/verovio/`，入口为 `README.txt`。这些文件仅供按需下载，不参与乐谱显示或播放的资源请求。生成脚本会同步该目录下的构建脚本副本。

## 验证与体积

`npm run test:verovio` 将精简引擎与原版 npm WASM 在相同参数、固定 XML ID seed 下对照：82 首内置曲目，加一份包含中英文、粗斜体和 SMuFL 文字符号的 MEI，分别使用 Leipzig 和 Bravura。共 **166 组、196 页**，逐项验证完整 SVG、MIDI、timemap、音符起始时间和时刻对应元素完全一致。脚本同时核验产物、补丁 SHA-256 与 WASM 导出清单，并要求模块 gzip 大小至少下降 40%；报告输出在 `.tmp/verovio-verification.json`。

以下为 2026-10-16 的生产 `verovio-score-*.js`，使用 Node `zlib` 的 gzip level 9 和 Brotli quality 11 测量；单位为字节。第二轮对照在同一应用代码下分别构建上一轮模块与本轮模块，避免把其他前端改动计入收益：

| 编码 | 原版 | 首轮裁剪 | 本轮裁剪 | 本轮减少 |
| --- | ---: | ---: | ---: | ---: |
| 未压缩 | 7,912,481 | 6,279,364 | 4,483,158 | 28.6% |
| gzip | 2,340,553 | 1,620,755 | 1,246,886 | 23.1% |
| Brotli | 1,815,492 | 1,182,641 | 951,849 | 19.5% |

单独减少 C API 导出仅节省约 15KB gzip，单独用 `-Oz` 重链接的收益也有限；主要新增收益来自关闭未使用的 MusicXML/内部编辑器和跨文件优化的组合。两套音乐字体仍保留全部字形，没有用曲库中恰好出现的字形集合限制用户新写的乐谱。

本机将 82 首曲目热身后循环 3 轮，交替运行上一轮模块与两种新优化配置：`-Os` / `-Oz` 链接的曲库排版总耗时相差约 1%，MIDI/时间表耗时相差约 1%；未见明显性能退化。这是本机实验记录，不作为跨设备性能保证或 CI 时间门槛。

线上实际传输大小仍取决于服务器使用的编码。这里不把压缩算法差异计作裁剪收益；比较的每一行都使用相同编码参数。

`npm run check` 还覆盖 renderer 的真实 WASM 测试、680 组简谱布局检查和浏览器端五线谱显示、播放高亮、分页与导出。资源端到端测试阻断外站请求，并验证切换时引擎仅加载一次、简谱独立显示时不加载 Verovio。
