import { useState } from 'react'
import { prefersReducedMotion } from '../lib/motion'
import { MoonIcon, SunIcon } from './icons'

type Theme = 'light' | 'dark'

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem('theme', theme)
  } catch {
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  const dark = theme === 'dark'

  function toggle() {
    const next: Theme = dark ? 'light' : 'dark'
    setTheme(next)
    if (document.startViewTransition && !prefersReducedMotion()) {
      document.startViewTransition(() => applyTheme(next))
    } else {
      applyTheme(next)
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label="Dark mode"
      aria-pressed={dark}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggle}
    >
      <SunIcon size={16} />
      <MoonIcon size={16} />
    </button>
  )
}