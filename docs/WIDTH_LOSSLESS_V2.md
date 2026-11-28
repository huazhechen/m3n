# 最新主线的无损选宽基线

2026-11-28，从 `e784ea70` 创建独立工作树 `perf/lossless-width-v2`，旧工作树实验保留，不移植旧页数优先或替代断行搜索方案。

## 发现与切换

主线虽已改为三档软占比断行、固定断行后最大统一行距、间距／字号／增页总代价排名，阅读器仍传入旧的有损候选策略：跨宽度行几何代理、墨迹与宽度量化、跨档位复用和端点页数估计剪枝。精确复核赢家不能证明估计阶段没有遗漏更优候选。

本轮阅读器显式使用 `exactScoreWidthPolicy`；兼容导出 `optimizedScoreWidthPolicy` 也指向同一精确策略，生产基准因此与阅读器一致。同步策略上下文关闭所有诊断近似开关。所有实际访问宽度均用三档与完整几何，完整覆盖528～720px的6px网格，仅允许证明不能胜出的安全剪枝。精确搜索结果不再重复测量赢家。

这是将当前规则切回无损，不是恢复历史排名目标。历史12px偏差边界不再适用。未将尚无实测收益的旧实验带入新架构。

## 真实字体冷启动基线

每首新建浏览器，加载同一归档三字体，不额外预热，不启用profiler。计时包括完整选宽，不包括打包、浏览器启动、字体安装和最终SVG绘制。

| 谱式 | 曲目 | 累计选宽 | 超600ms | 最慢曲目 |
| --- | --- | --- | --- | --- |
| 简谱 | 117 | 59879.1ms | 37 | K545，2049.7ms |
| 五线谱 | 117 | 58763.1ms | 35 | 基本功，1910.5ms |

全库批次中的基本功简谱1925.7ms、606px／3页；五线谱1910.5ms、636px／3页。此前单独冷测分别2017.9ms和1989.1ms，不能把两次运行的波动当作优化收益。

报告位于 `.tmp/lossless-v2/base-{numbered,staff}.json`。运行命令：

```sh
python3 tools/run-low-memory.py node tools/benchmark-numbered-spacing.mjs --numeric-layout --prune --production-policy --external-fonts --minify --cold-each-score --output=.tmp/lossless-v2/base-numbered.json
python3 tools/run-low-memory.py node tools/benchmark-numbered-spacing.mjs --staff --prune --production-policy --external-fonts --minify --cold-each-score --output=.tmp/lossless-v2/base-staff.json
```

两批串行执行，聚合RSS峰值分别855MiB、879MiB，Node堆512MiB、单浏览器。当前600ms目标未达成。

## 验收与下一步

新增严格对照工具 `tools/compare-exact-width-selection.mjs`：同谱源／字体，赢家宽度、页数、行数不变，共同候选全部横向、纵向与字体评分差不超过1e-8。不允许用赢家相同代替候选一致，也不能用报告对照代替实际SVG／几何回归。

无损切换的构建、架构边界、lint、类型及生成物检查通过。离线266个文件2212项、工具91项及字体5项通过；修正新工作树的Python字体环境后，浏览器23项、双谱式密度与完整端到端检查通过，隔离构建通过。整合验证124.85秒，聚合RSS峰值1648MiB。基线报告可完整读取简谱与五线谱的赢家／候选字段。下一步评估共享统一行距探测的私有工作区复用：不改变24次二分、碰撞、浮点运算顺序与结果精度，只减少无需发布的坐标对象分配。实验未验收前不宣称收益。
