type SourceEditorProps = {
  value: string
  onChange: (value: string) => void
}

export function SourceEditor({ value, onChange }: SourceEditorProps) {
  return (
    <label className="editor-shell">
      <span className="pane-label">M3N 编辑器</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        placeholder="{1=C} {4/4}\n1 2 3 4 | 5 6 7 1e |||"
      />
    </label>
  )
}
