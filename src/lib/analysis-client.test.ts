import { describe, expect, it } from 'vitest'
import { analyzeM3NSnapshot, restoreM3NAnalysis } from '@m3n/notation'
import { AnalysisClient, type AnalysisWorkerPort } from './analysis-client'
import type { AnalysisRequest, AnalysisResponse } from './analysis-worker-protocol'

class TestWorker implements AnalysisWorkerPort {
  onmessage: AnalysisWorkerPort['onmessage'] = null
  onerror: AnalysisWorkerPort['onerror'] = null
  requests: AnalysisRequest[] = []
  terminated = false
  postMessage(request: AnalysisRequest) { this.requests.push(request) }
  terminate() { this.terminated = true }
  reply(response: AnalysisResponse) { this.onmessage?.({ data: response } as MessageEvent<AnalysisResponse>) }
}

describe('background score analysis', () => {
  it('keeps only the newest pending edit and restores a cloneable semantic snapshot', async () => {
    const worker = new TestWorker()
    const client = new AnalysisClient(worker)
    const first = client.analyze('N: 1 2 3 4 |||')
    const superseded = client.analyze('N: 2 3 4 5 |||').catch(error => error)
    const latest = client.analyze('N: 3 4 5 6 |||')
    expect(worker.requests.map(request => request.source)).toEqual(['N: 1 2 3 4 |||'])
    expect((await superseded).name).toBe('AbortError')
    const initialSnapshot = structuredClone(analyzeM3NSnapshot(worker.requests[0]!.source))
    worker.reply({ revision: 1, snapshot: initialSnapshot })
    expect((await first).source).toBe('N: 1 2 3 4 |||')
    expect(worker.requests.map(request => request.source)).toEqual(['N: 1 2 3 4 |||', 'N: 3 4 5 6 |||'])
    worker.reply({ revision: 1, snapshot: initialSnapshot }) // A late stale reply cannot replace request 3.
    worker.reply({ revision: 3, snapshot: structuredClone(analyzeM3NSnapshot(worker.requests[1]!.source)) })
    const restored = restoreM3NAnalysis(await latest)
    expect(restored.score.parts.get('score')?.melody[0]?.events[0]?.pitches).toEqual(['3'])
    expect(restored.conversion.mei).toContain('xml:id="m3n-e-1"')
    client.destroy()
  })

  it('rejects unfinished work and releases the worker on disposal', async () => {
    const worker = new TestWorker()
    const client = new AnalysisClient(worker)
    const active = client.analyze('first').catch(error => error)
    const pending = client.analyze('last').catch(error => error)
    client.destroy()
    expect((await active).name).toBe('AbortError')
    expect((await pending).name).toBe('AbortError')
    expect(worker.terminated).toBe(true)
    expect(worker.onmessage).toBeNull()
    await expect(client.analyze('after disposal')).rejects.toThrow('已关闭')
  })
})
