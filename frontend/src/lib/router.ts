import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { prefersReducedMotion } from './motion'

// A tiny two-page router: "/" is the checker and "/how-it-works" is the guide.
export type Page = 'check' | 'how-it-works'

const PATHS: Record<Page, string> = { check: '/', 'how-it-works': '/how-it-works' }
const listeners = new Set<() => void>()

function currentPage(): Page {
  return window.location.pathname.replace(/\/+$/, '') === PATHS['how-it-works'] ? 'how-it-works' : 'check'
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('popstate', listener) // the browser's back and forward buttons
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

export function usePage(): Page {
  return useSyncExternalStore(subscribe, currentPage)
}

export function pathOf(page: Page): string {
  return PATHS[page]
}

export function goTo(page: Page) {
  if (page === currentPage()) {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'instant' : 'smooth' })
    return
  }
  const show = () => {
    flushSync(() => {
      window.history.pushState(null, '', PATHS[page])
      listeners.forEach((listener) => listener())
    })
    window.scrollTo({ top: 0, behavior: 'instant' })
    // Move keyboard and screen reader focus to the new page's title
    document.getElementById('page-title')?.focus({ preventScroll: true })
  }
  if (document.startViewTransition && !prefersReducedMotion()) {
    document.startViewTransition(show)
  } else {
    show()
  }
}