import { NavLink } from 'react-router-dom'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export function TopNav({ actions }: { actions?: ReactNode }) {
  const menuId = useId()
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 721px)')
    const close = () => { if (desktop.matches && menuRef.current?.matches(':popover-open')) menuRef.current.hidePopover() }
    desktop.addEventListener('change', close)
    return () => desktop.removeEventListener('change', close)
  }, [])
  return (
    <header className={actions ? 'top-nav has-actions' : 'top-nav'}>
      <NavLink to="/" className="brand-mark">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} width="28" height="28" alt="" aria-hidden="true" />
        <span>M3N</span>
      </NavLink>
      <div ref={menuRef} id={menuId} popover="auto" className="top-nav-menu" onToggle={event => setMenuOpen(event.newState === 'open')} onClick={event => {
        if ((event.target as Element).closest('a, button') && menuRef.current?.matches(':popover-open')) menuRef.current.hidePopover()
      }}>
        <nav aria-label="主导航">
          <NavLink to="/scores">乐谱库</NavLink>
          <NavLink to="/docs">文档</NavLink>
        </nav>
        {actions}
      </div>
      <button type="button" className="top-nav-menu-toggle" aria-label="页面菜单" aria-expanded={menuOpen} aria-controls={menuId} popoverTarget={menuId}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
    </header>
  )
}
