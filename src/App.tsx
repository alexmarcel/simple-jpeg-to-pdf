import { useEffect, useMemo, useReducer, useRef, useState, type MouseEvent } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, Download, Eye, FilePlus2, Files, GripVertical, Grid2X2, Grid3X3, History, Image as ImageIcon, Plus, Redo2, RotateCw, ShieldCheck, Sparkles, Trash2, Undo2, X } from 'lucide-react'
import { documentHistoryReducer, initialHistory } from './documentReducer'
import { clearViewerRenderCache, exportPdf, importFiles } from './pdf'
import { createSnapshot, discardRecovery, hydrateRecovery, loadRecovery, saveRecovery, type RecoverySnapshot } from './recovery'
import type { DocumentPage, ExportSettings, ImageOverlay, PageEdit, TextOverlay } from './types'
import PageViewer from './PageViewer'

type GridSize = 'small' | 'medium' | 'large'

const defaultSettings: ExportSettings = { mode: 'original', orientation: 'auto', margin: 'normal', quality: 'balanced', filename: 'pagecraft-document' }
const colorWithOpacity = (hex: string | null, opacity: number) => hex ? `${hex}${Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0')}` : 'transparent'

interface SortablePageProps {
  page: DocumentPage
  index: number
  checked: boolean
  onCheck: (event: MouseEvent<HTMLInputElement>) => void
  onOpen: () => void
  onEdit: (action: PageEdit) => void
}

function SortablePage({ page, index, checked, onCheck, onOpen, onEdit }: SortablePageProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })
  return <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`page-card ${checked ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}>
    <div className="page-preview" onDoubleClick={onOpen}>
      <div className={`thumbnail-page ${page.width >= page.height ? 'landscape' : 'portrait'}`} style={{ aspectRatio: `${page.width} / ${page.height}`, transform: `rotate(${page.rotation}deg)` }}>
        <img src={page.previewUrl} alt={`Preview of ${page.name}`} style={{ filter: page.grayscale ? 'grayscale(1)' : 'none' }} />
        <div className="thumbnail-text-layer">
          {page.imageOverlays.map(overlay => <div className="thumbnail-image-overlay" key={overlay.id} style={{ left: `${overlay.x * 100}%`, top: `${overlay.y * 100}%`, width: `${overlay.width * 100}%`, height: `${overlay.height * 100}%`, zIndex: overlay.zIndex }}><img src={overlay.previewUrl} alt="" style={{ left: `${-overlay.cropX / overlay.cropWidth * 100}%`, top: `${-overlay.cropY / overlay.cropHeight * 100}%`, width: `${100 / overlay.cropWidth}%`, height: `${100 / overlay.cropHeight}%`, opacity: overlay.opacity, filter: overlay.grayscale ? 'grayscale(1)' : 'none' }} /></div>)}
          {page.textOverlays.map(overlay => <div key={overlay.id} dir="auto" style={{ left: `${overlay.x * 100}%`, top: `${overlay.y * 100}%`, width: `${overlay.width * 100}%`, height: `${overlay.height * 100}%`, padding: `${(overlay.padding ?? 0) * 100}cqw`, borderRadius: `${(overlay.borderRadius ?? 0) * 100}cqw`, backgroundColor: colorWithOpacity(overlay.backgroundColor, overlay.backgroundOpacity), color: overlay.color, fontFamily: overlay.fontFamily === 'sans' ? 'Arial, sans-serif' : overlay.fontFamily === 'serif' ? 'Georgia, serif' : 'Courier New, monospace', fontSize: `${overlay.fontSize * 100}cqw`, fontWeight: overlay.bold ? 700 : 400, fontStyle: overlay.italic ? 'italic' : 'normal', textAlign: overlay.align, zIndex: overlay.zIndex }}>{overlay.text}</div>)}
        </div>
      </div>
      <label className="page-check" title="Select page"><input type="checkbox" checked={checked} onClick={onCheck} onChange={() => undefined} aria-label={`Select page ${index + 1}`} /><span><Check size={14} /></span></label>
      <button className="drag-handle" aria-label={`Reorder page ${index + 1}`} {...attributes} {...listeners}><GripVertical size={16} /></button>
      <button className="zoom-page" aria-label={`Open full view of ${page.name}`} title="Open full view" onClick={onOpen}><Eye size={17} /></button>
      <span className="page-number">{index + 1}</span>
    </div>
    <div className="page-meta"><strong>{page.name}</strong><span>{page.sourceType === 'pdf' ? `PDF · page ${(page.sourcePage ?? 0) + 1}` : `${Math.round(page.width)} × ${Math.round(page.height)}`}</span></div>
    <div className="page-actions">
      <button title="Rotate clockwise" onClick={() => onEdit('rotate')}><RotateCw size={15} /></button>
      <button title="Toggle grayscale" className={page.grayscale ? 'active' : ''} onClick={() => onEdit('grayscale')}><ImageIcon size={15} /></button>
      <button title="Duplicate page" onClick={() => onEdit('duplicate')}><Files size={15} /></button>
      <button title="Remove page" className="danger" onClick={() => onEdit('remove')}><Trash2 size={15} /></button>
    </div>
  </article>
}

export default function App() {
  const [history, dispatch] = useReducer(documentHistoryReducer, initialHistory)
  const pages = history.present.pages
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [viewerPageId, setViewerPageId] = useState<string | null>(null)
  const [settings, setSettings] = useState<ExportSettings>(defaultSettings)
  const [gridSize, setGridSize] = useState<GridSize>(() => {
    try { const saved = localStorage.getItem('pagecraft-grid-size'); return saved === 'small' || saved === 'large' ? saved : 'medium' } catch { return 'medium' }
  })
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [message, setMessage] = useState('')
  const [toast, setToast] = useState('')
  const [draggingOver, setDraggingOver] = useState(false)
  const [sortingPage, setSortingPage] = useState(false)
  const [recovery, setRecovery] = useState<RecoverySnapshot | null>(null)
  const [recoveryReady, setRecoveryReady] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const lastSelectedIndex = useRef<number | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const estimate = useMemo(() => {
    const unique = new Map(pages.map(page => [page.sourceId, page]))
    const raw = [...unique.values()].reduce((sum, page) => sum + page.bytes.byteLength, 0)
    const factor = { small: .45, balanced: .72, best: 1.05 }[settings.quality]
    return raw ? `${Math.max(.1, raw * factor / 1048576).toFixed(1)} MB est.` : '—'
  }, [pages, settings.quality])

  useEffect(() => {
    void loadRecovery().then(snapshot => { if (snapshot?.pages.length) setRecovery(snapshot); else setRecoveryReady(true) }).catch(() => { setMessage('Project recovery is unavailable in this browser.'); setRecoveryReady(true) })
  }, [])

  useEffect(() => {
    if (!recoveryReady) return
    const timer = window.setTimeout(() => {
      const operation = pages.length ? saveRecovery(createSnapshot(pages, settings)) : discardRecovery()
      void operation.catch(() => setMessage('Your project could not be saved for recovery. Browser storage may be full.'))
    }, 700)
    return () => window.clearTimeout(timer)
  }, [pages, recoveryReady, settings])

  useEffect(() => {
    try { localStorage.setItem('pagecraft-grid-size', gridSize) } catch { /* UI preference persistence is optional. */ }
  }, [gridSize])

  useEffect(() => {
    const valid = new Set(pages.map(page => page.id))
    setSelectedIds(current => {
      const next = new Set([...current].filter(id => valid.has(id)))
      return next.size === current.size ? current : next
    })
    if (viewerPageId && !valid.has(viewerPageId)) setViewerPageId(null)
  }, [pages, viewerPageId])

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (target.matches('input, select, textarea') || viewerPageId) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault(); dispatch({ type: event.shiftKey ? 'REDO' : 'UNDO' })
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && pages.length) {
        event.preventDefault(); setSelectedIds(new Set(pages.map(page => page.id)))
      } else if (event.key === 'Delete' && selectedIds.size) {
        event.preventDefault(); deletePages([...selectedIds])
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 6000)
    return () => window.clearTimeout(timer)
  }, [toast])

  async function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (!files.length) return
    setBusy(true); setProgress(`Reading ${files.length} file${files.length > 1 ? 's' : ''}…`); setMessage('')
    const result = await importFiles(files)
    if (result.pages.length) dispatch({ type: 'ADD_PAGES', pages: result.pages })
    if (result.errors.length) setMessage(result.errors.join(' · '))
    setBusy(false); setProgress('')
  }

  function edit(id: string, action: PageEdit) {
    const page = pages.find(item => item.id === id)
    if (!page) return
    if (action === 'rotate') dispatch({ type: 'ROTATE', ids: [id] })
    else if (action === 'grayscale') dispatch({ type: 'SET_GRAYSCALE', ids: [id], value: !page.grayscale })
    else if (action === 'duplicate') dispatch({ type: 'DUPLICATE', ids: [id] })
    else deletePages([id])
  }

  function deletePages(ids: string[]) {
    for (const id of ids) clearViewerRenderCache(id)
    dispatch({ type: 'DELETE', ids })
    setSelectedIds(current => new Set([...current].filter(id => !ids.includes(id))))
    setToast(`${ids.length} page${ids.length === 1 ? '' : 's'} deleted`)
  }

  function deleteFromViewer(id: string) {
    const index = pages.findIndex(page => page.id === id)
    const nextPage = pages[index + 1] ?? pages[index - 1]
    deletePages([id]); setViewerPageId(nextPage?.id ?? null)
  }

  function dragEnd(event: DragEndEvent) {
    setSortingPage(false)
    if (!event.over || event.active.id === event.over.id) return
    dispatch({ type: 'REORDER', from: pages.findIndex(page => page.id === event.active.id), to: pages.findIndex(page => page.id === event.over!.id) })
  }

  function toggleSelection(index: number, shiftKey: boolean) {
    setSelectedIds(current => {
      const next = new Set(current)
      if (shiftKey && lastSelectedIndex.current !== null) {
        const [start, end] = [lastSelectedIndex.current, index].sort((a, b) => a - b)
        for (let cursor = start; cursor <= end; cursor++) next.add(pages[cursor].id)
      } else if (next.has(pages[index].id)) next.delete(pages[index].id)
      else next.add(pages[index].id)
      return next
    })
    lastSelectedIndex.current = index
  }

  function batch(action: 'rotate' | 'grayscale' | 'duplicate' | 'delete') {
    const ids = [...selectedIds]
    if (action === 'rotate') dispatch({ type: 'ROTATE', ids })
    else if (action === 'grayscale') dispatch({ type: 'SET_GRAYSCALE', ids, value: pages.some(page => selectedIds.has(page.id) && !page.grayscale) })
    else if (action === 'duplicate') dispatch({ type: 'DUPLICATE', ids })
    else deletePages(ids)
  }

  function addText(pageId: string, overlay: TextOverlay) { dispatch({ type: 'ADD_TEXT', pageId, overlay }) }
  function updateText(pageId: string, overlayId: string, patch: Partial<TextOverlay>) { dispatch({ type: 'UPDATE_TEXT', pageId, overlayId, patch }) }
  function deleteText(pageId: string, overlayId: string) { dispatch({ type: 'DELETE_TEXT', pageId, overlayId }) }
  function duplicateText(pageId: string, overlayId: string) { dispatch({ type: 'DUPLICATE_TEXT', pageId, overlayId }) }
  function addImages(pageId: string, overlays: ImageOverlay[]) { dispatch({ type: 'ADD_IMAGES', pageId, overlays }) }
  function updateImage(pageId: string, overlayId: string, patch: Partial<ImageOverlay>) { dispatch({ type: 'UPDATE_IMAGE', pageId, overlayId, patch }) }
  function deleteImage(pageId: string, overlayId: string) { dispatch({ type: 'DELETE_IMAGE', pageId, overlayId }) }
  function duplicateImage(pageId: string, overlayId: string) { dispatch({ type: 'DUPLICATE_IMAGE', pageId, overlayId }) }
  function moveImageLayer(pageId: string, overlayId: string, direction: 'forward' | 'backward') { dispatch({ type: 'MOVE_IMAGE_LAYER', pageId, overlayId, direction }) }

  async function restoreProject() {
    if (!recovery) return
    setBusy(true); setProgress('Restoring your project…')
    try {
      const restored = await hydrateRecovery(recovery)
      dispatch({ type: 'RESET', pages: restored }); setSettings(recovery.settings); setRecovery(null); setRecoveryReady(true)
    } catch { setMessage('The saved project could not be restored.'); await discardRecovery(); setRecovery(null); setRecoveryReady(true) }
    finally { setBusy(false); setProgress('') }
  }

  async function discardSavedProject() { await discardRecovery().catch(() => undefined); setRecovery(null); setRecoveryReady(true) }

  async function download() {
    if (!pages.length || busy) return
    setBusy(true); setMessage(''); setProgress(`Preparing page 1 of ${pages.length}`)
    try {
      const bytes = await exportPdf(pages, settings, done => setProgress(`Preparing page ${done} of ${pages.length}`))
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${settings.filename.trim() || 'document'}.pdf`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The PDF could not be created.') }
    finally { setBusy(false); setProgress('') }
  }

  return <div className={`app-shell ${sortingPage ? 'sorting-page' : ''}`} onDragOver={event => { event.preventDefault(); setDraggingOver(true) }} onDragLeave={() => setDraggingOver(false)} onDrop={event => { event.preventDefault(); setDraggingOver(false); void addFiles(event.dataTransfer.files) }}>
    {draggingOver && <div className="drop-overlay"><div>Drop your files anywhere</div></div>}
    <header>
      <a className="brand" href="#"><span className="brand-mark"><Files size={19} /></span><span>Pagecraft<small>PDF maker</small></span></a>
      <div className="privacy"><ShieldCheck size={15} /> Private by design <span>Files stay on this device</span></div>
      <div className="header-actions">
        <button className="history-button" disabled={!history.past.length} onClick={() => dispatch({ type: 'UNDO' })} title="Undo (Ctrl/Cmd+Z)"><Undo2 size={17} /></button>
        <button className="history-button" disabled={!history.future.length} onClick={() => dispatch({ type: 'REDO' })} title="Redo (Ctrl/Cmd+Shift+Z)"><Redo2 size={17} /></button>
        {pages.length > 0 && <button className="button ghost" onClick={() => { if (confirm('Remove every page?')) { clearViewerRenderCache(); dispatch({ type: 'CLEAR' }); setSelectedIds(new Set()); setViewerPageId(null) } }}><Trash2 size={15} /> Clear</button>}
        <button className="button dark" onClick={() => input.current?.click()}><FilePlus2 size={17} /> Add files</button>
        <input ref={input} hidden type="file" multiple accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" onChange={event => { if (event.target.files) void addFiles(event.target.files); event.target.value = '' }} />
      </div>
    </header>

    <main>
      <section className="workspace">
        <div className="workspace-heading"><div><p className="eyebrow">Your document</p><h1>{pages.length ? 'Arrange your pages' : 'Build a PDF, beautifully.'}</h1><p>{pages.length ? 'Select, edit, and drag pages into place.' : 'Bring images and PDFs together. Nothing gets uploaded.'}</p></div>{pages.length > 0 && <div className="count"><strong>{pages.length}</strong><span>page{pages.length === 1 ? '' : 's'}</span></div>}</div>
        {message && <div className="notice" role="alert">{message}<button onClick={() => setMessage('')}>×</button></div>}
        {pages.length > 0 && <div className="document-toolbar">
          <div><button onClick={() => setSelectedIds(selectedIds.size === pages.length ? new Set() : new Set(pages.map(page => page.id)))}>{selectedIds.size === pages.length ? 'Clear selection' : 'Select all'}</button><span>{selectedIds.size ? `${selectedIds.size} selected` : 'Select pages for batch actions'}</span></div>
          {selectedIds.size > 0 && <div className="batch-actions"><button onClick={() => batch('rotate')}><RotateCw size={14} /> Rotate</button><button onClick={() => batch('grayscale')}><ImageIcon size={14} /> Grayscale</button><button onClick={() => batch('duplicate')}><Files size={14} /> Duplicate</button><button className="danger" onClick={() => batch('delete')}><Trash2 size={14} /> Delete</button></div>}
          <div className="grid-picker" aria-label="Thumbnail size">{(['small', 'medium', 'large'] as const).map(size => <button key={size} className={gridSize === size ? 'active' : ''} onClick={() => setGridSize(size)} title={`${size} thumbnails`}>{size === 'small' ? <Grid3X3 size={15} /> : size === 'medium' ? <Grid2X2 size={15} /> : <ImageIcon size={15} />}</button>)}</div>
        </div>}
        {!pages.length ? <button className="empty-state" onClick={() => input.current?.click()}><span className="empty-icon"><Plus size={28} /></span><strong>Drop files here</strong><span>or click to choose from your device</span><em>JPEG · PNG · PDF — multiple files welcome</em></button> :
          <DndContext sensors={sensors} onDragStart={() => setSortingPage(true)} onDragCancel={() => setSortingPage(false)} onDragEnd={dragEnd}><SortableContext items={pages.map(page => page.id)} strategy={rectSortingStrategy}><div className={`page-grid grid-${gridSize}`}>{pages.map((page, index) => <SortablePage key={page.id} page={page} index={index} checked={selectedIds.has(page.id)} onCheck={event => toggleSelection(index, event.shiftKey)} onOpen={() => setViewerPageId(page.id)} onEdit={action => edit(page.id, action)} />)}<button className="add-card" onClick={() => input.current?.click()}><span><Plus size={23} /></span>Add more</button></div></SortableContext></DndContext>}
      </section>

      <aside className="export-panel">
        <div><p className="eyebrow">Export settings</p><h2>Make it yours</h2></div>
        <label>Page size<select value={settings.mode} onChange={event => setSettings({ ...settings, mode: event.target.value as ExportSettings['mode'] })}><option value="original">Fit each page</option><option value="a4">A4 paper</option><option value="letter">US Letter</option></select></label>
        {settings.mode !== 'original' && <><label>Orientation<div className="segmented">{(['auto', 'portrait', 'landscape'] as const).map(value => <button key={value} className={settings.orientation === value ? 'active' : ''} onClick={() => setSettings({ ...settings, orientation: value })}>{value}</button>)}</div></label><label>Margins<div className="segmented">{(['none', 'narrow', 'normal'] as const).map(value => <button key={value} className={settings.margin === value ? 'active' : ''} onClick={() => setSettings({ ...settings, margin: value })}>{value}</button>)}</div></label></>}
        <fieldset><legend>Export quality</legend>{(['small', 'balanced', 'best'] as const).map(value => <label className={`quality ${settings.quality === value ? 'selected' : ''}`} key={value}><input type="radio" checked={settings.quality === value} onChange={() => setSettings({ ...settings, quality: value })} /><span><strong>{value[0].toUpperCase() + value.slice(1)}</strong><small>{value === 'small' ? 'Email & quick sharing' : value === 'balanced' ? 'Everyday quality' : 'Print & archive'}</small></span>{value === 'balanced' && <em>Recommended</em>}</label>)}</fieldset>
        <label>File name<div className="filename"><input value={settings.filename} onChange={event => setSettings({ ...settings, filename: event.target.value.replace(/[\\/:*?"<>|]/g, '') })} /><span>.pdf</span></div></label>
        <div className="summary"><span>{pages.length} page{pages.length === 1 ? '' : 's'}</span><span>{estimate}</span></div>
        <button className="export-button" disabled={!pages.length || busy} onClick={() => void download()}><span>{busy ? progress : 'Export PDF'}</span><b>{busy ? <Sparkles size={18} /> : <Download size={18} />}</b></button>
        <p className="local-note"><ShieldCheck size={13} /> Processed entirely in your browser</p>
      </aside>
    </main>

    {recovery && <div className="recovery-backdrop"><section className="recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="recovery-title"><span className="recovery-icon"><History size={27} /></span><p className="eyebrow">Project recovery</p><h2 id="recovery-title">Pick up where you left off?</h2><p>We found {recovery.pages.length} saved page{recovery.pages.length === 1 ? '' : 's'} from {new Date(recovery.savedAt).toLocaleString()}.</p><div><button className="button ghost" onClick={() => void discardSavedProject()}>Discard</button><button className="button dark" onClick={() => void restoreProject()}>Restore project</button></div></section></div>}
    {toast && <div className="undo-toast" role="status"><span>{toast}</span><button onClick={() => { dispatch({ type: 'UNDO' }); setToast('') }}>Undo</button><button aria-label="Dismiss" onClick={() => setToast('')}><X size={15} /></button></div>}
    {viewerPageId && <PageViewer pages={pages} pageId={viewerPageId} onPageChange={setViewerPageId} onEdit={edit} onDelete={deleteFromViewer} onAddText={addText} onUpdateText={updateText} onDeleteText={deleteText} onDuplicateText={duplicateText} onAddImages={addImages} onUpdateImage={updateImage} onDeleteImage={deleteImage} onDuplicateImage={duplicateImage} onMoveImageLayer={moveImageLayer} onClose={() => setViewerPageId(null)} />}
    <footer><span>Pagecraft</span><p>No uploads. No accounts. No funny business.</p><small>Made for documents that should stay yours.</small></footer>
  </div>
}
