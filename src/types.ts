export type SourceType = 'image' | 'pdf'
export type PageMode = 'original' | 'a4' | 'letter'
export type Orientation = 'auto' | 'portrait' | 'landscape'
export type Margin = 'none' | 'narrow' | 'normal'
export type Quality = 'small' | 'balanced' | 'best'

export interface DocumentPage {
  id: string
  name: string
  sourceType: SourceType
  sourcePage?: number
  bytes: Uint8Array
  previewUrl: string
  width: number
  height: number
  rotation: 0 | 90 | 180 | 270
  grayscale: boolean
}

export interface ExportSettings {
  mode: PageMode
  orientation: Orientation
  margin: Margin
  quality: Quality
  filename: string
}
