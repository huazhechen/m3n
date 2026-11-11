import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { clearScoreDraft, loadScoreDraft, saveScoreDraft } from '../lib/score-drafts'

export function useScoreDraft(initialSource: string, enabled: boolean, scoreId?: string) {
  const [draft] = useState(() => enabled ? loadScoreDraft(scoreId) : null)
  const [source, setSource] = useState(draft?.source ?? initialSource)
  const [status, setStatus] = useState(draft ? '已恢复浏览器草稿' : '')
  const latest = useRef(source)
  const persistenceEnabled = useRef(true)
  useLayoutEffect(() => { latest.current = source }, [source])

  useEffect(() => {
    if (!enabled) return
    const flush = () => {
      if (!persistenceEnabled.current || (latest.current === initialSource && !draft)) return
      try { saveScoreDraft(latest.current, scoreId) } catch { /* Autosave reports failures while mounted. */ }
    }
    window.addEventListener('pagehide', flush)
    return () => { window.removeEventListener('pagehide', flush); flush() }
  }, [draft, enabled, initialSource, scoreId])

  useEffect(() => {
    if (!enabled || (source === initialSource && !draft)) return
    setStatus('正在保存草稿…')
    const timer = window.setTimeout(() => {
      if (!persistenceEnabled.current) return
      try {
        saveScoreDraft(source, scoreId)
        setStatus('草稿已保存到此浏览器')
      } catch (error) { setStatus(error instanceof Error ? error.message : '草稿保存失败。') }
    }, 400)
    return () => window.clearTimeout(timer)
  }, [draft, enabled, initialSource, scoreId, source])

  return {
    source, setSource, draftStatus: status,
    pauseDraft: () => { persistenceEnabled.current = false },
    resumeDraft: () => {
      persistenceEnabled.current = true
      try {
        saveScoreDraft(latest.current, scoreId)
        setStatus('草稿已保存到此浏览器')
      } catch (error) { setStatus(error instanceof Error ? error.message : '草稿保存失败。') }
    },
    discardDraft: () => { clearScoreDraft(scoreId) },
  }
}
