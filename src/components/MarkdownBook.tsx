import type { ComponentPropsWithoutRef, FocusEvent, ReactElement, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useLocation, useNavigate } from 'react-router-dom'
import { documentSections, searchForDocument, slugify } from '../lib/docs-navigation'
import { NotationEditor } from './NotationEditor'

type DocumentSource = {
  id: string
  title: string
  description: string
  source: string
}

type DocumentGroup = DocumentSource & {
  sections: ReturnType<typeof documentSections>
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
  const [activeHeadingId, setActiveHeadingId] = useState('')
  const tocRef = useRef<HTMLElement>(null)
  const tocToggleRef = useRef<HTMLButtonElement>(null)
  const activeHeadingIdRef = useRef('')
  const articleRef = useRef<HTMLElement>(null)
  const documentGroups = useMemo<DocumentGroup[]>(
    () =>
      documents.map((document) => ({
        ...document,
        sections: documentSections(document.source),
      })),
    [documents],
  )
  const pageParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const activeDocument = documentGroups.find((document) => document.id === pageParams.get('doc')) ?? documentGroups[0]
  const activeDocumentHeadings = useMemo(
    () => activeDocument?.sections.flatMap((section) => [section, ...section.children]) ?? [],
    [activeDocument],
  )

  useEffect(() => {
    if (!activeDocument) {
      return
    }

    const targetId = location.hash ? decodeURIComponent(location.hash.slice(1)) : ''
    activeHeadingIdRef.current = targetId
    setActiveHeadingId(targetId)
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
    if (!activeDocument) {
      return
    }

    let frame = 0
    const headingIds = new Set(activeDocumentHeadings.map((heading) => heading.id))

    function updateActiveHeading() {
      frame = 0
      const headingElements = [...(articleRef.current?.querySelectorAll<HTMLHeadingElement>('h2[id], h3[id]') ?? [])]
        .filter((heading) => headingIds.has(heading.id))
      const readingPosition = window.scrollY + window.innerHeight * 0.25
      const currentHeading = headingElements.reduce<string>((currentId, heading) => (
        heading.getBoundingClientRect().top + window.scrollY <= readingPosition ? heading.id : currentId
      ), '')

      if (activeHeadingIdRef.current === currentHeading) {
        return
      }

      activeHeadingIdRef.current = currentHeading
      setActiveHeadingId(currentHeading)
      const hash = currentHeading ? `#${encodeURIComponent(currentHeading)}` : ''
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`)
    }

    function scheduleHeadingUpdate() {
      if (!frame) {
        frame = window.requestAnimationFrame(updateActiveHeading)
      }
    }

    scheduleHeadingUpdate()
    window.addEventListener('scroll', scheduleHeadingUpdate, { passive: true })
    window.addEventListener('resize', scheduleHeadingUpdate)
    const observer = articleRef.current ? new ResizeObserver(scheduleHeadingUpdate) : null
    if (articleRef.current) observer?.observe(articleRef.current)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', scheduleHeadingUpdate)
      window.removeEventListener('resize', scheduleHeadingUpdate)
      observer?.disconnect()
    }
  }, [activeDocument, activeDocumentHeadings])

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

  const selectDocument = useCallback((documentId: string, headingId = '') => {
    navigate({
      pathname: location.pathname,
      search: searchForDocument(location.search, documentId),
      hash: headingId ? `#${headingId}` : '',
    })
    setIsTocOpen(false)
  }, [location.pathname, location.search, navigate])

  const selectMarkdownLink = useCallback((href: string) => {
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
    const heading = target.sections
      .flatMap((section) => [section, ...section.children])
      .find((candidate) => candidate.title === anchorTitle)
    selectDocument(target.id, heading?.id ?? (anchorTitle ? slugify(anchorTitle) : ''))
    return true
  }, [documentGroups, selectDocument])

  const markdownComponents = useMemo(() => ({
    h2(props: ComponentPropsWithoutRef<'h2'>) {
      const title = String(props.children ?? '')
      const heading = activeDocumentHeadings.find((candidate) => candidate.title === title)
      return <h2 {...props} id={heading?.id ?? slugify(title)} />
    },
    h3(props: ComponentPropsWithoutRef<'h3'>) {
      const title = String(props.children ?? '')
      const heading = activeDocumentHeadings.find((candidate) => candidate.title === title)
      return <h3 {...props} id={heading?.id ?? slugify(title)} />
    },
    pre(props: ComponentPropsWithoutRef<'pre'>) {
      if (isCodeChild(props.children, 'm3n')) {
        return <>{props.children}</>
      }
      return <pre>{props.children}</pre>
    },
    code(props: ComponentPropsWithoutRef<'code'>) {
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
  }), [activeDocumentHeadings, selectMarkdownLink])

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
                {document.sections.map((section) => {
                  const isCurrentSection = document.id === activeDocument.id && (
                    section.id === activeHeadingId || section.children.some((heading) => heading.id === activeHeadingId)
                  )
                  return (
                    <section key={section.id} className={`toc-section ${isCurrentSection ? 'active' : ''}`}>
                      <button
                        type="button"
                        className="toc-section-heading"
                        aria-current={section.id === activeHeadingId ? 'location' : undefined}
                        aria-expanded={section.children.length > 0 ? isCurrentSection : undefined}
                        onClick={() => selectDocument(document.id, section.id)}
                      >
                        {section.title}
                      </button>
                      {isCurrentSection && section.children.length > 0 && (
                        <div className="toc-subsections">
                          {section.children.map((heading) => (
                            <button
                              key={heading.id}
                              type="button"
                              className={`toc-leaf ${heading.id === activeHeadingId ? 'active' : ''}`}
                              aria-current={heading.id === activeHeadingId ? 'location' : undefined}
                              onClick={() => selectDocument(document.id, heading.id)}
                            >
                              {heading.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>
            </section>
          ))}
        </nav>
      </aside>
      <article ref={articleRef} className="markdown-panel">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={markdownComponents}
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
