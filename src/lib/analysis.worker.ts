import { analyzeM3NSnapshot } from '@m3n/notation'
import type { AnalysisRequest, AnalysisResponse } from './analysis-worker-protocol'

const port = globalThis as unknown as {
  onmessage: (event: MessageEvent<AnalysisRequest>) => void
  postMessage: (response: AnalysisResponse) => void
}

port.onmessage = ({ data: { revision, source } }) => {
  try { port.postMessage({ revision, snapshot: analyzeM3NSnapshot(source) }) }
  catch (error) { port.postMessage({ revision, error: error instanceof Error ? error.message : '乐谱分析失败。' }) }
}
