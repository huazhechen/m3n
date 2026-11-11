# @m3n/score-renderer

M3N 的浏览器乐谱渲染包，封装 Verovio 排版、SpessaSynth 播放、导出和多实例调度。

```ts
import { SpessaPlayer, VerovioScore } from '@m3n/score-renderer'
```

该包依赖 `@m3n/notation`，并要求消费方提供 DOM 和支持 `?url` 资源导入的浏览器构建环境。

```sh
npm run build -w @m3n/score-renderer
npm run test -w @m3n/score-renderer
```
