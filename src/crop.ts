import type { ImageOverlay } from './types'

export type CropFrame = Pick<ImageOverlay, 'x' | 'y' | 'width' | 'height' | 'cropX' | 'cropY' | 'cropWidth' | 'cropHeight'>

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function cropLimits(frame: Pick<CropFrame, 'width' | 'height'>, pageWidth: number, pageHeight: number, imageWidth: number, imageHeight: number) {
  const frameAspect = frame.width * pageWidth / (frame.height * pageHeight)
  const normalizedRatio = frameAspect / (imageWidth / imageHeight)
  const maxWidth = Math.min(1, normalizedRatio)
  return { maxWidth, maxHeight: maxWidth / normalizedRatio }
}

export function cropZoom(frame: CropFrame, pageWidth: number, pageHeight: number, imageWidth: number, imageHeight: number) {
  return cropLimits(frame, pageWidth, pageHeight, imageWidth, imageHeight).maxWidth / frame.cropWidth
}

export function cropAtZoom(frame: CropFrame, zoom: number, pageWidth: number, pageHeight: number, imageWidth: number, imageHeight: number): CropFrame {
  const limits = cropLimits(frame, pageWidth, pageHeight, imageWidth, imageHeight)
  const centerX = frame.cropX + frame.cropWidth / 2, centerY = frame.cropY + frame.cropHeight / 2
  const cropWidth = limits.maxWidth / clamp(zoom, 1, 8), cropHeight = limits.maxHeight / clamp(zoom, 1, 8)
  return { ...frame, cropWidth, cropHeight, cropX: clamp(centerX - cropWidth / 2, 0, 1 - cropWidth), cropY: clamp(centerY - cropHeight / 2, 0, 1 - cropHeight) }
}

export function panCrop(frame: CropFrame, dxRatio: number, dyRatio: number): CropFrame {
  return { ...frame, cropX: clamp(frame.cropX - dxRatio * frame.cropWidth, 0, 1 - frame.cropWidth), cropY: clamp(frame.cropY - dyRatio * frame.cropHeight, 0, 1 - frame.cropHeight) }
}

export function frameAtAspect(frame: CropFrame, aspect: number, pageWidth: number, pageHeight: number, imageWidth: number, imageHeight: number): CropFrame {
  const centerX = frame.x + frame.width / 2, centerY = frame.y + frame.height / 2
  let width = frame.width, height = width * pageWidth / (aspect * pageHeight)
  if (height > 1) { height = 1; width = height * aspect * pageHeight / pageWidth }
  width = Math.max(.06, Math.min(1, width)); height = Math.max(.05, Math.min(1, height))
  const resized = { ...frame, x: clamp(centerX - width / 2, 0, 1 - width), y: clamp(centerY - height / 2, 0, 1 - height), width, height }
  return cropAtZoom(resized, cropZoom(frame, pageWidth, pageHeight, imageWidth, imageHeight), pageWidth, pageHeight, imageWidth, imageHeight)
}
