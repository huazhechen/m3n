import { useEffect, useRef, useState, type PointerEvent } from 'react'

export function LibraryIndex({ initials }: { initials: string[] }) {
  const [active, setActive] = useState(initials[0] ?? '')
  const [preview, setPreview] = useState<string | null>(null)
  const dragging = useRef<number | null>(null)
  const signature = initials.join('')

  useEffect(() => {
    let frame = 0
    const update = () => {
      const groups = [...document.querySelectorAll<HTMLElement>('[data-library-initial]')]
      const atBottom = window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
      const current = atBottom ? groups.at(-1) : groups.filter(group => group.getBoundingClientRect().top <= 100).at(-1) ?? groups[0]
      if (current) setActive(current.dataset.libraryInitial!)
    }
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [signature])

  const jump = (initial: string) => {
    document.getElementById(`library-group-${initial}`)?.scrollIntoView({ block: 'start', behavior: 'instant' })
    setActive(initial)
  }
  const track = (event: PointerEvent<HTMLElement>) => {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
    const nearest = buttons.reduce<HTMLButtonElement | undefined>((best, button) => {
      const center = (element: HTMLElement) => { const box = element.getBoundingClientRect(); return box.top + box.height / 2 }
      return !best || Math.abs(center(button) - event.clientY) < Math.abs(center(best) - event.clientY) ? button : best
    }, undefined)
    const initial = nearest?.dataset.initial
    if (initial) { jump(initial); setPreview(initial) }
  }
  const finish = (event: PointerEvent<HTMLElement>) => {
    if (dragging.current !== event.pointerId) return
    dragging.current = null
    setPreview(null)
  }

  return <>
    <nav className="library-letter-index" aria-label="乐谱首字母索引"
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return
        dragging.current = event.pointerId
        event.currentTarget.setPointerCapture(event.pointerId)
        track(event)
      }}
      onPointerMove={event => { if (dragging.current === event.pointerId) track(event) }}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
      {initials.map(initial => <button type="button" key={initial} data-initial={initial}
        aria-label={initial === '☆' ? '跳至本地作品' : `跳至 ${initial} 组`}
        aria-current={active === initial ? 'location' : undefined}
        onClick={() => { if (dragging.current === null) jump(initial) }}>
        {initial}
      </button>)}
    </nav>
    {preview && <div className="library-index-preview" aria-hidden="true">{preview}</div>}
  </>
}
