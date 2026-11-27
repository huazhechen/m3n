# 简谱宽度缓存的生命周期

2026-11-27，独立工作树 `perf/single-worker-600`，基线 `76de0c01`。已合并主线 `a5a4c30b` 的6px五线谱谱间规则，不能将此次五线谱基线与旧7px规则直接比较。

简谱任务切换宽度时释放断行候选图和逐行节奏间距缓存。它们只服务当前宽度的档位与精确分页复核；跨宽度继续复用投影、文字度量、横向约束模板和最小跨度。完成的布局保留自己的几何与分页数据，回访旧宽度时重新构建该宽度的数据。搜索、评分与几何算法不变，没有增加线程或减少候选。

## 全量测量

117首，真实归档TTF，单个新Chromium、批内共享字体与文字度量，不预热、不采样、不生成最终SVG。各批串行运行，Node堆384MiB，浏览器堆256MiB，聚合RSS守卫1700MiB。

| 简谱 | 基线 | 释放旧宽度缓存 |
|---|---:|---:|
| 累计选宽 | 25.077秒 | 24.756秒 |
| 基本功 | 1450.7ms | 1402.8ms |
| 超600ms | 7/117 | 7/117 |
| 聚合RSS峰值 | 1494MiB | 1352MiB |

内存峰值降低142MiB。耗时单批降低约1.3%，不能据此声称稳定提速或每首都加速。逐曲数据见[CSV](WIDTH_CACHE_LIFETIME_PERFORMANCE.csv)。两批字体与谱源摘要相同；892组赢家／共同候选的宽度、页数、行数、物理间距和所有评分分量一致，绝对误差阈值1e-8。

简谱任务、数值行几何、双档与间距选择共4个测试文件38项通过。任务一致性回归增加数值模式，覆盖多次切换并回访旧宽度，以及修改已返回候选后与独立任务的SVG输出一致性。

本次同时建立6px规则下的五线谱基线：117首累计40.429秒，基本功1870.3ms、708px、2页，19首超600ms，聚合RSS峰值1444MiB。此处没有五线谱优化前后对照，不能把更改谱间规则带来的差异归功于性能优化。**全部234个选宽任务600ms的目标仍未达到。**

原始报告保存在工作树 `.tmp/cache-lifetime-baseline/{numbered,staff}.json` 和 `.tmp/cache-lifetime/numbered.json`。复现先构建包，再串行运行：

```sh
python3 tools/run-low-memory.py npm run build:packages
python3 tools/run-low-memory.py node tools/benchmark-numbered-spacing.mjs --numeric-layout --prune --output=.tmp/cache-lifetime/numbered.json
python3 tools/run-low-memory.py node tools/benchmark-numbered-spacing.mjs --staff --prune --output=.tmp/cache-lifetime/staff.json
```

上一轮分页最小位置复用、流式图元收集和贪心页数下界证书实验没有保留：前两项与复用已选分页的组合实测为简谱25.143→24.999秒、五线谱45.588→46.488秒，未显示稳定收益；贪心页数下界对基本功的66次查询没有一次能省去精确测量。该对照仍是7px规则，报告位于 `.tmp/pagination-reuse/`，不能与上表混用。
