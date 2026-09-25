import { afterEach, describe, expect, it, vi } from 'vitest'
import appConfig from './app.config'
import { fileLimitFailure, imagePixelLimitFailure, importFiles, pdfPageLimitFailure, projectByteSize, shouldWarnForFile, shouldWarnForPages } from './pdf'
import type { DocumentPage, ImageOverlay } from './types'

afterEach(() => vi.unstubAllGlobals())

describe('import safety limits', () => {
  it('enforces file and aggregate byte boundaries', () => {
    const { maxFileBytes, maxProjectBytes } = appConfig.limits
    expect(fileLimitFailure(maxFileBytes - 1, 0)).toBeNull()
    expect(fileLimitFailure(maxFileBytes, 0)).toBeNull()
    expect(fileLimitFailure(maxFileBytes + 1, 0)).toBe('file-too-large')
    expect(fileLimitFailure(1, maxProjectBytes - 1)).toBeNull()
    expect(fileLimitFailure(1, maxProjectBytes)).toBe('project-too-large')
  })

  it('warns exactly at the configured byte and page thresholds', () => {
    expect(shouldWarnForFile(appConfig.limits.importWarningBytes - 1)).toBe(false)
    expect(shouldWarnForFile(appConfig.limits.importWarningBytes)).toBe(true)
    expect(shouldWarnForFile(appConfig.limits.importWarningBytes + 1)).toBe(true)
    expect(shouldWarnForPages(appConfig.limits.importWarningPages - 1)).toBe(false)
    expect(shouldWarnForPages(appConfig.limits.importWarningPages)).toBe(true)
    expect(shouldWarnForPages(appConfig.limits.importWarningPages + 1)).toBe(true)
  })

  it('enforces page and decoded-pixel boundaries', () => {
    expect(pdfPageLimitFailure(appConfig.limits.maxPdfPages)).toBeNull()
    expect(pdfPageLimitFailure(appConfig.limits.maxPdfPages + 1)).toBe('too-many-pages')
    expect(imagePixelLimitFailure(10_000, 10_000)).toBeNull()
    expect(imagePixelLimitFailure(10_000, 10_001)).toBe('image-too-large')
  })

  it('counts shared sources and assets only once', () => {
    const bytes = new Uint8Array(10)
    const overlay = { assetId: 'asset', bytes: new Uint8Array(4) } as ImageOverlay
    const base = { sourceId: 'source', bytes, imageOverlays: [overlay] } as DocumentPage
    expect(projectByteSize([base, { ...base, id: 'another' }])).toBe(14)
  })

  it('continues a mixed import after rejecting an oversized file', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 20, height: 10, close: vi.fn() })))
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:test') })
    const oversized = { name: 'too-large.pdf', type: 'application/pdf', size: appConfig.limits.maxFileBytes + 1 } as File
    const valid = new File([new Uint8Array([1, 2, 3])], 'valid.png', { type: 'image/png' })
    const result = await importFiles([oversized, valid])
    expect(result.errors).toEqual([{ code: 'file-too-large', name: 'too-large.pdf' }])
    expect(result.pages).toHaveLength(1)
    expect(result.pages[0].name).toBe('valid.png')
  })
})
