import ReactMarkdown from 'react-markdown'
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react'
import remarkGfm from 'remark-gfm'
import { ComparisonView } from './ComparisonView'
import { parseM3N } from '../lib/m3n'

type MarkdownDocumentProps = {
  source: string
}

function isM3NCodeChild(node: ReactNode) {
  if (!node || typeof node !== 'object' || !('props' in node)) {
    return false
  }

  const child = node as ReactElement<{ className?: string }>
  return child.props.className?.includes('language-m3n') ?? false
}

export function MarkdownDocument({ source }: MarkdownDocumentProps) {
  return (
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
              return <ComparisonView compact document={parseM3N(value)} source={value} />
            }

            return (
              <code className={className}>
                {props.children}
              </code>
            )
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
