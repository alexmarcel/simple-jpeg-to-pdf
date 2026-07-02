import { PDFDocument, degrees, rgb } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { DocumentPage, ExportSettings, Margin, Quality } from './types'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const viewerRenderCache = new Map<string, string>()
const MAX_VIEWER_PIXELS = 16_000_000

export function clearViewerRenderCache(pageId?: string) {
  if (!pageId) viewerRenderCache.clear()
  else for (const key of viewerRenderCache.keys()) if (key.startsWith(`${pageId}:`)) viewerRenderCache.delete(key)
}

export async function renderPagePreview(page: DocumentPage, targetScale: number, signal?: AbortSignal): Promise<string> {
  if (page.sourceType === 'image') return page.previewUrl
  const scaleBucket = Math.max(.75, Math.min(4, Math.ceil(targetScale * 2) / 2))
  const key = `${page.id}:${scaleBucket}`
  const cached = viewerRenderCache.get(key)
  if (cached) return cached
  if (signal?.aborted) throw new DOMException('Rendering cancelled', 'AbortError')
  const pdf = await pdfjsLib.getDocument({ data: page.bytes.slice() }).promise
  try {
    const pdfPage = await pdf.getPage((page.sourcePage ?? 0) + 1)
    let viewport = pdfPage.getViewport({ scale: scaleBucket })
    const pixels = viewport.width * viewport.height
    if (pixels > MAX_VIEWER_PIXELS) viewport = pdfPage.getViewport({ scale: scaleBucket * Math.sqrt(MAX_VIEWER_PIXELS / pixels) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(viewport.width))
    canvas.height = Math.max(1, Math.floor(viewport.height))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable')
    await pdfPage.render({ canvas, canvasContext: context, viewport }).promise
    if (signal?.aborted) throw new DOMException('Rendering cancelled', 'AbortError')
    const result = canvas.toDataURL('image/jpeg', .9)
    viewerRenderCache.set(key, result)
    return result
  } finally {
    await pdf.destroy()
  }
}

const qualityConfig: Record<Quality, { scale: number; jpeg: number }> = {
  small: { scale: 0.55, jpeg: 0.68 },
  balanced: { scale: 0.8, jpeg: 0.84 },
  best: { scale: 1, jpeg: 0.94 },
}

const marginPoints: Record<Margin, number> = { none: 0, narrow: 18, normal: 36 }

export async function importFiles(files: File[]): Promise<{ pages: DocumentPage[]; errors: string[] }> {
  const pages: DocumentPage[] = []
  const errors: string[] = []
  for (const file of files) {
    try {
      if (file.type === 'image/jpeg' || file.type === 'image/png') pages.push(await imagePage(file))
      else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) pages.push(...await pdfPages(file))
      else errors.push(`${file.name}: unsupported format`)
    } catch {
      errors.push(`${file.name}: could not be read`)
    }
  }
  return { pages, errors }
}

async function imagePage(file: File): Promise<DocumentPage> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const previewUrl = URL.createObjectURL(file)
  const bitmap = await createImageBitmap(file)
  const page: DocumentPage = { id: crypto.randomUUID(), name: file.name, sourceType: 'image', bytes, previewUrl, width: bitmap.width, height: bitmap.height, rotation: 0, grayscale: false }
  bitmap.close()
  return page
}

async function pdfPages(file: File): Promise<DocumentPage[]> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
  const result: DocumentPage[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const viewport = page.getViewport({ scale: 0.45 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const context = canvas.getContext('2d')!
    await page.render({ canvas, canvasContext: context, viewport }).promise
    result.push({ id: crypto.randomUUID(), name: file.name, sourceType: 'pdf', sourcePage: n - 1, bytes, previewUrl: canvas.toDataURL('image/jpeg', 0.76), width: viewport.width / 0.45, height: viewport.height / 0.45, rotation: 0, grayscale: false })
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
