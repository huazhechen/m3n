import { NotationEditor } from '../components/NotationEditor'
import { TopNav } from '../components/TopNav'
import { presetScores } from '../lib/samples'
import { useSearchParams } from 'react-router-dom'

export function EditorPage() {
  const [searchParams] = useSearchParams()
  const selectedScore = presetScores.find((score) => score.slug === searchParams.get('score'))

  return (
    <main>
      <TopNav />
      <section className="page-heading">
        <span className="eyebrow">在线编辑</span>
        <h1>{selectedScore ? selectedScore.title : 'M3N / ABC 双栏编辑器'}</h1>
        <p>
          {selectedScore
            ? `${selectedScore.composer}${selectedScore.subtitle ? ` - ${selectedScore.subtitle}` : ''}`
            : '左侧编辑文本并在 M3N 与 ABC 之间切换；右侧通过 abcjs 渲染五线谱并提供播放控件。'}
        </p>
      </section>
      <NotationEditor key={selectedScore?.slug ?? 'blank-editor'} initialSource={selectedScore?.source} />
    </main>
  )
}
