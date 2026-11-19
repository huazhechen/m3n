# 滑音平滑曲线与试听位置

网页“乐谱设置”中的“五次 Hermite（可调）”使用两个相对位置：前音起点、后音终点，各为 0、0.5、1。默认从前音音头到后音末尾；0.5 → 0.5 从前音中间到后音中间；1 → 0 在两音边界瞬时换音。谱面与歌词时钟不变。

区间内对 MIDI 半音音高插值，等价于对频率的对数插值，保持音程尺度一致。归一化时间 t 使用五次 Hermite（smootherstep）函数 `6t⁵ − 15t⁴ + 10t³`，精确到达两端，端点速度和加速度为零，单调且无超调。控制点按区间内最慢速度约每 2 毫秒采样，最少 32、最多 16384 段，再写为 MIDI 弯音事件；实际播放仍受 MIDI 时间与弯音量化、合成器处理粒度约束，并非逐音频采样点自动化。连续滑音共享中间音符时，重叠窗口在重叠段中点相接，避免时间倒退；终点采用后音书写时值，不包含其同音延音。

音频领域不存在适用于所有滑音的唯一最佳函数。本方案针对有限时间、精确端点、平滑进入与退出的音高控制轨迹。四点三次 Hermite 常用于音频样本重采样，与这里的控制曲线是不同层次；PCHIP 适合多个约束点的保形插值，但一般仅保证一阶连续。指数趋近适合参数追踪，有限时刻不保证精确到达目标。

仍由前音触发的采样或合成声音持续发声，通过弯音改变音高，不额外触发后音采样、不添加音量补偿。钢琴采样的衰减与共振频谱也随变调移动；曲线更平滑不保证钢琴音色的滑音自然。保留旧方案供实际试听比较。

参考资料（2026-11-19 查阅）：

- [JUCE SmoothedValue](https://docs.juce.com/master/classjuce_1_1SmoothedValue.html)：乘法平滑适用于频率等指数／对数量。
- [MusicDSP Hermite interpolation](https://www.musicdsp.org/en/latest/Other/93-hermite-interpollation.html)：音频样本的四点三次 Hermite 插值。
- [GPU Gems: Improved Perlin Noise](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-5-implementing-improved-perlin-noise)：五次函数及端点一、二阶导数性质；这是数学依据，非音频效果评测。
- [SciPy PCHIP](https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.PchipInterpolator.html)：单调、无超调、一阶连续的保形插值。
- [Web Audio setTargetAtTime](https://www.w3.org/TR/webaudio/#dom-audioparam-settargetattime)：指数趋近的参数自动化。
