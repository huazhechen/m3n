/** Serializes WASM layout work while yielding a frame before each task. */
export class RenderScheduler {
  private queue = Promise.resolve()

  enqueue(task: () => Promise<void>) {
    const queued = this.queue.then(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      return task()
    })
    this.queue = queued.catch(() => undefined)
    return queued
  }
}

export const scoreRenderScheduler = new RenderScheduler()
