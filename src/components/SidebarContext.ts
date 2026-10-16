import { createContext } from 'react'
import type { RefObject } from 'react'
import type { SidebarMode } from '../lib/sidebar'

export const SidebarContext = createContext<{
  mode: SidebarMode
  open: boolean
  toggle: () => void
  menuRef: RefObject<HTMLButtonElement>
} | null>(null)
