export type WorkspaceMode = 'editor' | 'compare' | 'staff'

type ModeSwitcherProps = {
  mode: WorkspaceMode
  onChange: (mode: WorkspaceMode) => void
}

const modes: Array<{ id: WorkspaceMode; label: string }> = [
  { id: 'editor', label: '编辑器模式' },
  { id: 'compare', label: '对照模式' },
  { id: 'staff', label: '五线谱模式' },
]

export function ModeSwitcher({ mode, onChange }: ModeSwitcherProps) {
  return (
    <div className="mode-switcher" role="tablist" aria-label="渲染模式">
      {modes.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === mode}
          className={item.id === mode ? 'active' : ''}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
