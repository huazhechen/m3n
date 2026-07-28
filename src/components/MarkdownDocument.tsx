import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react'
import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { parseM3N } from '../lib/m3n'
import { ScorePreview } from './ScorePreview'

type MarkdownDocumentProps = {
  source: string
}

type MarkdownPage = {
  id: string
  title: string
  section?: string
  chapter?: string
  content: string
}

function isM3NCodeChild(node: ReactNode) {
  if (!node || typeof node !== 'object' || !('props' in node)) {
    return false
  }

  const child = node as ReactElement<{ className?: string }>
  return child.props.className?.includes('language-m3n') ?? false
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildPages(source: string) {
  const lines = source.split(/\r?\n/)
  const pages: MarkdownPage[] = []
  let section = ''
  let chapter = ''
  let buffer: string[] = []
  let currentPage: Omit<MarkdownPage, 'content'> = {
    id: 'overview',
    title: '概览',
  }

  const flush = () => {
    const content = buffer.join('\n').trim()
    if (!content) {
      buffer = []
      return
    }

    pages.push({
      ...currentPage,
      content,
    })
    buffer = []
  }

  lines.forEach((line) => {
    const heading = /^(#{1,4})\s+(.+)$/.exec(line)
    if (!heading) {
      buffer.push(line)
      return
    }

    const level = heading[1].length
    const title = heading[2].trim()

    if (level === 2) {
      section = title
    }

    if (level === 3) {
      chapter = title
    }

    if (level === 4) {
      flush()
      currentPage = {
        id: slugify(`${section}-${chapter}-${title}`) || `page-${pages.length + 1}`,
        title,
        section: section || undefined,
        chapter: chapter || undefined,
      }
    }

    buffer.push(line)
  })

  flush()
  return pages
}

export function MarkdownDocument({ source }: MarkdownDocumentProps) {
  const pages = useMemo(() => buildPages(source), [source])
  const [activePageId, setActivePageId] = useState(() => pages[0]?.id ?? 'overview')
  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0]

  if (!activePage) {
    return null
  }

  return (
    <div className="docs-layout">
      <aside className="docs-sidebar">
        <div className="pane-label">目录</div>
        <nav className="docs-nav" aria-label="文档目录">
          {pages.map((page, index) => (
            <button
              key={page.id}
              type="button"
              className={`docs-nav-item${page.id === activePage.id ? ' active' : ''}`}
              onClick={() => setActivePageId(page.id)}
            >
              <span>{page.title}</span>
              <small>
                第 {index + 1} 页
                {page.chapter ? ` · ${page.chapter}` : ''}
              </small>
            </button>
          ))}
        </nav>
      </aside>

      <section className="docs-content">
        <header className="docs-page-header">
          <div className="pane-label">文档分页</div>
          <h2>{activePage.title}</h2>
          <p>
            {[activePage.section, activePage.chapter].filter(Boolean).join(' / ') || '文档概览'}
          </p>
        </header>

        <div className="markdown-shell">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              pre(props: ComponentPropsWithoutRef<'pre'>) {
                if (isM3NCodeChild(props.children)) {
                  return <>{props.children}</>
                }

                return <pre>{props.children}</pre>
              },
              code(props) {
                const className = props.className ?? ''
                const match = /language-(\w+)/.exec(className)
                const value = String(props.children ?? '')

                if (match?.[1] === 'm3n') {
                  return <ScorePreview compact document={parseM3N(value)} />
                }

                return <code className={className}>{props.children}</code>
              },
            }}
          >
            {activePage.content}
          </ReactMarkdown>
        </div>
      </section>
    </div>
  )
}
