# 720px自动选宽范围及性能

2026-11-27，在局部渐强几何下界修复之后，按要求将两种谱式的共享自动选宽上限由768px改为720px。24px粗档由11个变为9个，完整6px网格由41个变为33个。简谱仍完整搜索；五线谱保留此前生产使用的局部细搜。手动宽度范围不受影响。

字体代价继续绑定搜索范围：`4 * max(0, (width - 528) / 192)²`，720px为4，552px为0.0625。搜索策略版本v41用于隔离旧候选缓存。间距舒适区、均匀度和分页优先级保持原规则。

串行测量全部117首，两批各使用一个新Chromium158浏览器，读取归档TTF设计轮廓；批内共享字体与文字度量，每首新建排版任务。没有额外预热或profiler，启用生产安全剪枝，不计浏览器启动、打包、字体准备及最终SVG。环境为Intel i5-8400、WSL2 Linux。聚合RSS峰值1499MiB，低于2GB。

| 谱式 | 累计选宽 | 中位数 | 基本功／最慢 | 超过600ms |
|---|---:|---:|---:|---:|
| 简谱（完整6px搜索） | 30.638秒 | 138.4ms | 1560.6ms | 13/117 |
| 五线谱（生产局部细搜） | 33.882秒 | 194.2ms | 1443.1ms | 14/117 |

目标尚未达到。逐曲数据、源文件摘要及选宽见[CSV](WIDTH_SEARCH_720_PERFORMANCE.csv)；原始报告位于独立工作树`.tmp/range720/numbered.json`与`staff-local.json`。

限制范围使《枫》《快速圆舞曲》《星星点灯》的简谱由1页改为2页：原单页赢家分别为762、762、738px，均超出新上限。新赢家分别为558、546、552px。此变化来自已授权的范围调整，不作为性能优化的结果不变证明。《暗香》谱源来自另一任务刚完成的修改，因此不与旧源的选宽混作评分差异。

生成物和两份宽度基线同步到当前源及新范围。后续性能改动应对照本轮各候选的分页和评分，并继续采用不预热的全量验收，分别报告两种谱式，不能用单曲预热结果替代。

```sh
python3 tools/run-low-memory.py node tools/benchmark-numbered-spacing.mjs --numeric-layout --prune --output=.tmp/range720/numbered.json
python3 tools/run-low-memory.py node tools/benchmark-numbered-spacing.mjs --staff --prune --local-refine --output=.tmp/range720/staff-local.json
```
