import { ResourceLoadingDialog } from './ResourceLoadingDialog'
import type { LibraryResourceProgress } from '../lib/library-resources'
import { Link } from 'react-router-dom'

export function ScoreLoadStatus({ status, error, onRetry, progress, libraryTo = '/scores', libraryLabel = '乐谱库' }: { progress?: LibraryResourceProgress | null; libraryTo?: string; libraryLabel?: string; status: 'loading' | 'missing' | 'error'; error?: string; onRetry?: () => void }) {
  const moduleFailed = status === 'error' && /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .+ failed/i.test(error ?? '')
  return <section className="page-status" role={status === 'loading' ? 'status' : 'alert'}>
    <ResourceLoadingDialog active={status === 'loading'} title="加载乐谱资源"
      description={progress?.installing ? '正在安装乐谱字体…' : progress ? `正在下载乐谱资源… ${Math.floor(progress.completed / (progress.total || 1) * 100)}%` : '正在读取乐谱…'}
      progressLabel="乐谱资源下载进度" value={progress && !progress.installing && progress.completed < progress.total ? progress.completed / (progress.total || 1) * 100 : undefined} />
    <p>{status === 'loading' ? '正在加载乐谱…' : status === 'missing' ? '乐谱不存在或已过期。' : moduleFailed ? '乐谱资源加载失败，请刷新页面获取最新版本后重试。' : error || '乐谱加载失败。'}</p>
    {moduleFailed ? <button type="button" className="action-button" onClick={() => window.location.reload()}>刷新页面</button> : status === 'error' && onRetry && <button type="button" className="action-button" onClick={onRetry}>重试加载</button>}
    {status !== 'loading' && <div><Link className="action-button" to={libraryTo}>返回{libraryLabel}</Link> <Link className="action-button" to="/editor">新建乐谱</Link></div>}
  </section>
}
