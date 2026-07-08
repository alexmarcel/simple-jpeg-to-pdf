import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Bold, BringToFront, ChevronLeft, ChevronRight, Copy, Crop, Image as ImageIcon, ImagePlus, Italic, Maximize2, Minus, PaintBucket, Pipette, Plus, RotateCw, SendToBack, TextCursorInput, Trash2, X } from 'lucide-react'
import { renderPagePreview } from './pdf'
import type { DocumentPage, ImageOverlay, TextOverlay } from './types'
import { cropAtZoom, cropZoom, frameAtAspect, panCrop, type CropFrame } from './crop'
import { useI18n } from './i18n'

type EditAction = 'rotate' | 'grayscale' | 'duplicate' | 'remove'

interface PageViewerProps {
  pages: DocumentPage[]
  pageId: string
  onPageChange: (id: string) => void
  onEdit: (id: string, action: EditAction) => void
  onDelete: (id: string) => void
  onAddText: (pageId: string, overlay: TextOverlay) => void
  onUpdateText: (pageId: string, overlayId: string, patch: Partial<TextOverlay>) => void
  onDeleteText: (pageId: string, overlayId: string) => void
  onDuplicateText: (pageId: string, overlayId: string) => void
  onAddImages: (pageId: string, overlays: ImageOverlay[]) => void
  onUpdateImage: (pageId: string, overlayId: string, patch: Partial<ImageOverlay>) => void
  onDeleteImage: (pageId: string, overlayId: string) => void
  onDuplicateImage: (pageId: string, overlayId: string) => void
  onMoveImageLayer: (pageId: string, overlayId: string, direction: 'forward' | 'backward') => void
  onClose: () => void
}

interface ImageBoxProps {
  overlay: ImageOverlay
  page: DocumentPage
  zoom: number
  selected: boolean
  onSelect: () => void
  onUpdate: (patch: Partial<ImageOverlay>) => void
  cropMode: boolean
  onCropChange: (frame: CropFrame) => void
  onStartCrop: () => void
  freeCrop: boolean
}

function ImageBox({ overlay, page, zoom, selected, onSelect, onUpdate, cropMode, onCropChange, onStartCrop, freeCrop }: ImageBoxProps) {
  const { t } = useI18n()
  const [frame, setFrame] = useState({ x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height })
  const cropPointers = useRef(new Map<number, { x: number; y: number }>())
  const cropGesture = useRef<{ frame: CropFrame; x: number; y: number; distance: number; zoom: number } | null>(null)
  useEffect(() => setFrame({ x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height }), [overlay.x, overlay.y, overlay.width, overlay.height])
  function beginGesture(event: ReactPointerEvent, kind: 'move' | 'resize') {
    event.stopPropagation(); event.preventDefault(); onSelect(); event.currentTarget.setPointerCapture(event.pointerId)
    const start = { clientX: event.clientX, clientY: event.clientY, ...frame }
    const angle = -page.rotation * Math.PI / 180, scale = zoom / 100
    const aspect = (start.width * page.width) / (start.height * page.height)
    const move = (moveEvent: PointerEvent) => {
      const screenX = moveEvent.clientX - start.clientX, screenY = moveEvent.clientY - start.clientY
      const dx = (screenX * Math.cos(angle) - screenY * Math.sin(angle)) / scale / page.width
      const dy = (screenX * Math.sin(angle) + screenY * Math.cos(angle)) / scale / page.height
      if (kind === 'move') setFrame(current => ({ ...current, x: Math.max(0, Math.min(1 - current.width, start.x + dx)), y: Math.max(0, Math.min(1 - current.height, start.y + dy)) }))
      else {
        const width = Math.max(.06, Math.min(1 - start.x, start.width + dx))
        const height = moveEvent.shiftKey ? Math.max(.05, Math.min(1 - start.y, start.height + dy)) : Math.max(.05, Math.min(1 - start.y, width * page.width / aspect / page.height))
        setFrame({ x: start.x, y: start.y, width, height })
      }
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setFrame(current => { onUpdate(current); return current }) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true })
  }

  function cropPointerDown(event: ReactPointerEvent) {
    if (!cropMode) return
    event.stopPropagation(); event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    cropPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = [...cropPointers.current.values()]
    cropGesture.current = { frame: { ...overlay }, x: points[0].x, y: points[0].y, distance: points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0, zoom: cropZoom(overlay, page.width, page.height, overlay.naturalWidth, overlay.naturalHeight) }
  }
  function cropPointerMove(event: ReactPointerEvent) {
    if (!cropMode || !cropPointers.current.has(event.pointerId) || !cropGesture.current) return
    cropPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = [...cropPointers.current.values()], gesture = cropGesture.current
    if (points.length > 1 && gesture.distance) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
      onCropChange(cropAtZoom(gesture.frame, gesture.zoom * distance / gesture.distance, page.width, page.height, overlay.naturalWidth, overlay.naturalHeight))
    } else {
      const angle = -page.rotation * Math.PI / 180
      const sx = points[0].x - gesture.x, sy = points[0].y - gesture.y
      const localX = sx * Math.cos(angle) - sy * Math.sin(angle), localY = sx * Math.sin(angle) + sy * Math.cos(angle)
      onCropChange(panCrop(gesture.frame, localX / (overlay.width * page.width * zoom / 100), localY / (overlay.height * page.height * zoom / 100)))
    }
  }
  function cropPointerUp(event: ReactPointerEvent) { cropPointers.current.delete(event.pointerId); if (!cropPointers.current.size) cropGesture.current = null }
  function cropWheel(event: WheelEvent) {
    if (!cropMode) return
    event.stopPropagation(); event.preventDefault()
    const current = cropZoom(overlay, page.width, page.height, overlay.naturalWidth, overlay.naturalHeight)
    onCropChange(cropAtZoom(overlay, current * (event.deltaY < 0 ? 1.12 : .89), page.width, page.height, overlay.naturalWidth, overlay.naturalHeight))
  }
  function beginFreeResize(event: ReactPointerEvent) {
    event.stopPropagation(); event.preventDefault()
    const start = { x: event.clientX, y: event.clientY, frame: { ...overlay }, zoom: cropZoom(overlay, page.width, page.height, overlay.naturalWidth, overlay.naturalHeight) }
    const move = (moveEvent: PointerEvent) => {
      const width = Math.max(.06, Math.min(1 - overlay.x, overlay.width + (moveEvent.clientX - start.x) / (page.width * zoom / 100)))
      const height = Math.max(.05, Math.min(1 - overlay.y, overlay.height + (moveEvent.clientY - start.y) / (page.height * zoom / 100)))
      onCropChange(cropAtZoom({ ...start.frame, width, height }, start.zoom, page.width, page.height, overlay.naturalWidth, overlay.naturalHeight))
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true })
  }
  return <div className={`image-overlay-box ${selected ? 'selected' : ''} ${cropMode ? 'cropping' : ''}`} style={{ left: `${frame.x * 100}%`, top: `${frame.y * 100}%`, width: `${frame.width * 100}%`, height: `${frame.height * 100}%`, zIndex: overlay.zIndex }} onDoubleClick={event => { event.stopPropagation(); if (!cropMode) onStartCrop() }} onWheel={cropWheel} onPointerDown={event => { if (cropMode) cropPointerDown(event); else { event.stopPropagation(); onSelect() } }} onPointerMove={cropPointerMove} onPointerUp={cropPointerUp} onPointerCancel={cropPointerUp}>
    <img draggable={false} src={overlay.previewUrl} alt={overlay.name} style={{ left: `${-overlay.cropX / overlay.cropWidth * 100}%`, top: `${-overlay.cropY / overlay.cropHeight * 100}%`, width: `${100 / overlay.cropWidth}%`, height: `${100 / overlay.cropHeight}%`, opacity: overlay.opacity, filter: overlay.grayscale ? 'grayscale(1)' : 'none' }} />
    {selected && !cropMode && <><button className="image-move-handle" aria-label={t('moveImage')} onPointerDown={event => beginGesture(event, 'move')}><ImageIcon size={13} /></button><button className="image-resize-handle" aria-label={t('resizeImage')} onPointerDown={event => beginGesture(event, 'resize')} /></>}
    {cropMode && <div className="crop-grid" aria-hidden="true"><i /><i /><i /><i /></div>}
    {cropMode && freeCrop && <button className="crop-frame-resize" aria-label={t('resizeCrop')} onPointerDown={beginFreeResize} />}
  </div>
}

const clamp = (value: number) => Math.min(400, Math.max(25, value))
const colorWithOpacity = (hex: string | null, opacity: number) => hex ? `${hex}${Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0')}` : 'transparent'

interface TextBoxProps {
  overlay: TextOverlay
  page: DocumentPage
  zoom: number
  selected: boolean
  onSelect: () => void
  onUpdate: (patch: Partial<TextOverlay>) => void
  onDelete: () => void
}

function TextBox({ overlay, page, zoom, selected, onSelect, onUpdate, onDelete }: TextBoxProps) {
  const { t } = useI18n()
  const [frame, setFrame] = useState({ x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height })
  useEffect(() => setFrame({ x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height }), [overlay.x, overlay.y, overlay.width, overlay.height])

  function beginGesture(event: ReactPointerEvent, kind: 'move' | 'resize') {
    event.stopPropagation(); event.preventDefault(); onSelect()
    event.currentTarget.setPointerCapture(event.pointerId)
    const start = { clientX: event.clientX, clientY: event.clientY, ...frame }
    const angle = -page.rotation * Math.PI / 180
    const scale = zoom / 100
    const move = (moveEvent: PointerEvent) => {
      const screenX = moveEvent.clientX - start.clientX, screenY = moveEvent.clientY - start.clientY
      const dx = (screenX * Math.cos(angle) - screenY * Math.sin(angle)) / scale / page.width
      const dy = (screenX * Math.sin(angle) + screenY * Math.cos(angle)) / scale / page.height
      if (kind === 'move') setFrame({ ...frame, x: Math.max(0, Math.min(1 - frame.width, start.x + dx)), y: Math.max(0, Math.min(1 - frame.height, start.y + dy)) })
      else setFrame({ ...frame, width: Math.max(.08, Math.min(1 - frame.x, start.width + dx)), height: Math.max(.045, Math.min(1 - frame.y, start.height + dy)) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setFrame(current => { onUpdate(current); return current })
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true })
  }

  return <div className={`text-overlay-box ${selected ? 'selected' : ''}`} style={{ left: `${frame.x * 100}%`, top: `${frame.y * 100}%`, width: `${frame.width * 100}%`, height: `${frame.height * 100}%`, padding: `${(overlay.padding ?? 0) * page.width}px`, borderRadius: `${(overlay.borderRadius ?? 0) * page.width}px`, backgroundColor: colorWithOpacity(overlay.backgroundColor, overlay.backgroundOpacity), zIndex: overlay.zIndex }} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onSelect() }}>
    {selected && <button className="text-move-handle" aria-label={t('moveText')} onPointerDown={event => beginGesture(event, 'move')}><TextCursorInput size={13} /></button>}
    <textarea aria-label={t('textContent')} defaultValue={overlay.text} placeholder={t('typeHere')} dir="auto" autoFocus={!overlay.text} onFocus={onSelect} onBlur={event => event.target.value.trim() ? onUpdate({ text: event.target.value }) : onDelete()} style={{ color: overlay.color, fontFamily: overlay.fontFamily === 'sans' ? 'Arial, sans-serif' : overlay.fontFamily === 'serif' ? 'Georgia, serif' : 'Courier New, monospace', fontSize: `${overlay.fontSize * page.width}px`, fontWeight: overlay.bold ? 700 : 400, fontStyle: overlay.italic ? 'italic' : 'normal', textAlign: overlay.align }} />
    {selected && <button className="text-resize-handle" aria-label={t('resizeText')} onPointerDown={event => beginGesture(event, 'resize')} />}
  </div>
}

export default function PageViewer({ pages, pageId, onPageChange, onEdit, onDelete, onAddText, onUpdateText, onDeleteText, onDuplicateText, onAddImages, onUpdateImage, onDeleteImage, onDuplicateImage, onMoveImageLayer, onClose }: PageViewerProps) {
  const { t } = useI18n()
  const pageIndex = pages.findIndex(page => page.id === pageId)
  const page = pages[pageIndex]
  const [zoom, setZoom] = useState(100)
  const [fitMode, setFitMode] = useState(true)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [source, setSource] = useState(page?.previewUrl ?? '')
  const [rendering, setRendering] = useState(false)
  const [textMode, setTextMode] = useState(false)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [pickingBackground, setPickingBackground] = useState(false)
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [cropDraft, setCropDraft] = useState<CropFrame | null>(null)
  const [cropAspect, setCropAspect] = useState<'free' | 'original' | 'square' | '4:3' | '16:9'>('free')
  const dialogRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const insertImageInput = useRef<HTMLInputElement>(null)
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
  useEffect(() => { setSelectedTextId(null); setSelectedImageId(null); setCropDraft(null); setTextMode(false); setPickingBackground(false) }, [pageId])

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
      const typing = (event.target as HTMLElement).matches('textarea, input, select')
      if (event.key === 'Escape' && cropDraft) { event.preventDefault(); setCropDraft(null) }
      else if (event.key === 'Escape' && selectedTextId) { event.preventDefault(); setSelectedTextId(null); setTextMode(false) }
      else if (event.key === 'Escape' && selectedImageId) { event.preventDefault(); setSelectedImageId(null) }
      else if (event.key === 'Escape') onClose()
      else if (typing) return
      else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedTextId && page) { event.preventDefault(); onDeleteText(page.id, selectedTextId); setSelectedTextId(null) }
      else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedImageId && page) { event.preventDefault(); onDeleteImage(page.id, selectedImageId); setSelectedImageId(null); setCropDraft(null) }
      else if (selectedTextId && page && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault()
        const overlay = page.textOverlays.find(item => item.id === selectedTextId)
        if (!overlay) return
        const step = event.shiftKey ? .02 : .004
        const x = event.key === 'ArrowLeft' ? overlay.x - step : event.key === 'ArrowRight' ? overlay.x + step : overlay.x
        const y = event.key === 'ArrowUp' ? overlay.y - step : event.key === 'ArrowDown' ? overlay.y + step : overlay.y
        onUpdateText(page.id, selectedTextId, { x: Math.max(0, Math.min(1 - overlay.width, x)), y: Math.max(0, Math.min(1 - overlay.height, y)) })
      }
      else if (cropDraft && selectedImageId && page && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); const step = event.shiftKey ? .04 : .01
        setCropDraft(panCrop(cropDraft, event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0))
      }
      else if (cropDraft && selectedImageId && page && (event.key === '+' || event.key === '=' || event.key === '-')) {
        event.preventDefault(); const overlay = page.imageOverlays.find(item => item.id === selectedImageId); if (!overlay) return
        const current = cropZoom(cropDraft, page.width, page.height, overlay.naturalWidth, overlay.naturalHeight)
        setCropDraft(cropAtZoom(cropDraft, current * (event.key === '-' ? .9 : 1.1), page.width, page.height, overlay.naturalWidth, overlay.naturalHeight))
      }
      else if (cropDraft && selectedImageId && page && event.key === 'Enter') { event.preventDefault(); onUpdateImage(page.id, selectedImageId, cropDraft); setCropDraft(null) }
      else if (selectedImageId && page && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); const overlay = page.imageOverlays.find(item => item.id === selectedImageId); if (!overlay) return
        const step = event.shiftKey ? .02 : .004
        onUpdateImage(page.id, overlay.id, { x: Math.max(0, Math.min(1 - overlay.width, overlay.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0))), y: Math.max(0, Math.min(1 - overlay.height, overlay.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0))) })
      }
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
  }, [changeZoom, cropDraft, onClose, onDeleteImage, onDeleteText, onEdit, onPageChange, onUpdateImage, onUpdateText, page, pageIndex, pages, selectedImageId, selectedTextId, zoom])

  if (!page) return null

  function wheel(event: WheelEvent) {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    changeZoom(zoom + (event.deltaY < 0 ? 15 : -15))
  }

  function pointerDown(event: ReactPointerEvent) {
    if ((event.target as Element).closest('button')) return
    if (textMode || selectedTextId || selectedImageId || pickingBackground) return
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
  function pagePoint(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = viewportRef.current!.getBoundingClientRect()
    const scale = zoom / 100, angle = -page.rotation * Math.PI / 180
    const screenX = event.clientX - (bounds.left + bounds.width / 2 + pan.x), screenY = event.clientY - (bounds.top + bounds.height / 2 + pan.y)
    const localX = (screenX * Math.cos(angle) - screenY * Math.sin(angle)) / scale + page.width / 2
    const localY = (screenX * Math.sin(angle) + screenY * Math.cos(angle)) / scale + page.height / 2
    return { x: Math.max(0, Math.min(1, localX / page.width)), y: Math.max(0, Math.min(1, localY / page.height)) }
  }
  function handlePageClick(event: ReactPointerEvent<HTMLDivElement>) {
    if (!page || (event.target as Element).closest('.text-overlay-box, button')) return
    const point = pagePoint(event)
    if (pickingBackground && selectedTextId && imageRef.current) {
      const image = imageRef.current
      try {
        const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1
        const context = canvas.getContext('2d')!
        context.drawImage(image, Math.min(image.naturalWidth - 1, Math.floor(point.x * image.naturalWidth)), Math.min(image.naturalHeight - 1, Math.floor(point.y * image.naturalHeight)), 1, 1, 0, 0, 1, 1)
        let [red, green, blue] = context.getImageData(0, 0, 1, 1).data
        if (page.grayscale) { const gray = Math.round(red * .299 + green * .587 + blue * .114); red = gray; green = gray; blue = gray }
        const color = `#${[red, green, blue].map(value => value.toString(16).padStart(2, '0')).join('')}`
        onUpdateText(page.id, selectedTextId, { backgroundColor: color, backgroundOpacity: 1 })
      } catch { /* The standard color input remains available if pixel sampling fails. */ }
      setPickingBackground(false); return
    }
    if (!textMode) return
    const width = .34, height = .12
    const overlay: TextOverlay = { id: crypto.randomUUID(), text: '', x: Math.max(0, Math.min(1 - width, point.x - width / 2)), y: Math.max(0, Math.min(1 - height, point.y - height / 2)), width, height, fontFamily: 'sans', fontSize: .035, color: '#111111', backgroundColor: null, backgroundOpacity: 1, padding: .01, borderRadius: .01, bold: false, italic: false, align: 'left', zIndex: Math.max(1000, ...page.textOverlays.map(item => item.zIndex), ...page.imageOverlays.map(item => item.zIndex)) + 1 }
    onAddText(page.id, overlay); setSelectedTextId(overlay.id); setTextMode(false)
  }
  async function insertImages(files: FileList) {
    const accepted = Array.from(files).filter(file => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    const overlays: ImageOverlay[] = []
    let zIndex = Math.max(0, ...page.imageOverlays.map(item => item.zIndex))
    for (const file of accepted) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer()), bitmap = await createImageBitmap(file)
        const width = .34, height = Math.min(.45, width * page.width / (bitmap.width / bitmap.height) / page.height)
        overlays.push({ id: crypto.randomUUID(), assetId: crypto.randomUUID(), name: file.name, mimeType: file.type as ImageOverlay['mimeType'], bytes, previewUrl: URL.createObjectURL(file), naturalWidth: bitmap.width, naturalHeight: bitmap.height, x: .5 - width / 2, y: .5 - height / 2, width, height, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1, opacity: 1, grayscale: false, zIndex: ++zIndex })
        bitmap.close()
      } catch { /* Ignore an individual image that the browser cannot decode. */ }
    }
    if (overlays.length) { onAddImages(page.id, overlays); setSelectedImageId(overlays.at(-1)!.id); setSelectedTextId(null) }
  }
  function startCrop(overlay: ImageOverlay) {
    const frame: CropFrame = { x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height, cropX: overlay.cropX, cropY: overlay.cropY, cropWidth: overlay.cropWidth, cropHeight: overlay.cropHeight }
    setCropDraft(cropAtZoom(frame, Math.max(1, cropZoom(frame, page.width, page.height, overlay.naturalWidth, overlay.naturalHeight)), page.width, page.height, overlay.naturalWidth, overlay.naturalHeight)); setCropAspect('free')
  }
  const previous = pageIndex > 0 ? pages[pageIndex - 1] : null
  const next = pageIndex < pages.length - 1 ? pages[pageIndex + 1] : null

  return <div className="viewer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="viewer" role="dialog" aria-modal="true" aria-label={t('fullView', { name: page.name })} ref={dialogRef} tabIndex={-1}>
      <header className="viewer-header">
        <div className="viewer-title"><strong>{page.name}</strong><span>{t('pageOf', { current: pageIndex + 1, total: pages.length })}{page.sourceType === 'pdf' ? ` · ${t('sourcePage', { number: (page.sourcePage ?? 0) + 1 })}` : ''}</span></div>
        <div className="viewer-tools" aria-label={t('zoomControls')}>
          <button aria-label={t('zoomOut')} onClick={() => changeZoom(zoom - 25)}><Minus size={16} /></button>
          <button className="zoom-value" aria-label={t('zoomPercent', { percent: Math.round(zoom) })} onClick={() => changeZoom(100)}>{Math.round(zoom)}%</button>
          <button aria-label={t('zoomIn')} onClick={() => changeZoom(zoom + 25)}><Plus size={16} /></button>
          <button className={fitMode ? 'active' : ''} onClick={fitPage}><Maximize2 size={15} /> {t('fit')}</button>
          <button onClick={() => changeZoom(100)}>100%</button>
        </div>
        <button className="viewer-close" aria-label={t('closeViewer')} onClick={onClose}><X size={21} /></button>
      </header>
      <div className={`viewer-stage ${fitMode ? 'fit' : 'pannable'} ${textMode ? 'text-mode' : ''} ${pickingBackground ? 'color-pick-mode' : ''}`} ref={viewportRef} onWheel={wheel} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onClick={handlePageClick} onDoubleClick={() => { if (!textMode && !pickingBackground) { if (fitMode) changeZoom(Math.max(100, zoom * 2)); else fitPage() } }}>
        {rendering && <span className="viewer-loading">{t('rendering')}</span>}
        <div className="viewer-page-position" style={{ width: page.width, height: page.height, transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) rotate(${page.rotation}deg) scale(${zoom / 100})` }}>
          <img ref={imageRef} src={source} alt={`Full page preview of ${page.name}`} draggable={false} style={{ filter: page.grayscale ? 'grayscale(1)' : 'none' }} />
          <div className="page-overlay-layer">
            {page.imageOverlays.map(overlay => <ImageBox key={overlay.id} overlay={selectedImageId === overlay.id && cropDraft ? { ...overlay, ...cropDraft } : overlay} page={page} zoom={zoom} selected={selectedImageId === overlay.id} cropMode={selectedImageId === overlay.id && !!cropDraft} freeCrop={cropAspect === 'free'} onSelect={() => { setSelectedImageId(overlay.id); setSelectedTextId(null); setTextMode(false) }} onUpdate={patch => onUpdateImage(page.id, overlay.id, patch)} onCropChange={setCropDraft} onStartCrop={() => { setSelectedImageId(overlay.id); startCrop(overlay) }} />)}
            {page.textOverlays.map(overlay => <TextBox key={overlay.id} overlay={overlay} page={page} zoom={zoom} selected={selectedTextId === overlay.id} onSelect={() => { setSelectedTextId(overlay.id); setSelectedImageId(null); setCropDraft(null) }} onUpdate={patch => onUpdateText(page.id, overlay.id, patch)} onDelete={() => { onDeleteText(page.id, overlay.id); setSelectedTextId(null) }} />)}
          </div>
        </div>
        <button className="viewer-nav previous" aria-label={t('previousPage')} disabled={!previous} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); if (previous) onPageChange(previous.id) }}><ChevronLeft size={28} /></button>
        <button className="viewer-nav next" aria-label={t('nextPage')} disabled={!next} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); if (next) onPageChange(next.id) }}><ChevronRight size={28} /></button>
      </div>
      <footer className="viewer-footer">
        <div><button className={textMode ? 'active' : ''} onClick={() => { setTextMode(value => !value); setSelectedTextId(null); setSelectedImageId(null) }}><TextCursorInput size={15} /> {t('addText')}</button><button onClick={() => insertImageInput.current?.click()}><ImagePlus size={15} /> {t('insertImage')}</button><input ref={insertImageInput} hidden type="file" multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={event => { if (event.target.files) void insertImages(event.target.files); event.target.value = '' }} /><button onClick={() => onEdit(page.id, 'rotate')}><RotateCw size={15} /> {t('rotate')}</button><button className={page.grayscale ? 'active' : ''} onClick={() => onEdit(page.id, 'grayscale')}><ImageIcon size={15} /> {t('grayscale')}</button><button onClick={() => onEdit(page.id, 'duplicate')}><Copy size={15} /> {t('duplicate')}</button></div>
        <button className="viewer-delete" onClick={() => onDelete(page.id)}><Trash2 size={15} /> {t('deletePage')}</button>
      </footer>
      {selectedTextId && (() => { const overlay = page.textOverlays.find(item => item.id === selectedTextId); return overlay ? <div className="text-format-toolbar">
        <select aria-label={t('fontFamily')} value={overlay.fontFamily} onChange={event => onUpdateText(page.id, overlay.id, { fontFamily: event.target.value as TextOverlay['fontFamily'] })}><option value="sans">{t('sans')}</option><option value="serif">{t('serif')}</option><option value="mono">{t('mono')}</option></select>
        <label>{t('size')} <input type="number" min="8" max="96" value={Math.round(overlay.fontSize * 612)} onChange={event => onUpdateText(page.id, overlay.id, { fontSize: Math.max(8, Math.min(96, Number(event.target.value))) / 612 })} /></label>
        <input aria-label={t('textColor')} type="color" value={overlay.color} onChange={event => onUpdateText(page.id, overlay.id, { color: event.target.value })} />
        <span className="toolbar-divider" />
        <PaintBucket size={15} aria-hidden="true" /><input aria-label={t('backgroundColor')} type="color" value={overlay.backgroundColor ?? '#ffffff'} onChange={event => onUpdateText(page.id, overlay.id, { backgroundColor: event.target.value })} />
        <button className={pickingBackground ? 'active' : ''} aria-label={t('pickColor')} title={t('pickColorTitle')} onClick={() => { setPickingBackground(value => !value); setTextMode(false) }}><Pipette size={15} /></button>
        <label>{t('opacity')} <input className="opacity-slider" type="range" min="0" max="100" value={Math.round((overlay.backgroundOpacity ?? 1) * 100)} onChange={event => onUpdateText(page.id, overlay.id, { backgroundOpacity: Number(event.target.value) / 100, backgroundColor: overlay.backgroundColor ?? '#ffffff' })} /></label>
        <button aria-label={t('removeBackground')} title={t('noBackground')} onClick={() => onUpdateText(page.id, overlay.id, { backgroundColor: null })}><X size={14} /></button>
        <button className={overlay.bold ? 'active' : ''} aria-label={t('bold')} onClick={() => onUpdateText(page.id, overlay.id, { bold: !overlay.bold })}><Bold size={15} /></button><button className={overlay.italic ? 'active' : ''} aria-label={t('italic')} onClick={() => onUpdateText(page.id, overlay.id, { italic: !overlay.italic })}><Italic size={15} /></button>
        <button className={overlay.align === 'left' ? 'active' : ''} aria-label={t('alignLeft')} onClick={() => onUpdateText(page.id, overlay.id, { align: 'left' })}><AlignLeft size={15} /></button><button className={overlay.align === 'center' ? 'active' : ''} aria-label={t('alignCenter')} onClick={() => onUpdateText(page.id, overlay.id, { align: 'center' })}><AlignCenter size={15} /></button><button className={overlay.align === 'right' ? 'active' : ''} aria-label={t('alignRight')} onClick={() => onUpdateText(page.id, overlay.id, { align: 'right' })}><AlignRight size={15} /></button>
        <span className="text-toolbar-spacer" /><button aria-label={t('duplicateText')} onClick={() => onDuplicateText(page.id, overlay.id)}><Copy size={15} /></button><button className="danger" aria-label={t('deleteText')} onClick={() => { onDeleteText(page.id, overlay.id); setSelectedTextId(null) }}><Trash2 size={15} /></button>
      </div> : null })()}
      {selectedImageId && (() => { const overlay = page.imageOverlays.find(item => item.id === selectedImageId); return overlay ? <div className="text-format-toolbar image-format-toolbar">
        {!cropDraft ? <><button onClick={() => startCrop(overlay)}><Crop size={15} /> {t('crop')}</button><button onClick={() => { const frame: CropFrame = { x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 }; onUpdateImage(page.id, overlay.id, cropAtZoom(frame, 1, page.width, page.height, overlay.naturalWidth, overlay.naturalHeight)) }}>{t('resetCrop')}</button><label>{t('opacity')} <input className="opacity-slider" type="range" min="0" max="100" value={Math.round(overlay.opacity * 100)} onChange={event => onUpdateImage(page.id, overlay.id, { opacity: Number(event.target.value) / 100 })} /></label><button className={overlay.grayscale ? 'active' : ''} onClick={() => onUpdateImage(page.id, overlay.id, { grayscale: !overlay.grayscale })}><ImageIcon size={15} /> {t('grayscale')}</button><button title={t('moveBackward')} onClick={() => onMoveImageLayer(page.id, overlay.id, 'backward')}><SendToBack size={15} /></button><button title={t('moveForward')} onClick={() => onMoveImageLayer(page.id, overlay.id, 'forward')}><BringToFront size={15} /></button><span className="text-toolbar-spacer" /><button title={t('duplicate')} onClick={() => onDuplicateImage(page.id, overlay.id)}><Copy size={15} /></button><button className="danger" title={t('delete')} onClick={() => { onDeleteImage(page.id, overlay.id); setSelectedImageId(null) }}><Trash2 size={15} /></button></> : <>
          <strong>{t('crop')}</strong><div className="crop-ratios">{(['free', 'original', 'square', '4:3', '16:9'] as const).map(ratio => <button key={ratio} className={cropAspect === ratio ? 'active' : ''} onClick={() => { setCropAspect(ratio); if (ratio !== 'free') { const value = ratio === 'original' ? overlay.naturalWidth / overlay.naturalHeight : ratio === 'square' ? 1 : ratio === '4:3' ? 4 / 3 : 16 / 9; setCropDraft(frameAtAspect(cropDraft, value, page.width, page.height, overlay.naturalWidth, overlay.naturalHeight)) } }}>{ratio === 'square' ? t('square') : ratio === 'free' ? t('free') : ratio === 'original' ? t('original') : ratio}</button>)}</div><label>{t('zoom')} <input className="crop-zoom-slider" type="range" min="100" max="800" value={Math.round(cropZoom(cropDraft, page.width, page.height, overlay.naturalWidth, overlay.naturalHeight) * 100)} onChange={event => setCropDraft(cropAtZoom(cropDraft, Number(event.target.value) / 100, page.width, page.height, overlay.naturalWidth, overlay.naturalHeight))} /></label><button onClick={() => { const reset = { ...cropDraft, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 }; setCropDraft(cropAtZoom(reset, 1, page.width, page.height, overlay.naturalWidth, overlay.naturalHeight)) }}>{t('reset')}</button><span className="text-toolbar-spacer" /><button onClick={() => setCropDraft(null)}>{t('cancel')}</button><button className="active" onClick={() => { onUpdateImage(page.id, overlay.id, cropDraft); setCropDraft(null) }}>{t('apply')}</button>
        </>}</div> : null })()}
    </div>
  </div>
}
