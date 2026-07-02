import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react'
import { renderPagePreview } from './pdf'
import type { DocumentPage } from './types'

type EditAction = 'rotate' | 'grayscale' | 'duplicate' | 'remove'

interface PageViewerProps {
  pages: DocumentPage[]
  pageId: string
  onPageChange: (id: string) => void
  onEdit: (id: string, action: EditAction) => void
  onDelete: (id: string) => void
  onClose: () => void
}

const clamp = (value: number) => Math.min(400, Math.max(25, value))

export default function PageViewer({ pages, pageId, onPageChange, onEdit, onDelete, onClose }: PageViewerProps) {
  const pageIndex = pages.findIndex(page => page.id === pageId)
  const page = pages[pageIndex]
  const [zoom, setZoom] = useState(100)
  const [fitMode, setFitMode] = useState(true)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [source, setSource] = useState(page?.previewUrl ?? '')
  const [rendering, setRendering] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ distance: 0, zoom: 100, x: 0, y: 0 })

  const changeZoom = useCallback((next: number) => {
    setFitMode(false)
    setZoom(clamp(Math.round(next)))
  }, [])

  const fitPage = useCallback(() => {
    if (!page || !viewportRef.current) return
    const bounds = viewportRef.current.getBoundingClientRect()
    const rotated = page.rotation === 90 || page.rotation === 270
    const width = rotated ? page.height : page.width
    const height = rotated ? page.width : page.height
    const fitted = Math.min((bounds.width - 56) / width, (bounds.height - 56) / height, 1) * 100
    setZoom(clamp(fitted))
    setFitMode(true)
    setPan({ x: 0, y: 0 })
  }, [page])

  useLayoutEffect(() => { fitPage() }, [pageId, page?.rotation, fitPage])

  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => { document.body.style.overflow = previousOverflow; restoreFocusRef.current?.focus() }
  }, [])

  useEffect(() => {
    if (!page) return
    const controller = new AbortController()
    if (page.sourceType === 'pdf') setRendering(true)
    const scale = Math.max(1, zoom / 100 * 2)
    void renderPagePreview(page, scale, controller.signal).then(url => setSource(url)).catch(error => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setSource(page.previewUrl)
    }).finally(() => { if (!controller.signal.aborted) setRendering(false) })
    for (const neighbor of [pages[pageIndex - 1], pages[pageIndex + 1]]) if (neighbor?.sourceType === 'pdf') void renderPagePreview(neighbor, 1.5, controller.signal).catch(() => undefined)
    return () => controller.abort()
  }, [page, pageIndex, pages, zoom])

  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      else if (event.key === '+' || event.key === '=') changeZoom(zoom + 25)
      else if (event.key === '-') changeZoom(zoom - 25)
      else if (event.key.toLowerCase() === 'r' && page) onEdit(page.id, 'rotate')
      else if (event.key === 'ArrowLeft' && pageIndex > 0) onPageChange(pages[pageIndex - 1].id)
      else if (event.key === 'ArrowRight' && pageIndex < pages.length - 1) onPageChange(pages[pageIndex + 1].id)
      else if (event.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]'))
        if (!focusable.length) return
        const first = focusable[0], last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', keyDown)
    return () => window.removeEventListener('keydown', keyDown)
  }, [changeZoom, onClose, onEdit, onPageChange, page, pageIndex, pages, zoom])

  if (!page) return null

  function wheel(event: WheelEvent) {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    changeZoom(zoom + (event.deltaY < 0 ? 15 : -15))
  }

  function pointerDown(event: ReactPointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 1) gesture.current = { ...gesture.current, x: event.clientX - pan.x, y: event.clientY - pan.y }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = { ...gesture.current, distance: Math.hypot(a.x - b.x, a.y - b.y), zoom }
    }
  }

  function pointerMove(event: ReactPointerEvent) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 1 && !fitMode) setPan({ x: event.clientX - gesture.current.x, y: event.clientY - gesture.current.y })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      if (gesture.current.distance) changeZoom(gesture.current.zoom * distance / gesture.current.distance)
    }
  }

  function pointerUp(event: ReactPointerEvent) { pointers.current.delete(event.pointerId) }
  const previous = pageIndex > 0 ? pages[pageIndex - 1] : null
  const next = pageIndex < pages.length - 1 ? pages[pageIndex + 1] : null

  return <div className="viewer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`Full view of ${page.name}`} ref={dialogRef} tabIndex={-1}>
      <header className="viewer-header">
        <div className="viewer-title"><strong>{page.name}</strong><span>Page {pageIndex + 1} of {pages.length}{page.sourceType === 'pdf' ? ` · source page ${(page.sourcePage ?? 0) + 1}` : ''}</span></div>
        <div className="viewer-tools" aria-label="Zoom controls">
          <button aria-label="Zoom out" onClick={() => changeZoom(zoom - 25)}>−</button>
          <button className="zoom-value" aria-label={`Zoom ${Math.round(zoom)} percent`} onClick={() => changeZoom(100)}>{Math.round(zoom)}%</button>
          <button aria-label="Zoom in" onClick={() => changeZoom(zoom + 25)}>＋</button>
          <button className={fitMode ? 'active' : ''} onClick={fitPage}>Fit</button>
          <button onClick={() => changeZoom(100)}>100%</button>
        </div>
        <button className="viewer-close" aria-label="Close full-page viewer" onClick={onClose}>×</button>
      </header>
      <div className={`viewer-stage ${fitMode ? 'fit' : 'pannable'}`} ref={viewportRef} onWheel={wheel} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onDoubleClick={() => fitMode ? changeZoom(Math.max(100, zoom * 2)) : fitPage()}>
        {rendering && <span className="viewer-loading">Rendering high-resolution page…</span>}
        <img ref={imageRef} src={source} alt={`Full page preview of ${page.name}`} draggable={false} style={{ width: page.width, height: page.height, transform: `translate(${pan.x}px, ${pan.y}px) rotate(${page.rotation}deg) scale(${zoom / 100})`, filter: page.grayscale ? 'grayscale(1)' : 'none' }} />
        <button className="viewer-nav previous" aria-label="Previous page" disabled={!previous} onClick={event => { event.stopPropagation(); if (previous) onPageChange(previous.id) }}>‹</button>
        <button className="viewer-nav next" aria-label="Next page" disabled={!next} onClick={event => { event.stopPropagation(); if (next) onPageChange(next.id) }}>›</button>
      </div>
      <footer className="viewer-footer">
        <div><button onClick={() => onEdit(page.id, 'rotate')}>↻ Rotate</button><button className={page.grayscale ? 'active' : ''} onClick={() => onEdit(page.id, 'grayscale')}>◐ Grayscale</button><button onClick={() => onEdit(page.id, 'duplicate')}>⧉ Duplicate</button></div>
        <button className="viewer-delete" onClick={() => onDelete(page.id)}>× Delete page</button>
      </footer>
    </div>
  </div>
}
