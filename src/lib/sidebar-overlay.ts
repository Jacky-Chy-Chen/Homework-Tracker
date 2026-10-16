/** DOM-only effects, kept separate so keyboard/scroll behavior can be tested without a browser. */
export function activateSidebarOverlay(drawer: HTMLElement, close: () => void, returnTarget: () => HTMLElement | null) {
  const body = document.body
  const keys = ['overflow', 'position', 'top', 'left', 'right', 'width', 'paddingRight'] as const
  const before = Object.fromEntries(keys.map(key => [key, body.style[key]]))
  const x = window.scrollX, y = window.scrollY
  const gap = Math.max(0, window.innerWidth - document.documentElement.clientWidth)
  const padding = parseFloat(window.getComputedStyle(body).paddingRight) || 0
  Object.assign(body.style, { overflow: 'hidden', position: 'fixed', top: `${-y}px`, left: '0', right: '0', width: '100%' })
  if (gap) body.style.paddingRight = `${padding + gap}px`

  const focusable = () => Array.from(drawer.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
    .filter(element => !element.closest('[hidden],[inert]') && window.getComputedStyle(element).display !== 'none' && window.getComputedStyle(element).visibility !== 'hidden')
  const focusFirst = () => (focusable()[0] ?? drawer).focus({ preventScroll: true })
  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
    if (event.key !== 'Tab') return
    const elements = focusable(), first = elements[0], last = elements[elements.length - 1]
    const active = document.activeElement
    if (!first) { event.preventDefault(); drawer.focus({ preventScroll: true }); return }
    if (event.shiftKey && (active === first || !drawer.contains(active))) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && (active === last || !drawer.contains(active))) { event.preventDefault(); first.focus() }
  }
  const focusin = (event: FocusEvent) => { if (!drawer.contains(event.target as Node)) focusFirst() }
  document.addEventListener('keydown', keydown, true)
  document.addEventListener('focusin', focusin)
  drawer.scrollTop = 0
  focusFirst()
  return () => {
    document.removeEventListener('keydown', keydown, true)
    document.removeEventListener('focusin', focusin)
    for (const key of keys) body.style[key] = before[key]
    window.scrollTo(x, y)
    // Wait for route changes/ref assignments and removal of inert to finish.
    queueMicrotask(() => {
      const target = returnTarget()
      if (target?.isConnected) target.focus({ preventScroll: true })
    })
  }
}
