import { PDFDocument, degrees, rgb } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { DocumentPage, ExportSettings, Margin, Quality } from './types'
import appConfig from './app.config'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const viewerRenderCache = new Map<string, string>()
const pdfDocumentCache = new Map<string, Promise<pdfjsLib.PDFDocumentProxy>>()
const MAX_VIEWER_PIXELS = appConfig.limits.viewerRenderPixels
const MAX_RENDER_CACHE_ENTRIES = 32

function abortError() { return new DOMException('Import cancelled', 'AbortError') }
function throwIfAborted(signal?: AbortSignal) { if (signal?.aborted) throw abortError() }

function cachedPdf(page: DocumentPage) {
  let document = pdfDocumentCache.get(page.sourceId)
  if (!document) {
    document = pdfjsLib.getDocument({ data: page.bytes.slice() }).promise
    pdfDocumentCache.set(page.sourceId, document)
  }
  return document
}

export function clearViewerRenderCache(pageId?: string) {
  if (!pageId) {
    for (const url of viewerRenderCache.values()) URL.revokeObjectURL(url)
    viewerRenderCache.clear()
    for (const document of pdfDocumentCache.values()) void document.then(pdf => pdf.destroy()).catch(() => undefined)
    pdfDocumentCache.clear()
  }
  else for (const key of viewerRenderCache.keys()) if (key.startsWith(`${pageId}:`)) { URL.revokeObjectURL(viewerRenderCache.get(key)!); viewerRenderCache.delete(key) }
}

export async function renderPagePreview(page: DocumentPage, targetScale: number, signal?: AbortSignal): Promise<string> {
  if (page.sourceType === 'image') return page.previewUrl
  const scaleBucket = Math.max(.75, Math.min(4, Math.ceil(targetScale * 2) / 2))
  const key = `${page.id}:${scaleBucket}`
  const cached = viewerRenderCache.get(key)
  if (cached) { viewerRenderCache.delete(key); viewerRenderCache.set(key, cached); return cached }
  if (signal?.aborted) throw new DOMException('Rendering cancelled', 'AbortError')
  const pdf = await cachedPdf(page)
  {
    const pdfPage = await pdf.getPage((page.sourcePage ?? 0) + 1)
    let viewport = pdfPage.getViewport({ scale: scaleBucket })
    const pixels = viewport.width * viewport.height
    if (pixels > MAX_VIEWER_PIXELS) viewport = pdfPage.getViewport({ scale: scaleBucket * Math.sqrt(MAX_VIEWER_PIXELS / pixels) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(viewport.width))
    canvas.height = Math.max(1, Math.floor(viewport.height))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable')
    const task = pdfPage.render({ canvas, canvasContext: context, viewport })
    const cancel = () => task.cancel()
    signal?.addEventListener('abort', cancel, { once: true })
    try { await task.promise } finally { signal?.removeEventListener('abort', cancel) }
    if (signal?.aborted) throw new DOMException('Rendering cancelled', 'AbortError')
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Preview encoding failed')), 'image/jpeg', .9))
    const result = URL.createObjectURL(blob)
    viewerRenderCache.set(key, result)
    while (viewerRenderCache.size > MAX_RENDER_CACHE_ENTRIES) {
      const oldest = viewerRenderCache.keys().next().value!
      URL.revokeObjectURL(viewerRenderCache.get(oldest)!); viewerRenderCache.delete(oldest)
    }
    return result
  }
}

const qualityConfig: Record<Quality, { scale: number; jpeg: number }> = {
  small: { scale: 0.55, jpeg: 0.68 },
  balanced: { scale: 0.8, jpeg: 0.84 },
  best: { scale: 1, jpeg: 0.94 },
}

const marginPoints: Record<Margin, number> = { none: 0, narrow: 18, normal: 36 }

const fontStacks = { sans: 'Arial, sans-serif', serif: 'Georgia, serif', mono: '"Courier New", monospace' }

function drawTextOverlays(ctx: CanvasRenderingContext2D, page: DocumentPage, width: number, height: number, zIndex?: number) {
  for (const overlay of page.textOverlays) {
    if (zIndex !== undefined && overlay.zIndex !== zIndex) continue
    const fontSize = Math.max(6, overlay.fontSize * width)
    const lineHeight = fontSize * 1.25
    const boxX = overlay.x * width, boxY = overlay.y * height
    const boxWidth = overlay.width * width, boxHeight = overlay.height * height
    const padding = (overlay.padding ?? 0) * width
    const radius = Math.min((overlay.borderRadius ?? 0) * width, boxWidth / 2, boxHeight / 2)
    ctx.save()
    if (overlay.backgroundColor) {
      ctx.globalAlpha = overlay.backgroundOpacity ?? 1
      ctx.fillStyle = overlay.backgroundColor
      ctx.beginPath(); ctx.roundRect(boxX, boxY, boxWidth, boxHeight, radius); ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.beginPath(); ctx.rect(boxX, boxY, boxWidth, boxHeight); ctx.clip()
    ctx.fillStyle = overlay.color
    ctx.font = `${overlay.italic ? 'italic ' : ''}${overlay.bold ? '700 ' : '400 '}${fontSize}px ${fontStacks[overlay.fontFamily]}`
    ctx.textBaseline = 'top'; ctx.textAlign = overlay.align; ctx.direction = 'inherit'
    const textX = boxX + padding, textWidth = Math.max(1, boxWidth - padding * 2)
    const drawX = overlay.align === 'left' ? textX : overlay.align === 'center' ? boxX + boxWidth / 2 : boxX + boxWidth - padding
    let y = boxY + padding
    for (const paragraph of overlay.text.split('\n')) {
      const segments = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(paragraph)].map(item => item.segment) : Array.from(paragraph)
      let line = ''
      for (const segment of segments) {
        const candidate = line + segment
        if (line && ctx.measureText(candidate).width > textWidth) { ctx.fillText(line.trimEnd(), drawX, y); y += lineHeight; line = segment.trimStart() } else line = candidate
        if (y + lineHeight > boxY + boxHeight - padding) break
      }
      if (y + lineHeight <= boxY + boxHeight - padding) { ctx.fillText(line, drawX, y); y += lineHeight }
      if (y + lineHeight > boxY + boxHeight - padding) break
    }
    ctx.restore()
  }
}

async function drawPageOverlays(ctx: CanvasRenderingContext2D, page: DocumentPage, width: number, height: number) {
  const layers = [...page.imageOverlays.map(overlay => ({ kind: 'image' as const, zIndex: overlay.zIndex, overlay })), ...page.textOverlays.map(overlay => ({ kind: 'text' as const, zIndex: overlay.zIndex, overlay }))].sort((a, b) => a.zIndex - b.zIndex)
  for (const layer of layers) {
    if (layer.kind === 'text') { drawTextOverlays(ctx, page, width, height, layer.zIndex); continue }
    const overlay = layer.overlay
    const bitmap = await createImageBitmap(new Blob([overlay.bytes as BlobPart], { type: overlay.mimeType }))
    try {
      const sx = overlay.cropX * bitmap.width, sy = overlay.cropY * bitmap.height
      const sw = overlay.cropWidth * bitmap.width, sh = overlay.cropHeight * bitmap.height
      ctx.save(); ctx.globalAlpha = overlay.opacity; if (overlay.grayscale) ctx.filter = 'grayscale(1)'
      ctx.drawImage(bitmap, sx, sy, sw, sh, overlay.x * width, overlay.y * height, overlay.width * width, overlay.height * height)
      ctx.restore()
    } finally { bitmap.close() }
  }
}

async function overlayPng(page: DocumentPage): Promise<Uint8Array> {
  const scale = Math.min(3, Math.max(1, 1800 / page.width))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(page.width * scale)); canvas.height = Math.max(1, Math.round(page.height * scale))
  const context = canvas.getContext('2d')!
  await drawPageOverlays(context, page, canvas.width, canvas.height)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Text rendering failed')), 'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}

export interface ImportFailure { code: 'unsupported' | 'unreadable'; name: string }
export interface ImportOptions {
  signal?: AbortSignal
  batchSize?: number
  onBatch?: (pages: DocumentPage[]) => void
  onDiscovered?: (name: string, pages: number) => void
  confirmLarge?: (name: string, bytes: number, pages: number) => boolean | Promise<boolean>
}
export async function importFiles(files: File[], options: ImportOptions = {}): Promise<{ pages: DocumentPage[]; errors: ImportFailure[] }> {
  const pages: DocumentPage[] = []
  const errors: ImportFailure[] = []
  for (const file of files) {
    throwIfAborted(options.signal)
    try {
      let imported: DocumentPage[] = []
      let emitted = false
      if (file.type === 'image/jpeg' || file.type === 'image/png') imported = [await imagePage(file)]
      else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) { imported = await pdfPages(file, options); emitted = true }
      else errors.push({ code: 'unsupported', name: file.name })
      pages.push(...imported)
      const size = Math.max(1, options.batchSize ?? 25)
      for (let index = 0; !emitted && index < imported.length; index += size) {
        throwIfAborted(options.signal)
        options.onBatch?.(imported.slice(index, index + size))
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      errors.push({ code: 'unreadable', name: file.name })
    }
  }
  return { pages, errors }
}

async function imagePage(file: File): Promise<DocumentPage> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const sourceId = crypto.randomUUID()
  const previewUrl = URL.createObjectURL(file)
  const bitmap = await createImageBitmap(file)
  const page: DocumentPage = { id: crypto.randomUUID(), sourceId, name: file.name, sourceType: 'image', bytes, previewUrl, previewStatus: 'ready', width: bitmap.width, height: bitmap.height, rotation: 0, grayscale: false, textOverlays: [], imageOverlays: [] }
  bitmap.close()
  return page
}

async function pdfPages(file: File, options: ImportOptions): Promise<DocumentPage[]> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  throwIfAborted(options.signal)
  const sourceId = crypto.randomUUID()
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
  options.onDiscovered?.(file.name, pdf.numPages)
  if ((file.size >= appConfig.limits.largeImportBytes || pdf.numPages >= appConfig.limits.largeImportPages) && options.confirmLarge && !await options.confirmLarge(file.name, file.size, pdf.numPages)) {
    await pdf.destroy(); throw abortError()
  }
  const result: DocumentPage[] = []
  let pending: DocumentPage[] = []
  const batchSize = Math.max(1, options.batchSize ?? 25)
  for (let n = 1; n <= pdf.numPages; n++) {
    throwIfAborted(options.signal)
    const page = await pdf.getPage(n)
    const viewport = page.getViewport({ scale: 1 })
    const descriptor: DocumentPage = { id: crypto.randomUUID(), sourceId, name: file.name, sourceType: 'pdf', sourcePage: n - 1, bytes, previewUrl: '', previewStatus: 'pending', width: viewport.width, height: viewport.height, rotation: 0, grayscale: false, textOverlays: [], imageOverlays: [] }
    result.push(descriptor); pending.push(descriptor)
    if (pending.length === batchSize || n === pdf.numPages) {
      options.onBatch?.(pending); pending = []
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    }
  }
  await pdf.destroy()
  return result
}

function paperSize(settings: ExportSettings, width: number, height: number): [number, number] {
  if (settings.mode === 'original') return [width * 0.75, height * 0.75]
  const base: [number, number] = settings.mode === 'a4' ? [595.28, 841.89] : [612, 792]
  const landscape = settings.orientation === 'landscape' || (settings.orientation === 'auto' && width > height)
  return landscape ? [base[1], base[0]] : base
}

async function rasterize(page: DocumentPage, quality: Quality): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const config = qualityConfig[quality]
  let source: CanvasImageSource
  let cleanup = () => {}
  if (page.sourceType === 'image') {
    const blob = new Blob([page.bytes as BlobPart])
    const bitmap = await createImageBitmap(blob)
    source = bitmap
    cleanup = () => bitmap.close()
  } else {
    const pdf = await pdfjsLib.getDocument({ data: page.bytes.slice() }).promise
    const pdfPage = await pdf.getPage((page.sourcePage ?? 0) + 1)
    const viewport = pdfPage.getViewport({ scale: config.scale * 1.6 })
    const temp = document.createElement('canvas')
    temp.width = viewport.width
    temp.height = viewport.height
    await pdfPage.render({ canvas: temp, canvasContext: temp.getContext('2d')!, viewport }).promise
    source = temp
    cleanup = () => { void pdf.destroy() }
  }
  const swapped = page.rotation === 90 || page.rotation === 270
  const sourceWidth = page.sourceType === 'image' ? page.width * config.scale : (source as HTMLCanvasElement).width
  const sourceHeight = page.sourceType === 'image' ? page.height * config.scale : (source as HTMLCanvasElement).height
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(swapped ? sourceHeight : sourceWidth))
  canvas.height = Math.max(1, Math.round(swapped ? sourceWidth : sourceHeight))
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(page.rotation * Math.PI / 180)
  if (page.grayscale) ctx.filter = 'grayscale(1)'
  ctx.drawImage(source, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight)
  if (page.textOverlays.length || page.imageOverlays.length) {
    ctx.filter = 'none'
    ctx.translate(-sourceWidth / 2, -sourceHeight / 2)
    await drawPageOverlays(ctx, page, sourceWidth, sourceHeight)
  }
  cleanup()
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Encoding failed')), 'image/jpeg', config.jpeg))
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height }
}

export async function exportPdf(pages: DocumentPage[], settings: ExportSettings, onProgress: (done: number) => void): Promise<Uint8Array> {
  const output = await PDFDocument.create()
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    if (page.sourceType === 'pdf' && page.rotation === 0 && !page.grayscale && settings.mode === 'original') {
      const source = await PDFDocument.load(page.bytes)
      const [copied] = await output.copyPages(source, [page.sourcePage ?? 0])
      output.addPage(copied)
      if (page.textOverlays.length || page.imageOverlays.length) {
        const overlay = await output.embedPng(await overlayPng(page))
        const { width, height } = copied.getSize()
        copied.drawImage(overlay, { x: 0, y: 0, width, height })
      }
    } else {
      const raster = await rasterize(page, settings.quality)
      const image = await output.embedJpg(raster.bytes)
      const [pw, ph] = paperSize(settings, raster.width, raster.height)
      const target = output.addPage([pw, ph])
      target.drawRectangle({ x: 0, y: 0, width: pw, height: ph, color: rgb(1, 1, 1) })
      const margin = marginPoints[settings.margin]
      const scale = Math.min((pw - margin * 2) / raster.width, (ph - margin * 2) / raster.height)
      const w = raster.width * scale, h = raster.height * scale
      target.drawImage(image, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h, rotate: degrees(0) })
    }
    onProgress(i + 1)
  }
  return output.save()
}
