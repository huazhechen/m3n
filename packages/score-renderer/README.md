# @m3n/score-renderer

M3N 的简谱页面、SpessaSynth 播放、导出和多实例调度。只提供简谱显示；项目内演奏编译器和 MIDI 写入器作为按需加载的播放与时间映射后端。

```ts
import { PlaybackScore } from '@m3n/score-renderer/playback'
import { SpessaPlayer } from '@m3n/score-renderer/player'
```

轻量页面工具通过 `@m3n/score-renderer/view` 导入。显示和导出不会下载播放引擎。

```sh
npm run build -w @m3n/score-renderer
npm run test -w @m3n/score-renderer
```
