import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

const navActions = {
  tools: { label: '练琴工具', path: 'M14 6a5 5 0 0 0-6 6L3 17a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4 3-3Z' },
  sort: { label: '排序', path: 'M4 6h12M4 12h8M4 18h4M18 10v10m-3-3 3 3 3-3' },
  previous: { label: '上一曲', path: 'm14 6-6 6 6 6M5 6v12' },
  next: { label: '下一曲', path: 'm10 6 6 6-6 6M19 6v12' },
  print: { label: '打印', path: 'M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7ZM16 11h1' },
  edit: { label: '编辑', path: 'm15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14ZM4 20h16' },
  library: { label: '乐谱库', path: 'M3 4h5v16H3ZM10 4h5v16h-5ZM17 5l4-1 3 15-4 1Z' },
  guide: { label: '指南', path: 'M12 5C9 3 6 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1ZM12 5v15M6 8h3M6 12h3M15 8h3M15 12h3' },
  manual: { label: '手册', path: 'M5 3h14v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM5 3v18M11 3v8l3-2 3 2V3M9 16h6' },
}

export function NavActionIcon({ action }: { action: keyof typeof navActions }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={navActions[action].path} /></svg>
}

export function NavActionContent({ action }: { action: keyof typeof navActions }) {
  return <><NavActionIcon action={action} /><span className="nav-action-label">{navActions[action].label}</span></>
}

export function TopNav({ actions, libraryTo = '/scores', libraryLabel = '乐谱库' }: { actions?: ReactNode; libraryTo?: string; libraryLabel?: string }) {
  return (
    <header className="top-nav">
      <NavLink to="/" className="brand-mark">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} width="28" height="28" alt="" aria-hidden="true" />
        <span>M3N</span>
      </NavLink>
      <nav aria-label="主导航">
        {actions}
        <NavLink to="/tools" aria-label="练琴工具" title="练琴工具"><NavActionContent action="tools" /></NavLink>
        <NavLink to={libraryTo} aria-label={libraryLabel} title={libraryLabel}><NavActionIcon action="library" /><span className="nav-action-label">{libraryLabel}</span></NavLink>
      </nav>
    </header>
  )
}
