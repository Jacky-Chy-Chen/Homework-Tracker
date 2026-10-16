export type SidebarMode = 'phone' | 'tablet' | 'desktop'
export interface SidebarPreferences { desktop?: boolean; tablet?: boolean }
export interface SidebarState {
  mode: SidebarMode
  desktopExpanded: boolean
  tabletExpanded: boolean
  phoneOpen: boolean
}
export const SIDEBAR_KEYS = { desktop: 'classboard-sidebar-desktop', tablet: 'classboard-sidebar-tablet' } as const
export const sidebarMode = (width: number): SidebarMode => width < 768 ? 'phone' : width < 1024 ? 'tablet' : 'desktop'

export function readSidebarPreferences(storage: Pick<Storage, 'getItem'>): SidebarPreferences {
  const preferences: SidebarPreferences = {}
  for (const mode of ['desktop', 'tablet'] as const) {
    try {
      const value = storage.getItem(SIDEBAR_KEYS[mode])
      if (value === 'expanded' || value === 'collapsed') preferences[mode] = value === 'expanded'
    } catch { /* Private browsing/storage restrictions must not block navigation. */ }
  }
  return preferences
}
export function saveSidebarPreference(storage: Pick<Storage, 'setItem'>, mode: 'desktop' | 'tablet', expanded: boolean) {
  try { storage.setItem(SIDEBAR_KEYS[mode], expanded ? 'expanded' : 'collapsed') } catch { /* Keep the current in-memory choice. */ }
}
export function initialSidebarState(width: number, preferences: SidebarPreferences = {}): SidebarState {
  return { mode: sidebarMode(width), desktopExpanded: preferences.desktop ?? true, tabletExpanded: preferences.tablet ?? false, phoneOpen: false }
}
export type SidebarAction = { type: 'resize'; width: number } | { type: 'toggle' } | { type: 'close' }
export function sidebarReducer(state: SidebarState, action: SidebarAction): SidebarState {
  if (action.type === 'resize') {
    const mode = sidebarMode(action.width)
    return mode === state.mode ? state : { ...state, mode, phoneOpen: false }
  }
  if (action.type === 'close') {
    if (state.mode === 'phone') return state.phoneOpen ? { ...state, phoneOpen: false } : state
    if (state.mode === 'tablet') return state.tabletExpanded ? { ...state, tabletExpanded: false } : state
    return state
  }
  if (state.mode === 'phone') return { ...state, phoneOpen: !state.phoneOpen }
  if (state.mode === 'tablet') return { ...state, tabletExpanded: !state.tabletExpanded }
  return { ...state, desktopExpanded: !state.desktopExpanded }
}
export function sidebarLayout(state: SidebarState) {
  const expanded = state.mode === 'phone' || (state.mode === 'desktop' ? state.desktopExpanded : state.tabletExpanded)
  return {
    expanded,
    visible: state.mode !== 'phone' || state.phoneOpen,
    overlay: state.mode === 'phone' ? state.phoneOpen : state.mode === 'tablet' && expanded,
    width: expanded ? 220 : 60,
    offset: state.mode === 'phone' ? 0 : state.mode === 'tablet' ? 60 : expanded ? 220 : 60,
  }
}
