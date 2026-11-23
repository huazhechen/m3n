import { useEffect, useRef, useState } from 'react'
import { TopNav } from '../components/TopNav'
import { PracticeMetronome } from '../lib/practice-metronome'
import { addPracticeTime, formatPracticeTime, localDay, PRACTICE_TIME_KEY, readPracticeDays } from '../lib/practice-time'
import '../styles/tools.css'

function defaultAccents(beats: number) { return Array.from({ length: beats }, (_, index) => index === 0 || (beats === 6 && index === 3)) }
export function MetronomePage() {
  const [bpm, setBpm] = useState(80)
  const [accents, setAccents] = useState(defaultAccents(4))
  const [running, setRunning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [activeBeat, setActiveBeat] = useState(-1)
  const [days, setDays] = useState(readPracticeDays)
  const [error, setError] = useState('')
  const engine = useRef<PracticeMetronome | null>(null)
  const recordedAt = useRef<number | null>(null)
  const daysRef = useRef(days)
  const settings = { bpm, accents }
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const saveTime = () => {
    const now = Date.now()
    if (recordedAt.current !== null) {
      const updated = addPracticeTime(daysRef.current, recordedAt.current, now)
      daysRef.current = updated
      setDays(updated)
      try { localStorage.setItem(PRACTICE_TIME_KEY, JSON.stringify(updated)) } catch { setError('浏览器未允许本地保存，练习时间暂存于本次页面。') }
      recordedAt.current = now
    }
  }
  const stop = () => {
    saveTime()
    recordedAt.current = null
    engine.current?.stop()
    engine.current = null
    setRunning(false)
    setStarting(false)
    setActiveBeat(-1)
  }
  const start = async () => {
    setError('')
    setStarting(true)
    let current: PracticeMetronome | null = null
    try {
      current = new PracticeMetronome(settingsRef.current, setActiveBeat)
      engine.current = current
      await current.start()
      if (engine.current !== current) { current.stop(); return }
      current.update(settingsRef.current)
      recordedAt.current = Date.now()
      setRunning(true)
      setStarting(false)
    } catch (cause) {
      if (engine.current === current) stop()
      current?.stop()
      setError(cause instanceof Error ? cause.message : '无法启动音频，请重试。')
    }
  }
  useEffect(() => { engine.current?.update({ bpm, accents }) }, [bpm, accents])
  useEffect(() => {
    const timer = setInterval(() => {
      if (recordedAt.current !== null && !engine.current?.running) stop()
      else saveTime()
    }, 1000)
    const onHidden = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', stop)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', stop)
      saveTime()
      recordedAt.current = null
      engine.current?.stop()
      engine.current = null
    }
  }, [])
  const today = localDay(new Date())
  return <main className="tools-page">
    <TopNav />
    <section className="metronome-tool" aria-labelledby="metronome-title">
      <h1 id="metronome-title">节拍器</h1>
      <div className="metronome-tempo">
        <button className="metronome-tempo-step" type="button" aria-label="速度减少 1 BPM" disabled={bpm <= 30} onClick={() => setBpm(current => Math.max(30, current - 1))}>−</button>
        <div className="metronome-tempo-value"><output aria-label="当前速度">{bpm}</output><span>BPM</span></div>
        <button className="metronome-tempo-step" type="button" aria-label="速度增加 1 BPM" disabled={bpm >= 240} onClick={() => setBpm(current => Math.min(240, current + 1))}>+</button>
      </div>
      <label className="metronome-slider">速度<input aria-label="速度" type="range" min="30" max="240" step="1" value={bpm} onChange={event => setBpm(Number(event.target.value))} /></label>
      <div className="metronome-meters" role="group" aria-label="拍型">{[2, 4, 3, 6].map(beats => <button key={beats} type="button" aria-pressed={accents.length === beats} onClick={() => { setAccents(defaultAccents(beats)); setActiveBeat(-1) }}>{beats} 拍</button>)}</div>
      <div className="metronome-beats" role="group" aria-label="重音设置">{accents.map((accent, index) => <button key={index} type="button" aria-label={`第 ${index + 1} 拍重音`} aria-pressed={accent} data-active={running && activeBeat === index} onClick={() => setAccents(current => current.map((value, beat) => beat === index ? !value : value))}>{index + 1}<span>{accent ? '重' : '轻'}</span></button>)}</div>
      <button className="metronome-start" type="button" disabled={starting} onClick={() => { if (running) stop(); else void start() }}>{starting ? '启动中…' : running ? '暂停' : '开始'}</button>
      {error && <p role="alert">{error}</p>}
      <div className="practice-totals"><div>今日练习<strong aria-label="今日练习时长">{formatPracticeTime(days[today] ?? 0)}</strong></div><div>累计练习<strong aria-label="累计练习时长">{formatPracticeTime(Object.values(days).reduce((sum, duration) => sum + duration, 0))}</strong></div></div>
      <details className="practice-history"><summary>每日记录</summary>{Object.entries(days).length ? <ol>{Object.entries(days).sort(([a], [b]) => b.localeCompare(a)).map(([day, duration]) => <li key={day}><time>{day}</time><span>{formatPracticeTime(duration)}</span></li>)}</ol> : <p>开始节拍器后自动记录。</p>}</details>
    </section>
  </main>
}
