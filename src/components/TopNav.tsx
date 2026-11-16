import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

export function TopNav({ actions }: { actions?: ReactNode }) {
  return (
    <header className={actions ? 'top-nav has-actions' : 'top-nav'}>
      <NavLink to="/" className="brand-mark">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} width="28" height="28" alt="" aria-hidden="true" />
        <span>M3N</span>
      </NavLink>
      {actions}
      <nav aria-label="主导航">
        <NavLink to="/scores">乐谱库</NavLink>
        <NavLink to="/docs">文档</NavLink>
      </nav>
    </header>
  )
}
