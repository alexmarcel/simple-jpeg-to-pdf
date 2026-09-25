import { useEffect, useMemo, useReducer, useRef, useState, type MouseEvent } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, Download, Eye, FilePlus2, Files, FileText, GripVertical, Grid2X2, Grid3X3, History, Image as ImageIcon, Mail, Plus, Printer, Redo2, RefreshCw, RotateCw, Scale, ShieldCheck, Sparkles, Trash2, Undo2, X } from 'lucide-react'
import { documentHistoryReducer, initialHistory } from './documentReducer'
import { clearViewerRenderCache, exportPdf, importFiles, projectByteSize, renderPagePreview, type ImportFailureCode } from './pdf'
import { createSnapshot, discardRecovery, hydrateRecovery, loadRecovery, saveRecovery, type RecoverySnapshot } from './recovery'
import type { DocumentPage, ExportSettings, ImageOverlay, PageEdit, TextOverlay } from './types'
import PageViewer from './PageViewer'
import { useI18n, type TranslationKey } from './i18n'
import appConfig from './app.config'

type GridSize = 'small' | 'medium' | 'large'

const defaultSettings: ExportSettings = { mode: appConfig.exportDefaults.pageMode, orientation: appConfig.exportDefaults.orientation, margin: appConfig.exportDefaults.margin, quality: appConfig.exportDefaults.quality, filename: appConfig.exportDefaults.filename }
const colorWithOpacity = (hex: string | null, opacity: number) => hex ? `${hex}${Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0')}` : 'transparent'
const importErrorKeys: Record<ImportFailureCode, TranslationKey> = { unsupported: 'unsupportedFile', unreadable: 'unreadableFile', 'file-too-large': 'fileTooLarge', 'too-many-pages': 'tooManyPages', 'image-too-large': 'imageTooLarge', 'project-too-large': 'projectTooLarge' }

interface SortablePageProps {
  page: DocumentPage
  index: number
  checked: boolean
  onCheck: (event: MouseEvent<HTMLInputElement>) => void
  onOpen: () => void
  onEdit: (action: PageEdit) => void
  onVisible: (page: DocumentPage) => void
}

function SortablePage({ page, index, checked, onCheck, onOpen, onEdit, onVisible }: SortablePageProps) {
  const { t } = useI18n()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })
  const cardRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const element = cardRef.current
    if (!element || page.sourceType !== 'pdf' || page.previewStatus === 'ready') return
    const observer = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) { onVisible(page); observer.disconnect() } }, { rootMargin: '800px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [onVisible, page])
  return <article ref={node => { cardRef.current = node; setNodeRef(node) }} style={{ transform: CSS.Transform.toString(transform), transition }} className={`page-card ${checked ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}>
    <div className="page-preview" onDoubleClick={onOpen}>
      <div className={`thumbnail-page ${page.width >= page.height ? 'landscape' : 'portrait'}`} style={{ aspectRatio: `${page.width} / ${page.height}`, transform: `rotate(${page.rotation}deg)` }} onPointerDown={event => { if (typeof listeners?.onPointerDown === 'function') listeners.onPointerDown(event) }}>
        {page.previewUrl ? <img draggable={false} src={page.previewUrl} alt={`Preview of ${page.name}`} style={{ filter: page.grayscale ? 'grayscale(1)' : 'none' }} /> : <span className={`thumbnail-skeleton ${page.previewStatus === 'failed' ? 'failed' : ''}`}>{page.previewStatus === 'failed' ? '!' : ''}</span>}
        <div className="thumbnail-text-layer">
          {page.imageOverlays.map(overlay => <div className="thumbnail-image-overlay" key={overlay.id} style={{ left: `${overlay.x * 100}%`, top: `${overlay.y * 100}%`, width: `${overlay.width * 100}%`, height: `${overlay.height * 100}%`, zIndex: overlay.zIndex }}><img draggable={false} src={overlay.previewUrl} alt="" style={{ left: `${-overlay.cropX / overlay.cropWidth * 100}%`, top: `${-overlay.cropY / overlay.cropHeight * 100}%`, width: `${100 / overlay.cropWidth}%`, height: `${100 / overlay.cropHeight}%`, opacity: overlay.opacity, filter: overlay.grayscale ? 'grayscale(1)' : 'none' }} /></div>)}
          {page.textOverlays.map(overlay => <div key={overlay.id} dir="auto" style={{ left: `${overlay.x * 100}%`, top: `${overlay.y * 100}%`, width: `${overlay.width * 100}%`, height: `${overlay.height * 100}%`, padding: `${(overlay.padding ?? 0) * 100}cqw`, borderRadius: `${(overlay.borderRadius ?? 0) * 100}cqw`, backgroundColor: colorWithOpacity(overlay.backgroundColor, overlay.backgroundOpacity), color: overlay.color, fontFamily: overlay.fontFamily === 'sans' ? 'Arial, sans-serif' : overlay.fontFamily === 'serif' ? 'Georgia, serif' : 'Courier New, monospace', fontSize: `${overlay.fontSize * 100}cqw`, fontWeight: overlay.bold ? 700 : 400, fontStyle: overlay.italic ? 'italic' : 'normal', textAlign: overlay.align, zIndex: overlay.zIndex }}>{overlay.text}</div>)}
        </div>
      </div>
      <label className="page-check" title={t('selectPage', { number: index + 1 })}><input type="checkbox" checked={checked} onClick={onCheck} onChange={() => undefined} aria-label={t('selectPage', { number: index + 1 })} /><span><Check size={14} /></span></label>
      <button className="drag-handle" aria-label={t('reorderPage', { number: index + 1 })} {...attributes} {...listeners}><GripVertical size={16} /></button>
      <button className="zoom-page" aria-label={t('openFull', { name: page.name })} title={t('openFullTitle')} onClick={onOpen}><Eye size={17} /></button>
      <span className="page-number">{index + 1}</span>
    </div>
    <div className="page-meta"><strong>{page.name}</strong><span>{page.sourceType === 'pdf' ? t('pdfPage', { number: (page.sourcePage ?? 0) + 1 }) : `${Math.round(page.width)} × ${Math.round(page.height)}`}</span></div>
    <div className="page-actions">
      <button title={t('rotateClockwise')} onClick={() => onEdit('rotate')}><RotateCw size={15} /></button>
      <button title={t('toggleGrayscale')} className={page.grayscale ? 'active' : ''} onClick={() => onEdit('grayscale')}><ImageIcon size={15} /></button>
      <button title={t('duplicatePage')} onClick={() => onEdit('duplicate')}><Files size={15} /></button>
      <button title={t('removePage')} className="danger" onClick={() => onEdit('remove')}><Trash2 size={15} /></button>
    </div>
  </article>
}

export default function App() {
  const { t, locale, setLocale, formatDate } = useI18n()
  const [history, dispatch] = useReducer(documentHistoryReducer, initialHistory)
  const pages = history.present.pages
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [viewerPageId, setViewerPageId] = useState<string | null>(null)
  const [settings, setSettings] = useState<ExportSettings>(defaultSettings)
  const [gridSize, setGridSize] = useState<GridSize>(() => {
    try { const saved = localStorage.getItem('pagecraft-grid-size'); return saved === 'small' || saved === 'large' ? saved : 'medium' } catch { return 'medium' }
  })
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState('')
  const [message, setMessage] = useState<{ key: TranslationKey; variables?: Record<string, string | number> } | null>(null)
  const [toastCount, setToastCount] = useState<number | null>(null)
  const [draggingOver, setDraggingOver] = useState(false)
  const [sortingPage, setSortingPage] = useState(false)
  const [recovery, setRecovery] = useState<RecoverySnapshot | null>(null)
  const [recoveryReady, setRecoveryReady] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const importController = useRef<AbortController | null>(null)
  const thumbnailQueue = useRef<DocumentPage[]>([])
  const thumbnailQueued = useRef(new Set<string>())
  const thumbnailActive = useRef(0)
  const lastSelectedIndex = useRef<number | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const estimate = useMemo(() => {
    const unique = new Map(pages.map(page => [page.sourceId, page]))
    const raw = [...unique.values()].reduce((sum, page) => sum + page.bytes.byteLength, 0)
    const factor = { small: .45, balanced: .72, best: 1.05, originalQuality: 1.2 }[settings.quality]
    return raw ? Math.max(.1, raw * factor / 1048576).toFixed(1) : null
  }, [pages, settings.quality])

  useEffect(() => {
    void loadRecovery().then(snapshot => { if (snapshot?.pages.length) setRecovery(snapshot); else setRecoveryReady(true) }).catch(() => { setMessage({ key: 'recoveryUnavailable' }); setRecoveryReady(true) })
  }, [])

  useEffect(() => {
    document.title = `${appConfig.branding.name} - ${appConfig.branding.tagline[locale]}`
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (description) description.content = appConfig.branding.description[locale]
  }, [locale])

  useEffect(() => {
    if (!recoveryReady || importing) return
    const timer = window.setTimeout(() => {
      const operation = pages.length ? saveRecovery(createSnapshot(pages, settings)) : discardRecovery()
      void operation.catch(() => setMessage({ key: 'recoverySaveFailed' }))
    }, 700)
    return () => window.clearTimeout(timer)
  }, [pages, recoveryReady, settings, importing])

  function pumpThumbnails() {
    while (thumbnailActive.current < appConfig.limits.thumbnailConcurrency && thumbnailQueue.current.length) {
      const page = thumbnailQueue.current.shift()!
      thumbnailActive.current++
      dispatch({ type: 'SET_PAGE_PREVIEW', pageId: page.id, previewUrl: '', status: 'rendering' })
      void renderPagePreview(page, .45)
        .then(previewUrl => dispatch({ type: 'SET_PAGE_PREVIEW', pageId: page.id, previewUrl, status: 'ready' }))
        .catch(() => dispatch({ type: 'SET_PAGE_PREVIEW', pageId: page.id, previewUrl: '', status: 'failed' }))
        .finally(() => { thumbnailActive.current--; thumbnailQueued.current.delete(page.id); pumpThumbnails() })
    }
  }

  function queueThumbnail(page: DocumentPage) {
    if (page.sourceType !== 'pdf' || page.previewStatus === 'ready' || thumbnailQueued.current.has(page.id)) return
    thumbnailQueued.current.add(page.id); thumbnailQueue.current.push(page); pumpThumbnails()
  }

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
    if (toastCount === null) return
    const timer = window.setTimeout(() => setToastCount(null), 6000)
    return () => window.clearTimeout(timer)
  }, [toastCount])

  async function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (!files.length || importing) return
    const controller = new AbortController(); importController.current = controller
    let pagesAdded = 0
    setBusy(true); setImporting(true); setProgress(t(files.length === 1 ? 'readingOne' : 'readingMany', { count: files.length })); setMessage(null)
    dispatch({ type: 'BEGIN_IMPORT' })
    try {
      const result = await importFiles(files, {
        signal: controller.signal,
        existingBytes: projectByteSize(pages),
        onDiscovered: (name, count) => setProgress(t('pagesFound', { name, count })),
        onBatch: batch => { pagesAdded += batch.length; dispatch({ type: 'ADD_IMPORT_BATCH', pages: batch }); setProgress(t('pagesAdded', { count: pagesAdded })) },
        confirmLarge: (name, bytes, count) => confirm(t(count === undefined ? 'largeFileWarning' : 'largePdfWarning', { name, count: count ?? 0, size: Math.ceil(bytes / 1048576) })),
      })
      dispatch({ type: 'FINISH_IMPORT' })
      if (result.errors.length) setMessage({ key: importErrorKeys[result.errors[0].code], variables: { name: result.errors[0].name } })
    } catch (error) {
      dispatch({ type: 'CANCEL_IMPORT' })
      thumbnailQueue.current = []; thumbnailQueued.current.clear(); clearViewerRenderCache()
      if (!(error instanceof DOMException && error.name === 'AbortError')) setMessage({ key: 'importFailed' })
    } finally {
      importController.current = null; setBusy(false); setImporting(false); setProgress('')
    }
  }

  function cancelImport() { importController.current?.abort() }

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
    setToastCount(ids.length)
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

  function invertSelection() {
    setSelectedIds(current => new Set(pages.filter(page => !current.has(page.id)).map(page => page.id)))
    lastSelectedIndex.current = null
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
    setBusy(true); setProgress(t('restoring'))
    try {
      const restored = await hydrateRecovery(recovery)
      dispatch({ type: 'RESET', pages: restored }); setSettings(recovery.settings); setRecovery(null); setRecoveryReady(true)
    } catch { setMessage({ key: 'recoveryRestoreFailed' }); await discardRecovery(); setRecovery(null); setRecoveryReady(true) }
    finally { setBusy(false); setProgress('') }
  }

  async function discardSavedProject() { await discardRecovery().catch(() => undefined); setRecovery(null); setRecoveryReady(true) }

  async function clearProject() {
    if (!confirm(t('removeEveryPage'))) return
    setRecoveryReady(false)
    await discardRecovery().catch(() => undefined)
    clearViewerRenderCache(); dispatch({ type: 'CLEAR' }); setSelectedIds(new Set()); setViewerPageId(null); setRecovery(null)
    setRecoveryReady(true)
  }

  async function download() {
    if (!pages.length || busy) return
    setBusy(true); setMessage(null); setProgress(t('preparing', { done: 1, total: pages.length }))
    try {
      const bytes = await exportPdf(pages, settings, done => setProgress(t('preparing', { done, total: pages.length })))
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${settings.filename.trim() || 'document'}.pdf`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch { setMessage({ key: 'exportFailed' }) }
    finally { setBusy(false); setProgress('') }
  }

  return <div className={`app-shell ${sortingPage ? 'sorting-page' : ''}`} onDragOver={event => { event.preventDefault(); if (!importing) setDraggingOver(true) }} onDragLeave={() => setDraggingOver(false)} onDrop={event => { event.preventDefault(); setDraggingOver(false); if (!importing) void addFiles(event.dataTransfer.files) }}>
    {draggingOver && <div className="drop-overlay"><div>{t('dropAnywhere')}</div></div>}
    <header>
      <a className="brand" href="#"><span className="brand-mark"><Files size={19} /></span><span>{appConfig.branding.name}<small>{appConfig.branding.tagline[locale]}</small></span></a>
      <div className="language-switch" aria-label={t('language')}><button className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>EN</button><button className={locale === 'ms-MY' ? 'active' : ''} onClick={() => setLocale('ms-MY')}>BM</button></div>
      <div className="header-actions">
        {pages.length > 0 && <button className="button ghost" onClick={() => void clearProject()}><Trash2 size={15} /> {t('clear')}</button>}
        <button className="button dark" disabled={importing} onClick={() => input.current?.click()}><FilePlus2 size={17} /> {t('addFiles')}</button>
        <button className="history-button" disabled={!history.past.length} onClick={() => dispatch({ type: 'UNDO' })} title={`${t('undo')} (Ctrl/Cmd+Z)`}><Undo2 size={17} /></button>
        <button className="history-button" disabled={!history.future.length} onClick={() => dispatch({ type: 'REDO' })} title={`${t('redo')} (Ctrl/Cmd+Shift+Z)`}><Redo2 size={17} /></button>
        <input ref={input} hidden type="file" multiple accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" onChange={event => { if (event.target.files) void addFiles(event.target.files); event.target.value = '' }} />
      </div>
    </header>

    <main>
      <section className="workspace">
        <div className="workspace-heading"><div><p className="eyebrow">{t('yourDocument')}</p><h1>{t(pages.length ? 'arrangePages' : 'buildPdf')}</h1>{pages.length ? <p>{t('arrangeHelp')}</p> : <><div className="quick-tutorial" aria-label={t('emptyHelp')}><span><b>1</b>{t('tutorialAdd')}<i aria-hidden="true"><FilePlus2 size={16} /></i></span><span><b>2</b>{t('tutorialArrange')}<i aria-hidden="true"><GripVertical size={16} /></i></span><span><b>3</b>{t('tutorialExport')}<i aria-hidden="true"><Download size={16} /></i></span></div><div className="feature-summary"><strong>{t('featureTitle')}</strong><ul className="feature-list"><li>{t('featureCombine')}</li><li>{t('featureArrange')}</li><li>{t('featureCustomize')}</li><li>{t('featurePrivate')}</li></ul></div></>}</div>{pages.length > 0 && <div className="count"><strong>{pages.length}</strong><span>{t(pages.length === 1 ? 'page' : 'pages')}</span></div>}</div>
        {message && <div className="notice" role="alert">{t(message.key, message.variables)}<button onClick={() => setMessage(null)}>×</button></div>}
        {importing && <div className="import-progress" role="status"><span>{progress}</span><button onClick={cancelImport}>{t('cancel')}</button></div>}
        {pages.length > 0 && <div className="document-toolbar">
          <div><button onClick={() => setSelectedIds(selectedIds.size === pages.length ? new Set() : new Set(pages.map(page => page.id)))}>{t(selectedIds.size === pages.length ? 'clearSelection' : 'selectAll')}</button><button onClick={invertSelection}><RefreshCw size={14} /> {t('invertSelection')}</button><span>{selectedIds.size ? t('selected', { count: selectedIds.size }) : t('selectBatch')}</span></div>
          {selectedIds.size > 0 && <div className="batch-actions"><button onClick={() => batch('rotate')}><RotateCw size={14} /> {t('rotate')}</button><button onClick={() => batch('grayscale')}><ImageIcon size={14} /> {t('grayscale')}</button><button onClick={() => batch('duplicate')}><Files size={14} /> {t('duplicate')}</button><button className="danger" onClick={() => batch('delete')}><Trash2 size={14} /> {t('delete')}</button></div>}
          <div className="grid-picker" aria-label={t('thumbnailSize')}>{(['small', 'medium', 'large'] as const).map(size => <button key={size} className={gridSize === size ? 'active' : ''} onClick={() => setGridSize(size)} title={t(size === 'small' ? 'smallThumbs' : size === 'medium' ? 'mediumThumbs' : 'largeThumbs')}>{size === 'small' ? <Grid3X3 size={15} /> : size === 'medium' ? <Grid2X2 size={15} /> : <ImageIcon size={15} />}</button>)}</div>
        </div>}
        {!pages.length ? <button className="empty-state" onClick={() => input.current?.click()}><span className="empty-icon"><Plus size={28} /></span><strong>{t('dropFiles')}</strong><span>{t('chooseDevice')}</span><em className="file-formats"><span><ImageIcon size={22} /> JPEG</span><span><ImageIcon size={22} /> PNG</span><span><FileText size={22} /> PDF</span><small>{t('multipleWelcome')}</small></em></button> :
          <DndContext sensors={sensors} onDragStart={() => setSortingPage(true)} onDragCancel={() => setSortingPage(false)} onDragEnd={dragEnd}><SortableContext items={pages.map(page => page.id)} strategy={rectSortingStrategy}><div className={`page-grid grid-${gridSize}`}>{pages.map((page, index) => <SortablePage key={page.id} page={page} index={index} checked={selectedIds.has(page.id)} onCheck={event => toggleSelection(index, event.shiftKey)} onOpen={() => { queueThumbnail(page); setViewerPageId(page.id) }} onEdit={action => edit(page.id, action)} onVisible={queueThumbnail} />)}<button className="add-card" onClick={() => input.current?.click()}><span><Plus size={23} /></span>{t('addMore')}<div className="add-card-formats" aria-label={t('formats')}><small><ImageIcon size={15} /> JPEG</small><small><ImageIcon size={15} /> PNG</small><small><FileText size={15} /> PDF</small></div></button></div></SortableContext></DndContext>}
      </section>

      <aside className="export-panel">
        <div><p className="eyebrow">{t('exportSettings')}</p><h2>{t('makeItYours')}</h2></div>
        <label>{t('pageSize')}<select value={settings.mode} onChange={event => setSettings({ ...settings, mode: event.target.value as ExportSettings['mode'] })}><option value="original">{t('fitEach')}</option><option value="a4">{t('a4')}</option><option value="letter">{t('letter')}</option></select></label>
        {settings.mode !== 'original' && <><label>{t('orientation')}<div className="segmented">{(['auto', 'portrait', 'landscape'] as const).map(value => <button key={value} className={settings.orientation === value ? 'active' : ''} onClick={() => setSettings({ ...settings, orientation: value })}>{t(value)}</button>)}</div></label><label>{t('margins')}<div className="segmented">{(['none', 'narrow', 'normal'] as const).map(value => <button key={value} className={settings.margin === value ? 'active' : ''} onClick={() => setSettings({ ...settings, margin: value })}>{t(value)}</button>)}</div></label></>}
        <fieldset><legend>{t('exportQuality')}</legend>{(['small', 'balanced', 'best', 'originalQuality'] as const).map(value => <label className={`quality ${settings.quality === value ? 'selected' : ''}`} key={value}><input type="radio" checked={settings.quality === value} onChange={() => setSettings({ ...settings, quality: value })} /><span className="quality-icon" aria-hidden="true">{value === 'small' ? <Mail size={18} /> : value === 'balanced' ? <Scale size={18} /> : value === 'best' ? <Printer size={18} /> : <ImageIcon size={18} />}</span><span><strong>{t(value)}</strong><small>{t(value === 'small' ? 'emailSharing' : value === 'balanced' ? 'everyday' : value === 'best' ? 'printArchive' : 'maximumDetail')}</small></span>{value === 'balanced' && <em>{t('recommended')}</em>}</label>)}</fieldset>
        <label>{t('fileName')}<div className="filename"><input value={settings.filename} onChange={event => setSettings({ ...settings, filename: event.target.value.replace(/[\\/:*?"<>|]/g, '') })} /><span>.pdf</span></div></label>
        <div className="summary"><span>{pages.length} {t(pages.length === 1 ? 'page' : 'pages')}</span><span>{estimate ? t('estimated', { size: estimate }) : '—'}</span></div>
        <button className="export-button" disabled={!pages.length || busy} onClick={() => void download()}><span>{busy ? progress : t('exportPdf')}</span><b>{busy ? <Sparkles size={18} /> : <Download size={18} />}</b></button>
        <p className="local-note"><ShieldCheck size={13} /> {t('processedLocally')}</p>
      </aside>
    </main>

    {recovery && <div className="recovery-backdrop"><section className="recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="recovery-title"><span className="recovery-icon"><History size={27} /></span><p className="eyebrow">{t('recovery')}</p><h2 id="recovery-title">{t('pickUp')}</h2><p>{t('recoveryFound', { count: recovery.pages.length, pages: t(recovery.pages.length === 1 ? 'page' : 'pages'), date: formatDate(new Date(recovery.savedAt)) })}</p><div><button className="button ghost" onClick={() => void discardSavedProject()}>{t('discard')}</button><button className="button dark" onClick={() => void restoreProject()}>{t('restoreProject')}</button></div></section></div>}
    {toastCount !== null && <div className="undo-toast" role="status"><span>{t(toastCount === 1 ? 'deletedOne' : 'deletedMany', { count: toastCount })}</span><button onClick={() => { dispatch({ type: 'UNDO' }); setToastCount(null) }}>{t('undo')}</button><button aria-label={t('dismiss')} onClick={() => setToastCount(null)}><X size={15} /></button></div>}
    {viewerPageId && <PageViewer pages={pages} pageId={viewerPageId} onPageChange={setViewerPageId} onEdit={edit} onDelete={deleteFromViewer} onAddText={addText} onUpdateText={updateText} onDeleteText={deleteText} onDuplicateText={duplicateText} onAddImages={addImages} onUpdateImage={updateImage} onDeleteImage={deleteImage} onDuplicateImage={duplicateImage} onMoveImageLayer={moveImageLayer} onClose={() => setViewerPageId(null)} />}
    <footer><div className="footer-brand"><span>{appConfig.branding.name}</span><small>v{appConfig.version} · <a href="https://alexmarcel.com" target="_blank" rel="noreferrer">alexmarcel.com</a></small></div><p>{t('footer')}</p><small>{t('footerNote')}</small></footer>
  </div>
}
