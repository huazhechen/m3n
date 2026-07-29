import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react'
import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSearchParams } from 'react-router-dom'
import { NotationEditor } from './NotationEditor'

type DocumentSource = {
  id: string
  title: string
  description: string
  source: string
}

type Page = {
  id: string
  documentId: string
  documentTitle: string
  title: string
  content: string
}

type DocumentGroup = DocumentSource & {
  pages: Page[]
}

type MarkdownBookProps = {
  documents: DocumentSource[]
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function splitDocument(document: DocumentSource): Page[] {
  const pages: Page[] = []
  const lines = document.source.split(/\r?\n/)
  let buffer: string[] = []
  let currentTitle = document.title
  let currentId = `${document.id}-overview`

  const flush = () => {
    const content = buffer.join('\n').trim()
    if (!content) {
      buffer = []
      return
    }
    pages.push({
      id: currentId,
      documentId: document.id,
      documentTitle: document.title,
      title: currentTitle,
      content,
    })
    buffer = []
  }

  for (const line of lines) {
    const heading = /^(#{1,2})\s+(.+)$/.exec(line)
    if (heading && buffer.length > 0) {
      flush()
      currentTitle = heading[2].trim()
      currentId = `${document.id}-${slugify(currentTitle) || pages.length}`
    }
    buffer.push(line)
  }
  flush()
  return pages
}

function isCodeChild(node: ReactNode, language: string) {
  if (!node || typeof node !== 'object' || !('props' in node)) {
    return false
  }

  const child = node as ReactElement<{ className?: string }>
  return child.props.className?.includes(`language-${language}`) ?? false
}

export function MarkdownBook({ documents }: MarkdownBookProps) {
  const pages = useMemo(() => documents.flatMap(splitDocument), [documents])
  const [searchParams, setSearchParams] = useSearchParams()
  const [isTocOpen, setIsTocOpen] = useState(false)
  const documentGroups = useMemo<DocumentGroup[]>(
    () =>
      documents.map((document) => ({
        ...document,
        pages: pages.filter((page) => page.documentId === document.id),
      })),
    [documents, pages],
  )
  const activePageId = searchParams.get('page')
  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0]
  const activePageIndex = pages.findIndex((page) => page.id === activePage.id)
  const previousPage = pages[activePageIndex - 1]
  const nextPage = pages[activePageIndex + 1]

  function selectPage(pageId: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('page', pageId)
      return next
    })
    setIsTocOpen(false)
    window.scrollTo(0, 0)
  }

  function selectMarkdownLink(href: string) {
    const match = /^([A-Za-z0-9-]+\.md)(?:#(.+))?$/.exec(href)
    if (!match) {
      return false
    }

    const documentId = match[1].replace(/\.md$/i, '').toLowerCase()
    const anchor = match[2] ? slugify(decodeURIComponent(match[2])) : ''
    const target = anchor
      ? pages.find((page) => page.id === `${documentId}-${anchor}`)
      : pages.find((page) => page.documentId === documentId)

    if (!target) {
      return false
    }

    selectPage(target.id)
    return true
  }

  if (!activePage) {
    return null
  }

  return (
    <div className="book-layout">
      <aside id="docs-toc" className={`book-toc ${isTocOpen ? 'is-open' : ''}`}>
        <span className="eyebrow">目录</span>
        <nav className="toc-tree" aria-label="文档目录">
          {documentGroups.map((document) => (
            <section
              key={document.id}
              className={`toc-group ${document.id === activePage.documentId ? 'active' : ''}`}
            >
              <button
                type="button"
                className="toc-root"
                onClick={() => {
                  const firstPage = document.pages[0]
                  if (firstPage) {
                    selectPage(firstPage.id)
                  }
                }}
              >
                <strong>{document.title}</strong>
                <span>{document.description}</span>
              </button>
              <div className="toc-children">
                {document.pages.slice(1).map((page) => (
                  <button
                    key={page.id}
                    type="button"
                    className={`toc-leaf ${page.id === activePage.id ? 'active' : ''}`}
                    onClick={() => selectPage(page.id)}
                  >
                    {page.title}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </nav>
      </aside>
      <article className="markdown-panel">
        <div className="doc-context">
          <span>{activePage.documentTitle}</span>
          <strong>{activePage.title}</strong>
        </div>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            pre(props: ComponentPropsWithoutRef<'pre'>) {
              if (isCodeChild(props.children, 'm3n')) {
                return <>{props.children}</>
              }
              return <pre>{props.children}</pre>
            },
            code(props) {
              const className = props.className ?? ''
              const value = String(props.children ?? '').replace(/\n$/, '')
              if (className.includes('language-m3n')) {
                return <NotationEditor embedded initialMode="m3n" initialSource={value} />
              }
              return <code className={className}>{props.children}</code>
            },
            a(props: ComponentPropsWithoutRef<'a'>) {
              const href = props.href ?? ''
              return (
                <a
                  {...props}
                  onClick={(event) => {
                    if (selectMarkdownLink(href)) {
                      event.preventDefault()
                    }
                  }}
                />
              )
            },
          }}
        >
          {activePage.content}
        </ReactMarkdown>
        <nav className="doc-pagination" aria-label="文档章节导航">
          <button
            type="button"
            disabled={!previousPage}
            aria-label="上一章"
            title="上一章"
            onClick={() => previousPage && selectPage(previousPage.id)}
          >
            ↑
          </button>
          <button
            type="button"
            disabled={!nextPage}
            aria-label="下一章"
            title="下一章"
            onClick={() => nextPage && selectPage(nextPage.id)}
          >
            ↓
          </button>
          <button
            type="button"
            className="doc-toc-toggle"
            aria-expanded={isTocOpen}
            aria-controls="docs-toc"
            aria-label="目录"
            title="目录"
            onClick={() => setIsTocOpen((open) => !open)}
          >
            ☰
          </button>
        </nav>
      </article>
    </div>
  )
}
