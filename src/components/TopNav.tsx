import { NavLink } from 'react-router-dom'

export function TopNav() {
  return (
    <header className="top-nav">
      <NavLink to="/" className="brand-mark">
        <img src="/favicon.svg" width="28" height="28" alt="" aria-hidden="true" />
        <span>M3N</span>
      </NavLink>
      <nav aria-label="主导航">
        <NavLink to="/scores">乐谱库</NavLink>
        <NavLink to="/docs">文档</NavLink>
      </nav>
    </header>
  )
}
