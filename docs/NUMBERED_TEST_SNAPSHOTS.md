# 简谱隔离测试的完整构建

`tools/test-numbered-snapshot.mjs`复制当前源码并依次构建jpFun、notation和numbered-notation，再运行指定测试或整包测试。音乐源码仍可继续编辑，结束清单记录与本轮输入的差异。

隔离副本不得包含`dist`、`node_modules`或`.tsbuildinfo`。2026-11-17发现旧工具会复制jpFun的TypeScript增量缓存；新目录中可能只输出部分声明文件，`core.d.ts`缺失时，TypeScript沿父目录解析到工作区旧版jpFun类型。修复编号流水线时，这一问题表现为隔离构建已成功，而numbered-notation仍报告新选项不存在。证据为`.tmp/numbered-tests/2026-11-17T16-56-14.575Z-2481317/`与`.tmp/number-wrap-type-resolution.log`。不能把旧轮的类型检查一概称为完全隔离；浏览器对照工具直接打包源码，不受此构建缓存问题影响。

现排除增量缓存并在每包成功构建后核实导出入口的JS和声明文件均存在，缺失即失败，不允许静默回读工作区入口。修后新目录三包完整构建、6文件31项通过，报告`.tmp/numbered-tests/2026-11-17T16-58-09.870Z-2484570/`，结束源码清单无变化。后续全包测试必须使用修后的工具重新运行；本次定向结果不替代历史整包测试的重新验证。
