import type { ComponentPropsWithoutRef, FocusEvent, ReactElement, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useLocation, useNavigate } from 'react-router-dom'
import { documentHeadings, searchForDocument, slugify } from '../lib/docs-navigation'
import { NotationEditor } from './NotationEditor'

type DocumentSource = {
  id: string
  title: string
  description: string
  source: string
}

type DocumentGroup = DocumentSource & {
  headings: ReturnType<typeof documentHeadings>
}

type MarkdownBookProps = {
  documents: DocumentSource[]
}

function isCodeChild(node: ReactNode, language: string) {
  if (!node || typeof node !== 'object' || !('props' in node)) {
    return false
  }

  const child = node as ReactElement<{ className?: string }>
  return child.props.className?.includes(`language-${language}`) ?? false
}

export function MarkdownBook({ documents }: MarkdownBookProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [isTocOpen, setIsTocOpen] = useState(false)
  const tocRef = useRef<HTMLElement>(null)
  const tocToggleRef = useRef<HTMLButtonElement>(null)
  const documentGroups = useMemo<DocumentGroup[]>(
    () =>
      documents.map((document) => ({
        ...document,
        headings: documentHeadings(document.source),
      })),
    [documents],
  )
  const pageParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const activeDocument = documentGroups.find((document) => document.id === pageParams.get('doc')) ?? documentGroups[0]
  const activeHeadingId = location.hash ? decodeURIComponent(location.hash.slice(1)) : ''

  useEffect(() => {
    if (!activeDocument) {
      return
    }

    const targetId = location.hash ? decodeURIComponent(location.hash.slice(1)) : ''
    const frame = window.requestAnimationFrame(() => {
      if (targetId) {
        document.getElementById(targetId)?.scrollIntoView()
      } else {
        window.scrollTo(0, 0)
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [activeDocument, location.hash])

  useEffect(() => {
    if (!isTocOpen) {
      return
    }

    function closeTocWhenPointerLeaves(event: PointerEvent) {
      const target = event.target
      if (
        target instanceof Node &&
        (tocRef.current?.contains(target) || tocToggleRef.current?.contains(target))
      ) {
        return
      }
      setIsTocOpen(false)
    }

    document.addEventListener('pointerdown', closeTocWhenPointerLeaves)
    return () => document.removeEventListener('pointerdown', closeTocWhenPointerLeaves)
  }, [isTocOpen])

  function closeTocWhenFocusLeaves(event: FocusEvent<HTMLElement>) {
    const nextFocus = event.relatedTarget
    if (
      nextFocus instanceof Node &&
      (tocRef.current?.contains(nextFocus) || tocToggleRef.current?.contains(nextFocus))
    ) {
      return
    }
    setIsTocOpen(false)
  }

  function selectDocument(documentId: string, headingId = '') {
    navigate({
      pathname: location.pathname,
      search: searchForDocument(location.search, documentId),
      hash: headingId ? `#${headingId}` : '',
    })
    setIsTocOpen(false)
  }

  function selectMarkdownLink(href: string) {
    const match = /^([A-Za-z0-9-]+\.md)(?:#(.+))?$/.exec(href)
    if (!match) {
      return false
    }

    const documentId = match[1].replace(/\.md$/i, '').toLowerCase()
    const target = documentGroups.find((document) => document.id === documentId)

    if (!target) {
      return false
    }

    const anchorTitle = match[2] ? decodeURIComponent(match[2]) : ''
    const heading = target.headings.find((candidate) => candidate.title === anchorTitle)
    selectDocument(target.id, heading?.id ?? (anchorTitle ? slugify(anchorTitle) : ''))
    return true
  }

  if (!activeDocument) {
    return null
  }

  return (
    <div className="book-layout">
      <aside
        ref={tocRef}
        id="docs-toc"
        className={`book-toc ${isTocOpen ? 'is-open' : ''}`}
        onBlur={closeTocWhenFocusLeaves}
      >
        <span className="eyebrow">目录</span>
        <nav className="toc-tree" aria-label="文档目录">
          {documentGroups.map((document) => (
            <section
              key={document.id}
              className={`toc-group ${document.id === activeDocument.id ? 'active' : ''}`}
            >
              <button
                type="button"
                className="toc-root"
                aria-current={document.id === activeDocument.id ? 'page' : undefined}
                onClick={() => selectDocument(document.id)}
              >
                <strong>{document.title}</strong>
                <span>{document.description}</span>
              </button>
              <div className="toc-children">
                {document.headings.map((heading) => (
                  <button
                    key={heading.id}
                    type="button"
                    className={`toc-leaf ${document.id === activeDocument.id && heading.id === activeHeadingId ? 'active' : ''}`}
                    aria-current={document.id === activeDocument.id && heading.id === activeHeadingId ? 'location' : undefined}
                    onClick={() => selectDocument(document.id, heading.id)}
                  >
                    {heading.title}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </nav>
      </aside>
      <article className="markdown-panel">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h2(props: ComponentPropsWithoutRef<'h2'>) {
              const title = String(props.children ?? '')
              const heading = activeDocument.headings.find((candidate) => candidate.title === title)
              return <h2 {...props} id={heading?.id ?? slugify(title)} />
            },
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
                return <NotationEditor embedded initialSource={value} />
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
          {activeDocument.source}
        </ReactMarkdown>
        <button
          ref={tocToggleRef}
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
      </article>
    </div>
  )
}
