import { describe, expect, it } from 'vitest'
import { documentHistoryReducer, initialHistory } from './documentReducer'
import type { DocumentPage } from './types'

const page = (id: string): DocumentPage => ({ id, sourceId: id, name: `${id}.jpg`, sourceType: 'image', bytes: new Uint8Array(), previewUrl: '', width: 10, height: 20, rotation: 0, grayscale: false, textOverlays: [], imageOverlays: [] })

describe('documentHistoryReducer', () => {
  it('adds, undoes, and redoes pages', () => {
    const added = documentHistoryReducer(initialHistory, { type: 'ADD_PAGES', pages: [page('a')] })
    const undone = documentHistoryReducer(added, { type: 'UNDO' })
    expect(undone.present.pages).toHaveLength(0)
    expect(documentHistoryReducer(undone, { type: 'REDO' }).present.pages[0].id).toBe('a')
  })

  it('preserves selected-page order when duplicating', () => {
    const state = documentHistoryReducer(initialHistory, { type: 'RESET', pages: [page('a'), page('b'), page('c')] })
    const result = documentHistoryReducer(state, { type: 'DUPLICATE', ids: ['a', 'c'] })
    expect(result.present.pages.map(item => item.name)).toEqual(['a.jpg', 'a.jpg copy', 'b.jpg', 'c.jpg', 'c.jpg copy'])
  })

  it('clears redo after a new action', () => {
    const added = documentHistoryReducer(initialHistory, { type: 'ADD_PAGES', pages: [page('a')] })
    const undone = documentHistoryReducer(added, { type: 'UNDO' })
    const changed = documentHistoryReducer(undone, { type: 'ADD_PAGES', pages: [page('b')] })
    expect(changed.future).toHaveLength(0)
  })

  it('limits history to fifty actions', () => {
    let state = initialHistory
    for (let index = 0; index < 60; index++) state = documentHistoryReducer(state, { type: 'ADD_PAGES', pages: [page(String(index))] })
    expect(state.past).toHaveLength(50)
  })

  it('creates, updates, deletes, and undoes text overlays', () => {
    const base = documentHistoryReducer(initialHistory, { type: 'RESET', pages: [page('a')] })
    const overlay = { id: 'text-1', text: 'Hello', x: .1, y: .2, width: .3, height: .1, fontFamily: 'sans' as const, fontSize: .03, color: '#000000', backgroundColor: null, backgroundOpacity: 1, padding: .01, borderRadius: .01, bold: false, italic: false, align: 'left' as const, zIndex: 1000 }
    const added = documentHistoryReducer(base, { type: 'ADD_TEXT', pageId: 'a', overlay })
    const updated = documentHistoryReducer(added, { type: 'UPDATE_TEXT', pageId: 'a', overlayId: overlay.id, patch: { text: 'Selamat datang', bold: true } })
    expect(updated.present.pages[0].textOverlays[0]).toMatchObject({ text: 'Selamat datang', bold: true })
    const deleted = documentHistoryReducer(updated, { type: 'DELETE_TEXT', pageId: 'a', overlayId: overlay.id })
    expect(deleted.present.pages[0].textOverlays).toHaveLength(0)
    expect(documentHistoryReducer(deleted, { type: 'UNDO' }).present.pages[0].textOverlays).toHaveLength(1)
  })

  it('edits inserted images without losing transparent asset bytes', () => {
    const base = documentHistoryReducer(initialHistory, { type: 'RESET', pages: [page('a')] })
    const bytes = new Uint8Array([137, 80, 78, 71])
    const overlay = { id: 'image-1', assetId: 'asset-1', name: 'overlay.png', mimeType: 'image/png' as const, bytes, previewUrl: 'blob:test', naturalWidth: 100, naturalHeight: 80, x: .2, y: .2, width: .4, height: .3, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1, opacity: 1, grayscale: false, zIndex: 1 }
    const added = documentHistoryReducer(base, { type: 'ADD_IMAGES', pageId: 'a', overlays: [overlay] })
    const cropped = documentHistoryReducer(added, { type: 'UPDATE_IMAGE', pageId: 'a', overlayId: overlay.id, patch: { cropX: .1, cropWidth: .8, opacity: .5, grayscale: true } })
    expect(cropped.present.pages[0].imageOverlays[0]).toMatchObject({ cropX: .1, cropWidth: .8, opacity: .5, grayscale: true, mimeType: 'image/png' })
    expect(cropped.present.pages[0].imageOverlays[0].bytes).toBe(bytes)
    expect(documentHistoryReducer(cropped, { type: 'UNDO' }).present.pages[0].imageOverlays[0].cropWidth).toBe(1)
  })
})
