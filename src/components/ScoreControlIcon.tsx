export type ScoreControlIconName = 'play' | 'pause' | 'metronome' | 'settings' | 'piano' | 'synth' | 'harmonica' | 'guitar' | 'violin' | 'flute' | 'paged' | 'fixedDo' | 'measureNumbers' | 'staff' | 'reset'

export function ScoreControlIcon({ name }: { name: ScoreControlIconName }) {
  const shapes = {
    play: <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />,
    pause: <path d="M8 5v14M16 5v14" strokeWidth="4" />,
    metronome: <path d="m9 3-5 18h16L15 3ZM8 16h8M12 16l5-9" />,
    settings: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="2" fill="currentColor" stroke="none" /></>,
    piano: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7.5 13v7m4.5-7v7m4.5-7v7M7 4v8h3V4m4 0v8h3V4" /></>,
    synth: <><path d="M3 12c3-12 6 12 9 0s6 12 9 0M4 20h16" /></>,
    harmonica: <><rect x="2" y="7" width="20" height="10" rx="2" /><path d="M5 10v4m3-4v4m3-4v4m3-4v4m3-4v4m3-4v4" /></>,
    guitar: <><path d="m14 10 6-7 2 2-7 6c3 4 0 9-4 10-4 1-8-3-7-7 1-3 4-4 6-3l3-3Z" /><circle cx="10" cy="15" r="2" /><path d="m10 15 11-11" /></>,
    violin: <><path d="m13 9 5-7 2 1-5 7c2 1 2 3 0 4 2 3 0 6-3 7-3 1-7-2-6-5-2-2-1-4 2-4 0-3 2-4 5-3Z" /><path d="m10 17 8-13M3 19 16 3" /></>,
    flute: <><path d="m4 19 15-15 2 2L6 21ZM16 7l2 2M7 16l2 2m0-5 2 2m0-5 2 2m0-5 2 2" /></>,
    paged: <><rect x="3" y="3" width="14" height="17" rx="2" /><path d="M7 7h6M7 11h6M7 15h4M17 7h4v14H7" /></>,
    staff: <><path d="M2 5h20M2 9h20M2 13h20M2 17h20M2 21h20M15 15V3" /><ellipse cx="12" cy="16" rx="3" ry="2" fill="currentColor" /></>,
    fixedDo: <text x="12" y="20" textAnchor="middle" fontSize="26" fill="currentColor" stroke="none">♯</text>,
    measureNumbers: <path d="M4 4v16M20 4v16M4 8h16M4 16h16M10 10h2v4m-2 0h4" />,
    reset: <path d="M9 4 5 8l4 4M5 8h8a7 7 0 1 1-6.5 9.6" />,
  }
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>
}
