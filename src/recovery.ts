import { renderPagePreview } from './pdf'
import type { DocumentPage, ExportSettings, ImageOverlay, SourceType } from './types'

const DB_NAME = 'pagecraft-recovery'
const STORE_NAME = 'projects'
const SNAPSHOT_KEY = 'current'

interface StoredSource { id: string; name: string; type: SourceType; bytes: Uint8Array }
interface StoredAsset { id: string; name: string; mimeType: ImageOverlay['mimeType']; bytes: Uint8Array }
type StoredImageOverlay = Omit<ImageOverlay, 'bytes' | 'previewUrl'>
type StoredPage = Omit<DocumentPage, 'bytes' | 'previewUrl' | 'imageOverlays'> & { imageOverlays?: StoredImageOverlay[] }

function serializeImageOverlay(overlay: ImageOverlay): StoredImageOverlay {
  const { bytes, previewUrl, ...stored } = overlay
  void bytes; void previewUrl
  return stored
}

export interface RecoverySnapshot {
  version: 1 | 2 | 3
  savedAt: number
  sources: StoredSource[]
  assets?: StoredAsset[]
  pages: StoredPage[]
  settings: ExportSettings
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Recovery storage is unavailable'))
  })
}

async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode)
    const request = operation(transaction.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Recovery storage failed'))
    transaction.oncomplete = () => db.close()
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error('Recovery storage failed')) }
  })
}

export function createSnapshot(pages: DocumentPage[], settings: ExportSettings): RecoverySnapshot {
  const sources = new Map<string, StoredSource>()
  const assets = new Map<string, StoredAsset>()
  for (const page of pages) if (!sources.has(page.sourceId)) sources.set(page.sourceId, { id: page.sourceId, name: page.name, type: page.sourceType, bytes: page.bytes })
  for (const page of pages) for (const overlay of page.imageOverlays) if (!assets.has(overlay.assetId)) assets.set(overlay.assetId, { id: overlay.assetId, name: overlay.name, mimeType: overlay.mimeType, bytes: overlay.bytes })
  return {
    version: 3,
    savedAt: Date.now(),
    sources: [...sources.values()],
    assets: [...assets.values()],
    pages: pages.map(page => ({ id: page.id, sourceId: page.sourceId, name: page.name, sourceType: page.sourceType, sourcePage: page.sourcePage, width: page.width, height: page.height, rotation: page.rotation, grayscale: page.grayscale, textOverlays: page.textOverlays, imageOverlays: page.imageOverlays.map(serializeImageOverlay) })),
    settings,
  }
}

export async function saveRecovery(snapshot: RecoverySnapshot) { await transact('readwrite', store => store.put(snapshot, SNAPSHOT_KEY)) }

export async function loadRecovery(): Promise<RecoverySnapshot | null> {
  const snapshot = await transact<RecoverySnapshot | undefined>('readonly', store => store.get(SNAPSHOT_KEY))
  if (!snapshot || ![1, 2, 3].includes(snapshot.version) || !Array.isArray(snapshot.pages) || !Array.isArray(snapshot.sources)) return null
  return snapshot
}

export async function discardRecovery() { await transact('readwrite', store => store.delete(SNAPSHOT_KEY)) }

export async function hydrateRecovery(snapshot: RecoverySnapshot): Promise<DocumentPage[]> {
  const sources = new Map(snapshot.sources.map(source => [source.id, source]))
  const assets = new Map((snapshot.assets ?? []).map(asset => [asset.id, asset]))
  const pages: DocumentPage[] = []
  for (const stored of snapshot.pages) {
    const source = sources.get(stored.sourceId)
    if (!source) throw new Error(`Missing source for ${stored.name}`)
    const mime = source.type === 'pdf' ? 'application/pdf' : source.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
    const imageOverlays: ImageOverlay[] = (stored.imageOverlays ?? []).map(overlay => {
      const asset = assets.get(overlay.assetId)
      if (!asset) throw new Error(`Missing inserted image ${overlay.name}`)
      return { ...overlay, bytes: asset.bytes, previewUrl: URL.createObjectURL(new Blob([asset.bytes as BlobPart], { type: asset.mimeType })) }
    })
    const base: DocumentPage = { ...stored, textOverlays: (stored.textOverlays ?? []).map((overlay, index) => ({ ...overlay, backgroundColor: overlay.backgroundColor ?? null, backgroundOpacity: overlay.backgroundOpacity ?? 1, padding: overlay.padding ?? .01, borderRadius: overlay.borderRadius ?? .01, zIndex: overlay.zIndex ?? 1000 + index })), imageOverlays, bytes: source.bytes, previewUrl: '' }
    base.previewUrl = source.type === 'image' ? URL.createObjectURL(new Blob([source.bytes as BlobPart], { type: mime })) : await renderPagePreview(base, .75)
    base.previewStatus = 'ready'
    pages.push(base)
  }
  return pages
}
