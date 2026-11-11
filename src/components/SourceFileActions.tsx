import { useRef } from 'react'
import { downloadBlob, scoreFileName } from '@m3n/score-renderer/view'

export function SourceFileActions({ source, title, onImport, onError }: {
  source: string
  title: string
  onImport: (source: string) => void
  onError: (message: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return <>
    <input ref={input} type="file" accept=".m3n,text/plain" hidden aria-label="导入 M3N 文件" onChange={event => {
      const file = event.currentTarget.files?.[0]
      event.currentTarget.value = ''
      if (!file) return
      if (file.size > 256 * 1024) { onError('乐谱文件不能超过 256 KiB。'); return }
      void file.text().then(text => {
        onError('')
        onImport(text.replace(/^\uFEFF/, ''))
      }).catch(() => onError('文件读取失败，请重试。'))
    }} />
    <button type="button" className="action-button" onClick={() => input.current?.click()}>导入</button>
    <button type="button" className="action-button" onClick={() => downloadBlob(new Blob([source], { type: 'text/plain;charset=utf-8' }), `${scoreFileName(title)}.m3n`)}>下载 M3N</button>
  </>
}
