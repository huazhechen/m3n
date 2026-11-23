import { TopNav } from '../components/TopNav'
import '../styles/tools.css'

export function MetronomePage() {
  return <main className="tools-page">
    <TopNav />
    <section className="tool-placeholder" aria-labelledby="metronome-title">
      <h1 id="metronome-title">节拍器</h1>
      <p>计划中</p>
    </section>
  </main>
}
