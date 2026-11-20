import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'

export function WorksLayout() {
  useEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    const previous = existing?.content
    const meta = existing ?? document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    if (!existing) document.head.append(meta)
    return () => {
      if (existing) meta.content = previous ?? ''
      else meta.remove()
    }
  }, [])
  return <Outlet />
}
