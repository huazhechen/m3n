# FluidR3 单乐器体积实测

五种乐器从 Fluid R3 GM 提取。保留全部原始音区、采样率、声道布局、包络、循环点和力度范围；没有裁短、降采样或合并立体声。钢弦吉他原始采样为单声道，其余四种保留左右声道采样。

| 音色 | GM Program（从0开始） | 采样数 | PCM SF2（字节） | SF3 q1（字节） | SF3 q3（字节） |
| --- | ---: | ---: | ---: | ---: | ---: |
| 钢琴 | 0 | 40 | 7,810,638 | 769,220 | 991,770 |
| 口琴 | 22 | 16 | 543,082 | 100,886 | 115,474 |
| 钢弦吉他 | 25 | 10 | 2,108,686 | 166,878 | 202,778 |
| 小提琴 | 40 | 28 | 3,051,860 | 341,548 | 430,126 |
| 长笛 | 73 | 18 | 1,278,890 | 162,746 | 192,850 |
| 合计 | | 112 | 14,793,156 | 1,541,278 | 1,932,998 |

q1/q3 是 libvorbis 的质量档位，编码器参数分别为0.1/0.3，均为有损压缩。以上为完整文件大小，未计算HTTP额外压缩或协议开销；十进制1 MB = 1,000,000字节。网页采用q3：五种总计约1.93 MB，按需加载时只需下载当前选择的乐器。默认合成音色仍可独立即时播放。

复现命令：

```sh
npm run download:fluidr3
node --import tsx tools/measure-fluidr3-tones.mts
```

也可指定已下载的原版PCM SF2路径与输出目录：

```sh
node --import tsx tools/measure-fluidr3-tones.mts /path/to/FluidR3_GM.sf2 .tmp/fluidr3-tones
```

要求Python 3与系统libsndfile（含Vorbis支持）。输入来源由 `tools/download-fluidr3-gm.mjs` 固定在[原始仓库提交](https://github.com/urish/cinto/blob/99e01e36cbede930215e01930f66d2b76ee97622/media/FluidR3%20GM.sf2)。本次为减少网络传输，按该文件原始采样索引下载所需PCM字节区间及元数据，提取范围覆盖五种乐器全部采样。

每种生成三份独立文件（`.sf2`、`.q1.sf3`、`.q3.sf3`），并输出 `sizes.json`。文件写入前逐个解码采样、检查数值及循环点，并使用真实SpessaSynth在C3/C4/C5各渲染约两秒，验证输出有限且有声音。15个文件全部通过；这验证可播放性，不代替主观音质试听。

网页已采用五种FluidR3 q3音源。测量文件位于忽略的 `.tmp/fluidr3-tones/`；运行 `node --import tsx tools/prepare-fluidr3-playback.mts` 将q3文件复制至 `packages/score-renderer/vendor/soundfonts/` 并把各预置映射为Program 0；该步骤验证压缩采样字节完全保留，不二次编码。五种合计1,932,998字节。默认合成音色继续使用浏览器生成的原音色，不下载采样。来源与MIT许可证见 `public/licenses/fluidr3/`。
