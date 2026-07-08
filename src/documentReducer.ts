import { arrayMove } from '@dnd-kit/sortable'
import type { DocumentAction, DocumentState, HistoryState } from './types'
import appConfig from './app.config'

export const initialHistory: HistoryState = { past: [], present: { pages: [] }, future: [] }
const HISTORY_LIMIT = appConfig.limits.undoHistory

function update(state: DocumentState, action: Exclude<DocumentAction, { type: 'UNDO' | 'REDO' | 'RESET' }>): DocumentState {
  const pages = state.pages
  switch (action.type) {
    case 'ADD_PAGES': return { pages: [...pages, ...action.pages] }
    case 'CLEAR': return { pages: [] }
    case 'REORDER': return action.from === action.to ? state : { pages: arrayMove(pages, action.from, action.to) }
    case 'ROTATE': {
      const ids = new Set(action.ids)
      return { pages: pages.map(page => ids.has(page.id) ? { ...page, rotation: ((page.rotation + 90) % 360) as typeof page.rotation } : page) }
    }
    case 'SET_GRAYSCALE': {
      const ids = new Set(action.ids)
      return { pages: pages.map(page => ids.has(page.id) ? { ...page, grayscale: action.value } : page) }
    }
    case 'DELETE': {
      const ids = new Set(action.ids)
      return { pages: pages.filter(page => !ids.has(page.id)) }
    }
    case 'DUPLICATE': {
      const ids = new Set(action.ids)
      const result = []
      for (const page of pages) {
        result.push(page)
        if (ids.has(page.id)) result.push({ ...page, id: crypto.randomUUID(), name: `${page.name} copy` })
      }
      return { pages: result }
    }
    case 'ADD_TEXT': return { pages: pages.map(page => page.id === action.pageId ? { ...page, textOverlays: [...page.textOverlays, action.overlay] } : page) }
    case 'UPDATE_TEXT': return { pages: pages.map(page => page.id === action.pageId ? { ...page, textOverlays: page.textOverlays.map(overlay => overlay.id === action.overlayId ? { ...overlay, ...action.patch } : overlay) } : page) }
    case 'DELETE_TEXT': return { pages: pages.map(page => page.id === action.pageId ? { ...page, textOverlays: page.textOverlays.filter(overlay => overlay.id !== action.overlayId) } : page) }
    case 'DUPLICATE_TEXT': return { pages: pages.map(page => {
      if (page.id !== action.pageId) return page
      const source = page.textOverlays.find(overlay => overlay.id === action.overlayId)
      if (!source) return page
      return { ...page, textOverlays: [...page.textOverlays, { ...source, id: crypto.randomUUID(), x: Math.min(.95 - source.width, source.x + .025), y: Math.min(.95 - source.height, source.y + .025) }] }
    }) }
    case 'ADD_IMAGES': return { pages: pages.map(page => page.id === action.pageId ? { ...page, imageOverlays: [...page.imageOverlays, ...action.overlays] } : page) }
    case 'UPDATE_IMAGE': return { pages: pages.map(page => page.id === action.pageId ? { ...page, imageOverlays: page.imageOverlays.map(overlay => overlay.id === action.overlayId ? { ...overlay, ...action.patch } : overlay) } : page) }
    case 'DELETE_IMAGE': return { pages: pages.map(page => page.id === action.pageId ? { ...page, imageOverlays: page.imageOverlays.filter(overlay => overlay.id !== action.overlayId) } : page) }
    case 'DUPLICATE_IMAGE': return { pages: pages.map(page => {
      if (page.id !== action.pageId) return page
      const source = page.imageOverlays.find(overlay => overlay.id === action.overlayId)
      if (!source) return page
      return { ...page, imageOverlays: [...page.imageOverlays, { ...source, id: crypto.randomUUID(), x: Math.min(1 - source.width, source.x + .025), y: Math.min(1 - source.height, source.y + .025), zIndex: Math.max(0, ...page.imageOverlays.map(item => item.zIndex), ...page.textOverlays.map(item => item.zIndex)) + 1 }] }
    }) }
    case 'MOVE_IMAGE_LAYER': return { pages: pages.map(page => {
      if (page.id !== action.pageId) return page
      const elements = [...page.imageOverlays.map(item => ({ id: item.id, kind: 'image' as const, zIndex: item.zIndex })), ...page.textOverlays.map(item => ({ id: item.id, kind: 'text' as const, zIndex: item.zIndex }))].sort((a, b) => a.zIndex - b.zIndex)
      const index = elements.findIndex(item => item.kind === 'image' && item.id === action.overlayId)
      const swapIndex = action.direction === 'forward' ? index + 1 : index - 1
      if (index < 0 || swapIndex < 0 || swapIndex >= elements.length) return page
      const currentZ = elements[index].zIndex, otherZ = elements[swapIndex].zIndex
      return { ...page, imageOverlays: page.imageOverlays.map(item => item.id === action.overlayId ? { ...item, zIndex: otherZ } : item.id === elements[swapIndex].id && elements[swapIndex].kind === 'image' ? { ...item, zIndex: currentZ } : item), textOverlays: page.textOverlays.map(item => item.id === elements[swapIndex].id && elements[swapIndex].kind === 'text' ? { ...item, zIndex: currentZ } : item) }
    }) }
  }
}

export function documentHistoryReducer(history: HistoryState, action: DocumentAction): HistoryState {
  if (action.type === 'RESET') return { past: [], present: { pages: action.pages }, future: [] }
  if (action.type === 'UNDO') {
    const previous = history.past.at(-1)
    if (!previous) return history
    return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future].slice(0, HISTORY_LIMIT) }
  }
  if (action.type === 'REDO') {
    const next = history.future[0]
    if (!next) return history
    return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: next, future: history.future.slice(1) }
  }
  const next = update(history.present, action)
  if (next === history.present || next.pages.every((page, index) => page === history.present.pages[index]) && next.pages.length === history.present.pages.length) return history
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: next, future: [] }
}
