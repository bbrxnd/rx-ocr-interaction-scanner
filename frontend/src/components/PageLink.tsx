import type { MouseEvent, ReactNode } from 'react'
import { goTo, pathOf, usePage } from '../lib/router'
import type { Page } from '../lib/router'

type Props = { to: Page; className?: string; children: ReactNode }

export default function PageLink({ to, className, children }: Props) {
  const page = usePage()

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    // Ctrl/Cmd/Shift-click and middle-click still open a new tab or window as usual
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    goTo(to)
  }

  return (
    <a href={pathOf(to)} className={className} aria-current={page === to ? 'page' : undefined} onClick={handleClick}>
      {children}
    </a>
  )
}