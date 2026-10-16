import type { M3NAnalysisSnapshot } from '@m3n/notation'
import type { AnalysisRequest, AnalysisResponse } from './analysis-worker-protocol'

export type AnalysisWorkerPort = {
  postMessage: (request: AnalysisRequest) => void
  onmessage: ((event: MessageEvent<AnalysisResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  terminate: () => void
}
type PendingAnalysis = AnalysisRequest & {
  resolve: (snapshot: M3NAnalysisSnapshot) => void
  reject: (error: Error) => void
}

/** One running request and one latest pending edit: stale edits never accumulate in the Worker. */
export class AnalysisClient {
  private revision = 0
  private active: PendingAnalysis | null = null
  private pending: PendingAnalysis | null = null
  private destroyed = false
  private readonly worker: AnalysisWorkerPort

  constructor(worker: AnalysisWorkerPort) {
    this.worker = worker
    worker.onmessage = ({ data }) => {
      if (this.destroyed || data.revision !== this.active?.revision) return
      if ('snapshot' in data) this.active.resolve(data.snapshot)
      else this.active.reject(new Error(data.error))
      this.active = null
      this.startNext()
    }
    worker.onerror = event => {
      const error = new Error(event.message || '分析线程异常，请刷新页面重试。')
      this.active?.reject(error)
      this.pending?.reject(error)
      this.active = null
      this.pending = null
      this.destroy()
    }
  }

  analyze(source: string): Promise<M3NAnalysisSnapshot> {
    if (this.destroyed) return Promise.reject(new Error('分析线程已关闭。'))
    this.pending?.reject(new DOMException('Superseded by a newer edit', 'AbortError'))
    return new Promise((resolve, reject) => {
      this.pending = { revision: ++this.revision, source, resolve, reject }
      this.startNext()
    })
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    const error = new DOMException('Analysis stopped', 'AbortError')
    this.active?.reject(error)
    this.pending?.reject(error)
    this.active = null
    this.pending = null
    this.worker.onmessage = null
    this.worker.onerror = null
    this.worker.terminate()
  }

  private startNext() {
    if (this.active || !this.pending || this.destroyed) return
    this.active = this.pending
    this.pending = null
    try { this.worker.postMessage({ revision: this.active.revision, source: this.active.source }) }
    catch (error) {
      this.active.reject(error instanceof Error ? error : new Error('无法发送乐谱到分析线程。'))
      this.active = null
    }
  }
}
