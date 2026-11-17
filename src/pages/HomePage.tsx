import { lazy, Suspense, useMemo } from 'react'
import { analyzeM3N } from '@m3n/notation'
import { ScoreRenderer } from '../components/ScoreRenderer'
import { Link, useLocation } from 'react-router-dom'
import { NavActionIcon, TopNav } from '../components/TopNav'
import { ScoreControlIcon, type ScoreControlIconName } from '../components/ScoreControlIcon'
import homeExample from '../scores/huan_le_song_01.m3n?raw'

const HomeDocumentation = lazy(() => import('../components/HomeDocumentation').then(({ HomeDocumentation }) => ({ default: HomeDocumentation })))

function ControlHint({ icon, label, slider, musicalKey }: { icon?: ScoreControlIconName; label: string; slider?: boolean; musicalKey?: boolean }) {
  return <span className="home-control-hint">{icon && <ScoreControlIcon name={icon} />}{musicalKey && <b aria-hidden="true">C</b>}{label}{slider && <span className="home-slider-hint" aria-hidden="true" />}</span>
}

export function HomePage() {
  const analysis = useMemo(() => analyzeM3N(homeExample), [])
  const location = useLocation()
  const documentId = new URLSearchParams(location.search).get('doc')
  const isReading = documentId === 'guide' || documentId === 'manual'

  return (
    <main>
      <TopNav />
      {!isReading && <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Max&apos;s Markup Music Notation</span>
          <h1>让喜欢的旋律，<br />成为手边的乐谱。</h1>
          <p>
            找一首想唱的歌，换成适合自己的调，跟着节拍慢慢练。
            在 M3N，浏览曲库、看谱、播放、打印和在线写谱，都可以在浏览器里完成。
          </p>
          <div className="hero-actions">
            <Link to="/scores" className="primary-link">
              <NavActionIcon action="library" /> 浏览乐谱库
            </Link>
            <Link to="/editor" className="secondary-link">
              <NavActionIcon action="edit" /> 打开编辑器
            </Link>
          </div>
        </div>
      </section>}
      {isReading ? <Suspense fallback={<p role="status">正在加载...</p>}><HomeDocumentation /></Suspense> : <>
        <div className="home-features" aria-label="M3N 功能">
          <section className="home-feature" aria-labelledby="home-library">
            <div><span className="eyebrow">01 / 浏览曲库</span><h2 id="home-library">从一首喜欢的歌开始</h2></div>
            <div className="home-feature-copy">
              <p>想重温熟悉的旋律，还是挑一首新曲子练习？到曲库选一首，打开乐谱就能试听，也可以跟着练。</p>
              <Link to="/scores" className="home-text-link"><NavActionIcon action="library" /> 去曲库找一首 →</Link>
            </div>
          </section>
          <section className="home-feature" aria-labelledby="home-reading">
            <div><span className="eyebrow">02 / 看谱</span><h2 id="home-reading">让谱面合你的习惯</h2></div>
            <div className="home-feature-copy">
              <p>调不合适，可以换个调；习惯固定调，也能切换显示。打开小节号，排练时更方便找到同一句。</p>
              <ul className="home-feature-details">
                <li><strong>移调与固定调</strong>：打开 <ControlHint icon="settings" label="设置" /> → <ControlHint musicalKey label="调号" /> 选择调性，谱面与播放一起移调；用 <ControlHint icon="fixedDo" label="固定调" /> 切换数字的显示方式。</li>
                <li><strong>分页与页面宽度</strong>：在 <ControlHint icon="settings" label="设置" /> 中用 <ControlHint icon="paged" label="分页" /> 切换连续或分页阅读，拖动 <ControlHint slider label="宽度" /> 滑条，让每行乐谱疏密合宜。</li>
                <li><strong>小节号</strong>：打开 <ControlHint icon="settings" label="设置" /> → <ControlHint icon="measureNumbers" label="小节号" />，定位乐句、一起排练时就能对上位置。</li>
              </ul>
            </div>
          </section>
          <section className="home-feature" aria-labelledby="home-playback">
            <div><span className="eyebrow">03 / 播放</span><h2 id="home-playback">先听一遍，再跟上节拍</h2></div>
            <div className="home-feature-copy">
              <p>点 <ControlHint icon="play" label="播放" />，先听一遍旋律；节奏拿不准，打开 <ControlHint icon="metronome" label="节拍器" />，跟着节拍练习。</p>
              <p>打开 <ControlHint icon="settings" label="设置" />，用 <ControlHint icon="piano" label="钢琴" /> 切换音色，拖动 <ControlHint slider label="速度" /> 滑条，把不熟的乐句放慢练，熟悉后再恢复原速。</p>
            </div>
          </section>
          <section className="home-feature" aria-labelledby="home-print">
            <div><span className="eyebrow">04 / 打印与导出</span><h2 id="home-print">把调好的谱，带到谱架上</h2></div>
            <div className="home-feature-copy">
              <p>选好调、排好版，点击 <span className="home-control-hint"><NavActionIcon action="print" />打印</span> 打开预览，导出就沿用当前的移调、固定调、小节号、页面宽度与分页设置。</p>
              <p><strong>SVG</strong> 适合后续排版，<strong>PNG</strong> 方便作为图片分享，<strong>PDF</strong> 适合保存和打印。打印出来，排练时随手就能翻看。</p>
            </div>
          </section>
          <section className="home-feature" aria-labelledby="home-editing">
            <div><span className="eyebrow">05 / 在线编辑</span><h2 id="home-editing">把脑海里的旋律写下来</h2></div>
            <div className="home-feature-copy">
              <p>点 <span className="home-control-hint"><NavActionIcon action="edit" />编辑</span>，从一句旋律开始，用 M3N 文本记谱语言输入音符、配上歌词，边写边看简谱，随时播放校对，再导出自己的乐谱。</p>
              <p>第一次写谱？跟着指南写出第一条乐句；想查某个符号怎么用，随时翻开手册。</p>
              <div className="home-feature-links">
                <Link to="/editor" className="home-text-link"><NavActionIcon action="edit" /> 打开编辑器 →</Link>
                <Link to="/?doc=guide" className="home-text-link"><NavActionIcon action="guide" /> 浏览指南 →</Link>
                <Link to="/?doc=manual" className="home-text-link"><NavActionIcon action="manual" /> 查阅手册 →</Link>
              </div>
            </div>
          </section>
        </div>
        <section className="home-sample markdown-panel" aria-labelledby="home-sample-title">
          <div className="home-sample-intro">
            <span className="eyebrow">现在，听听看</span>
            <h2 id="home-sample-title">用一首《欢乐颂》，开始今天的练习</h2>
            <p>点 <ControlHint icon="play" label="播放" />，听一遍这段熟悉的旋律。用下方的播放控件试听，打开设置，就能试试移调、速度和谱面调整。</p>
            <Link to="/scores/huan_le_song_01" className="home-text-link"><NavActionIcon action="library" /> 打开《欢乐颂》完整乐谱 →</Link>
          </div>
          <ScoreRenderer scoreId="huan_le_song_01" scoreDocument={analysis.score} sourceMap={analysis.interaction.sourceMap} />
        </section>
      </>}
    </main>
  )
}
