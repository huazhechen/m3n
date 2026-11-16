import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ScoreLoadStatus } from './ScoreLoadStatus'

function markup(error: string) {
  return renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(ScoreLoadStatus, { status: 'error', error, onRetry: () => {} })))
}

describe('score load recovery', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://example.com/score/assets/score-old.js',
    'Importing a module script failed.',
    'error loading dynamically imported module: https://example.com/score/assets/score-old.js',
  ])('offers a page refresh when the browser cannot import a score: %s', error => {
    const html = markup(error)
    expect(html).toContain('刷新页面获取最新版本后重试')
    expect(html).toContain('>刷新页面</button>')
    expect(html).not.toContain('重试加载')
    expect(html).not.toContain('score-old.js')
  })

  it('preserves ordinary retry for other load failures', () => {
    const html = markup('网络连接中断')
    expect(html).toContain('网络连接中断')
    expect(html).toContain('>重试加载</button>')
    expect(html).not.toContain('刷新页面')
  })
})
