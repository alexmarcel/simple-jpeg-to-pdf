export type SourceType = 'image' | 'pdf'
export type PageMode = 'original' | 'a4' | 'letter'
export type Orientation = 'auto' | 'portrait' | 'landscape'
export type Margin = 'none' | 'narrow' | 'normal'
export type Quality = 'small' | 'balanced' | 'best' | 'originalQuality'
export type TextFont = 'sans' | 'serif' | 'mono'
export type TextAlign = 'left' | 'center' | 'right'

export interface TextOverlay {
  id: string
  text: string
  x: number
  y: number
  width: number
  height: number
  fontFamily: TextFont
  fontSize: number
  color: string
  backgroundColor: string | null
  backgroundOpacity: number
  padding: number
  borderRadius: number
  bold: boolean
  italic: boolean
  align: TextAlign
  zIndex: number
}

export interface ImageOverlay {
  id: string
  assetId: string
  name: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  bytes: Uint8Array
  previewUrl: string
  naturalWidth: number
  naturalHeight: number
  x: number
  y: number
  width: number
  height: number
  cropX: number
  cropY: number
  cropWidth: number
  cropHeight: number
  opacity: number
  grayscale: boolean
  zIndex: number
}

export interface DocumentPage {
  id: string
  sourceId: string
  name: string
  sourceType: SourceType
  sourcePage?: number
  bytes: Uint8Array
  previewUrl: string
  previewStatus?: 'pending' | 'rendering' | 'ready' | 'failed'
  width: number
  height: number
  rotation: 0 | 90 | 180 | 270
  grayscale: boolean
  textOverlays: TextOverlay[]
  imageOverlays: ImageOverlay[]
}

export interface DocumentState { pages: DocumentPage[] }

export interface HistoryState {
  past: DocumentState[]
  present: DocumentState
  future: DocumentState[]
  /** Baseline retained while pages are progressively committed. */
  importBaseline?: DocumentState
}

export type PageEdit = 'rotate' | 'grayscale' | 'duplicate' | 'remove'

export type DocumentAction =
  | { type: 'ADD_PAGES'; pages: DocumentPage[] }
  | { type: 'CLEAR' }
  | { type: 'REORDER'; from: number; to: number }
  | { type: 'ROTATE'; ids: string[] }
  | { type: 'SET_GRAYSCALE'; ids: string[]; value: boolean }
  | { type: 'DUPLICATE'; ids: string[] }
  | { type: 'DELETE'; ids: string[] }
  | { type: 'ADD_TEXT'; pageId: string; overlay: TextOverlay }
  | { type: 'UPDATE_TEXT'; pageId: string; overlayId: string; patch: Partial<TextOverlay> }
  | { type: 'DELETE_TEXT'; pageId: string; overlayId: string }
  | { type: 'DUPLICATE_TEXT'; pageId: string; overlayId: string }
  | { type: 'ADD_IMAGES'; pageId: string; overlays: ImageOverlay[] }
  | { type: 'UPDATE_IMAGE'; pageId: string; overlayId: string; patch: Partial<ImageOverlay> }
  | { type: 'DELETE_IMAGE'; pageId: string; overlayId: string }
  | { type: 'DUPLICATE_IMAGE'; pageId: string; overlayId: string }
  | { type: 'MOVE_IMAGE_LAYER'; pageId: string; overlayId: string; direction: 'forward' | 'backward' }
  | { type: 'RESET'; pages: DocumentPage[] }
  | { type: 'BEGIN_IMPORT' }
  | { type: 'ADD_IMPORT_BATCH'; pages: DocumentPage[] }
  | { type: 'FINISH_IMPORT' }
  | { type: 'CANCEL_IMPORT' }
  | { type: 'SET_PAGE_PREVIEW'; pageId: string; previewUrl: string; status: 'ready' | 'failed' | 'rendering' }
  | { type: 'UNDO' }
  | { type: 'REDO' }

export interface ExportSettings {
  mode: PageMode
  orientation: Orientation
  margin: Margin
  quality: Quality
  filename: string
}
