import { describe, expect, it } from 'vitest'
import { cropAtZoom, cropLimits, frameAtAspect, panCrop, type CropFrame } from './crop'

const frame: CropFrame = { x: .2, y: .2, width: .4, height: .3, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 }

describe('crop geometry', () => {
  it('calculates a covering crop without empty pixels', () => {
    const limits = cropLimits(frame, 800, 1000, 1600, 900)
    expect(limits.maxWidth).toBeLessThanOrEqual(1)
    expect(limits.maxHeight).toBeLessThanOrEqual(1)
  })
  it('zooms around the crop center and clamps bounds', () => {
    const result = cropAtZoom(frame, 2, 800, 1000, 1600, 900)
    expect(result.cropX).toBeGreaterThanOrEqual(0); expect(result.cropX + result.cropWidth).toBeLessThanOrEqual(1)
  })
  it('pans without exposing pixels outside the image', () => {
    const result = panCrop({ ...frame, cropWidth: .5, cropHeight: .5 }, 20, -20)
    expect(result.cropX).toBe(0); expect(result.cropY).toBe(.5)
  })
  it('creates square frames in page coordinates', () => {
    const result = frameAtAspect(frame, 1, 800, 1000, 1600, 900)
    expect(result.width * 800 / (result.height * 1000)).toBeCloseTo(1)
  })
})
