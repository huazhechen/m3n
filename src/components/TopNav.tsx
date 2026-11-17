import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

const navActions = {
  previous: { label: '上一曲', path: 'm14 6-6 6 6 6M5 6v12' },
  next: { label: '下一曲', path: 'm10 6 6 6-6 6M19 6v12' },
  print: { label: '打印', path: 'M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7ZM16 11h1' },
  edit: { label: '编辑', path: 'm15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14ZM4 20h16' },
  library: { label: '乐谱库', path: 'M3 4h5v16H3ZM10 4h5v16h-5ZM17 5l4-1 3 15-4 1Z' },
}

export function NavActionIcon({ action }: { action: keyof typeof navActions }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={navActions[action].path} /></svg>
}

export function NavActionContent({ action }: { action: keyof typeof navActions }) {
  return <><NavActionIcon action={action} /><span className="nav-action-label">{navActions[action].label}</span></>
}

export function TopNav({ actions }: { actions?: ReactNode }) {
  return (
    <header className="top-nav">
      <NavLink to="/" className="brand-mark">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} width="28" height="28" alt="" aria-hidden="true" />
        <span>M3N</span>
      </NavLink>
      <nav aria-label="主导航">
        {actions}
        <NavLink to="/scores" aria-label="乐谱库" title="乐谱库"><NavActionContent action="library" /></NavLink>
      </nav>
    </header>
  )
}
