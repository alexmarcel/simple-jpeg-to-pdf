import { useMemo, useRef, useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { clearViewerRenderCache, exportPdf, importFiles } from './pdf'
import type { DocumentPage, ExportSettings } from './types'
import PageViewer from './PageViewer'

const icons = {
  add: '＋', rotate: '↻', grayscale: '◐', remove: '×', grip: '⠿', lock: '◆', export: '↓', clear: '⌫', duplicate: '⧉', zoom: '⌕',
}

function SortablePage({ page, index, selected, onSelect, onOpen, onEdit }: { page: DocumentPage; index: number; selected: boolean; onSelect: () => void; onOpen: () => void; onEdit: (action: 'rotate' | 'grayscale' | 'duplicate' | 'remove') => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })
  return <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`page-card ${selected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`} onClick={onSelect}>
    <div className="page-preview" onDoubleClick={onOpen}>
      <img src={page.previewUrl} alt={`Preview of ${page.name}`} style={{ transform: `rotate(${page.rotation}deg)`, filter: page.grayscale ? 'grayscale(1)' : 'none' }} />
      <button className="drag-handle" aria-label={`Reorder page ${index + 1}`} {...attributes} {...listeners}>{icons.grip}</button>
      <button className="zoom-page" aria-label={`Open full view of ${page.name}`} title="Open full view" onClick={event => { event.stopPropagation(); onOpen() }}>{icons.zoom}</button>
      <span className="page-number">{index + 1}</span>
    </div>
    <div className="page-meta"><strong>{page.name}</strong><span>{page.sourceType === 'pdf' ? `PDF · page ${(page.sourcePage ?? 0) + 1}` : `${Math.round(page.width)} × ${Math.round(page.height)}`}</span></div>
    <div className="page-actions">
      <button title="Rotate clockwise" onClick={e => { e.stopPropagation(); onEdit('rotate') }}>{icons.rotate}</button>
      <button title="Toggle grayscale" className={page.grayscale ? 'active' : ''} onClick={e => { e.stopPropagation(); onEdit('grayscale') }}>{icons.grayscale}</button>
      <button title="Duplicate page" onClick={e => { e.stopPropagation(); onEdit('duplicate') }}>{icons.duplicate}</button>
      <button title="Remove page" className="danger" onClick={e => { e.stopPropagation(); onEdit('remove') }}>{icons.remove}</button>
    </div>
  </article>
}

export default function App() {
  const [pages, setPages] = useState<DocumentPage[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [viewerPageId, setViewerPageId] = useState<string | null>(null)
  const [settings, setSettings] = useState<ExportSettings>({ mode: 'original', orientation: 'auto', margin: 'normal', quality: 'balanced', filename: 'pagecraft-document' })
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [message, setMessage] = useState('')
  const [draggingOver, setDraggingOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const estimate = useMemo(() => {
    const raw = pages.reduce((sum, page) => sum + page.bytes.byteLength / (page.sourceType === 'pdf' ? 2 : 1), 0)
    const factor = { small: .45, balanced: .72, best: 1.05 }[settings.quality]
    return raw ? `${Math.max(.1, raw * factor / 1048576).toFixed(1)} MB est.` : '—'
  }, [pages, settings.quality])

  async function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (!files.length) return
    setBusy(true); setProgress(`Reading ${files.length} file${files.length > 1 ? 's' : ''}…`); setMessage('')
    const result = await importFiles(files)
    setPages(old => [...old, ...result.pages])
    if (result.pages.length && !selected) setSelected(result.pages[0].id)
    if (result.errors.length) setMessage(result.errors.join(' · '))
    setBusy(false); setProgress('')
  }

  function edit(id: string, action: 'rotate' | 'grayscale' | 'duplicate' | 'remove') {
    setPages(old => {
      const index = old.findIndex(page => page.id === id)
      if (index < 0) return old
      if (action === 'remove') { clearViewerRenderCache(id); return old.filter(page => page.id !== id) }
      if (action === 'duplicate') {
        const copy = { ...old[index], id: crypto.randomUUID(), name: `${old[index].name} copy` }
        return [...old.slice(0, index + 1), copy, ...old.slice(index + 1)]
      }
      return old.map(page => page.id === id ? { ...page, ...(action === 'rotate' ? { rotation: ((page.rotation + 90) % 360) as DocumentPage['rotation'] } : { grayscale: !page.grayscale }) } : page)
    })
  }

  function deleteFromViewer(id: string) {
    const index = pages.findIndex(page => page.id === id)
    const nextPage = pages[index + 1] ?? pages[index - 1]
    edit(id, 'remove')
    setSelected(nextPage?.id ?? null)
    setViewerPageId(nextPage?.id ?? null)
  }

  function dragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return
    setPages(old => arrayMove(old, old.findIndex(p => p.id === event.active.id), old.findIndex(p => p.id === event.over!.id)))
  }

  async function download() {
    if (!pages.length || busy) return
    setBusy(true); setMessage(''); setProgress(`Preparing page 1 of ${pages.length}`)
    try {
      const bytes = await exportPdf(pages, settings, done => setProgress(`Preparing page ${done} of ${pages.length}`))
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${settings.filename.trim() || 'document'}.pdf`; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The PDF could not be created.') }
    finally { setBusy(false); setProgress('') }
  }

  return <div className="app-shell" onDragOver={e => { e.preventDefault(); setDraggingOver(true) }} onDragLeave={() => setDraggingOver(false)} onDrop={e => { e.preventDefault(); setDraggingOver(false); void addFiles(e.dataTransfer.files) }}>
    {draggingOver && <div className="drop-overlay"><div>Drop your files anywhere</div></div>}
    <header>
      <a className="brand" href="#"><span className="brand-mark">P</span><span>Pagecraft<small>PDF maker</small></span></a>
      <div className="privacy">{icons.lock} Private by design <span>Files stay on this device</span></div>
      <div className="header-actions">
        {pages.length > 0 && <button className="button ghost" onClick={() => { if (confirm('Remove every page?')) { clearViewerRenderCache(); setPages([]); setSelected(null); setViewerPageId(null) } }}>{icons.clear} Clear</button>}
        <button className="button dark" onClick={() => input.current?.click()}>{icons.add} Add files</button>
        <input ref={input} hidden type="file" multiple accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" onChange={e => { if (e.target.files) void addFiles(e.target.files); e.target.value = '' }} />
      </div>
    </header>

    <main>
      <section className="workspace">
        <div className="workspace-heading"><div><p className="eyebrow">Your document</p><h1>{pages.length ? 'Arrange your pages' : 'Build a PDF, beautifully.'}</h1><p>{pages.length ? 'Drag pages into place. Edits are always reversible.' : 'Bring images and PDFs together. Nothing gets uploaded.'}</p></div>{pages.length > 0 && <div className="count"><strong>{pages.length}</strong><span>page{pages.length === 1 ? '' : 's'}</span></div>}</div>
        {message && <div className="notice" role="alert">{message}<button onClick={() => setMessage('')}>×</button></div>}
        {!pages.length ? <button className="empty-state" onClick={() => input.current?.click()}>
          <span className="empty-icon">{icons.add}</span><strong>Drop files here</strong><span>or click to choose from your device</span><em>JPEG · PNG · PDF &nbsp;—&nbsp; multiple files welcome</em>
        </button> : <DndContext sensors={sensors} onDragEnd={dragEnd}><SortableContext items={pages.map(page => page.id)} strategy={rectSortingStrategy}><div className="page-grid">{pages.map((page, index) => <SortablePage key={page.id} page={page} index={index} selected={selected === page.id} onSelect={() => setSelected(page.id)} onOpen={() => { setSelected(page.id); setViewerPageId(page.id) }} onEdit={action => edit(page.id, action)} />)}<button className="add-card" onClick={() => input.current?.click()}><span>{icons.add}</span>Add more</button></div></SortableContext></DndContext>}
      </section>

      <aside className="export-panel">
        <div><p className="eyebrow">Export settings</p><h2>Make it yours</h2></div>
        <label>Page size<select value={settings.mode} onChange={e => setSettings({ ...settings, mode: e.target.value as ExportSettings['mode'] })}><option value="original">Fit each page</option><option value="a4">A4 paper</option><option value="letter">US Letter</option></select></label>
        {settings.mode !== 'original' && <><label>Orientation<div className="segmented">{(['auto', 'portrait', 'landscape'] as const).map(value => <button key={value} className={settings.orientation === value ? 'active' : ''} onClick={() => setSettings({ ...settings, orientation: value })}>{value}</button>)}</div></label><label>Margins<div className="segmented">{(['none', 'narrow', 'normal'] as const).map(value => <button key={value} className={settings.margin === value ? 'active' : ''} onClick={() => setSettings({ ...settings, margin: value })}>{value}</button>)}</div></label></>}
        <fieldset><legend>Export quality</legend>{(['small', 'balanced', 'best'] as const).map(value => <label className={`quality ${settings.quality === value ? 'selected' : ''}`} key={value}><input type="radio" checked={settings.quality === value} onChange={() => setSettings({ ...settings, quality: value })} /><span><strong>{value[0].toUpperCase() + value.slice(1)}</strong><small>{value === 'small' ? 'Email & quick sharing' : value === 'balanced' ? 'Everyday quality' : 'Print & archive'}</small></span>{value === 'balanced' && <em>Recommended</em>}</label>)}</fieldset>
        <label>File name<div className="filename"><input value={settings.filename} onChange={e => setSettings({ ...settings, filename: e.target.value.replace(/[\\/:*?"<>|]/g, '') })} /><span>.pdf</span></div></label>
        <div className="summary"><span>{pages.length} page{pages.length === 1 ? '' : 's'}</span><span>{estimate}</span></div>
        <button className="export-button" disabled={!pages.length || busy} onClick={() => void download()}><span>{busy ? progress : 'Export PDF'}</span><b>{busy ? '…' : icons.export}</b></button>
        <p className="local-note">{icons.lock} Processed entirely in your browser</p>
      </aside>
    </main>
    {viewerPageId && <PageViewer pages={pages} pageId={viewerPageId} onPageChange={id => { setViewerPageId(id); setSelected(id) }} onEdit={edit} onDelete={deleteFromViewer} onClose={() => setViewerPageId(null)} />}
    <footer><span>Pagecraft</span><p>No uploads. No accounts. No funny business.</p><small>Made for documents that should stay yours.</small></footer>
  </div>
}
