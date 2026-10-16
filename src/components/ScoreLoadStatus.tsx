import { Link } from 'react-router-dom'

export function ScoreLoadStatus({ status, error }: { status: 'loading' | 'missing' | 'error'; error?: string }) {
  return <section className="page-status" role={status === 'loading' ? 'status' : 'alert'}>
    <p>{status === 'loading' ? '正在加载乐谱…' : status === 'missing' ? '乐谱不存在或已过期。' : error || '乐谱加载失败。'}</p>
    {status !== 'loading' && <div><Link className="action-button" to="/scores">返回乐谱库</Link> <Link className="action-button" to="/editor">新建乐谱</Link></div>}
  </section>
}
