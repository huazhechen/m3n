import { NotationEditor } from '../components/NotationEditor'
import { TopNav } from '../components/TopNav'

export function EditorPage() {
  return (
    <main>
      <TopNav />
      <section className="page-heading">
        <span className="eyebrow">在线编辑</span>
        <h1>M3N / ABC 双栏编辑器</h1>
        <p>左侧编辑文本并在 M3N 与 ABC 之间切换；右侧通过 abcjs 渲染五线谱并提供播放控件。</p>
      </section>
      <NotationEditor />
    </main>
  )
}

