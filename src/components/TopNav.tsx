import { NavLink } from 'react-router-dom'

export function TopNav() {
  return (
    <header className="top-nav">
      <NavLink to="/" className="brand-mark">
        M3N
      </NavLink>
      <nav aria-label="主导航">
        <NavLink to="/editor">在线编辑</NavLink>
        <NavLink to="/scores">乐谱库</NavLink>
        <NavLink to="/docs">文档</NavLink>
      </nav>
    </header>
  )
}
