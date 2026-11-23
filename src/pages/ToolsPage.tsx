import { Link } from 'react-router-dom'
import { TopNav } from '../components/TopNav'
import { ScoreControlIcon } from '../components/ScoreControlIcon'
import '../styles/tools.css'

export function ToolsPage() {
  return <main className="tools-page">
    <TopNav />
    <div className="tools-catalog" aria-label="练琴工具">
      <Link className="tool-entry" to="/tools/scales"><ScoreControlIcon name="harmonica" /><strong>音阶图</strong></Link>
      <Link className="tool-entry" to="/tools/metronome"><ScoreControlIcon name="metronome" /><strong>节拍器</strong></Link>
    </div>
  </main>
}
