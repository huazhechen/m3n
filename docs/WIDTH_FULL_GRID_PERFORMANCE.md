# 单线程全范围选宽与精确几何复用

2026-11-27，策略v44。彻底删除局部细搜实现、类型参数和基准开关，阅读器、本地与在线谱集的两种谱式均搜索528～720px的全部33个6px档，仅允许有证明的安全剪枝。先访问48px和24px粗档用于建立赢家，再补齐全网格；即使粗档全部失败也继续搜索。没有增加Worker或线程。

共享分页代价求解器与实际分页器复用显式声明为不可变的行块归一化几何、排序和碰撞索引，默认可变输入仍重新测量。五线谱去掉同一精确行块的重复复制。简谱复用已有核心边界缓存，简化小节号元数据复制并保留延迟SVG；数值转换仅在可证明与原`toFixed(6)`一致时走算术快路，半单位附近仍用原转换。没有粗化曲线、量化状态或裁剪可能获胜的候选。

## 测量

117首，真实归档TTF，字体摘要与谱源逐曲一致；每批一个新Chromium，批内共享字体及文字缓存，不预热、不启用profiler、不生成最终SVG。重任务串行，Node堆384MiB、浏览器堆256MiB、聚合RSS守卫1700MiB；两批全范围测量峰值分别为简谱1482MiB、五线谱1464MiB。五线谱使用主线`d7f5e7ec`的32px音乐字形规则，不能与旧28px报告直接作性能对照。

| 配置 | 累计选宽 | 基本功 | 超600ms |
|---|---:|---:|---:|
| 简谱原全范围基线 | 25.855秒 | 1470.1ms | 8 |
| 简谱本次全范围 | 24.790秒 | 1396.1ms | 7 |
| 五线谱原局部搜索，新32px规则 | 30.610秒 | 1258.7ms | 9 |
| 五线谱几何复用后局部搜索，仅历史对照 | 29.129秒 | 1233.7ms | 8 |
| 五线谱本次全范围 | 59.476秒 | 2523.9ms | 37 |

简谱117首赢家及共同候选字段保持一致（绝对误差1e-8）。五线谱从局部改为全范围后，6首选宽变化、页数全部不变、总代价全部降低；其余赢家不变。完整搜索的额外成本必须继续优化，600ms目标尚未达成。

| 曲目 | 宽度px | 页数 | 总代价 |
|---|---:|---:|---:|
| `scores/mozart_k545_01.m3n` | 720 → 690 | 2 → 2 | 5.321419 → 4.148133 |
| `scores/na_xie_nian_01.m3n` | 582 → 558 | 2 → 2 | 0.856582 → 0.848097 |
| `scores/over_the_rainbow_01.m3n` | 576 → 534 | 1 → 1 | 0.600976 → 0.574414 |
| `scores/second_waltz_01.m3n` | 660 → 594 | 1 → 1 | 2.761951 → 1.707174 |
| `scores/valsentino_01.m3n` | 672 → 642 | 2 → 2 | 4.314038 → 3.690723 |
| `scores/xia_yu_de_shi_hou_01.m3n` | 618 → 570 | 1 → 1 | 1.340224 → 0.830753 |

原始报告在优化工作树：`.tmp/edge-envelope/numbered.json`、`.tmp/full-grid-final/numbered.json`、主线`.tmp/single-worker-current/staff-before.json`、`.tmp/shared-page-geometry/staff.json`及`.tmp/full-grid-final/staff.json`。两个全范围报告和日志保留在工作树，未提交大体积中间几何。

验证包括共享分页与简谱107项、五线谱235项、阅读器20项、共享选宽48项，以及2项真实浏览器阅读器／本地／在线谱集一致性测试。新增回归覆盖全粗档失败但细档可行、五线谱更优断行位于粗搜赢家邻域之外、不可变缓存共享与可变输入隔离。

复现先构建包，再串行执行：

```sh
python3 tools/run-low-memory.py npm run build:packages
python3 tools/run-low-memory.py node tools/benchmark-numbered-spacing.mjs --numeric-layout --prune --output=.tmp/full-grid-final/numbered.json
python3 tools/run-low-memory.py node tools/benchmark-numbered-spacing.mjs --staff --prune --output=.tmp/full-grid-final/staff.json
```
