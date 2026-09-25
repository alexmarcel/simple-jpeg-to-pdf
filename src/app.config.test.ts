import { describe, expect, it } from 'vitest'
import appConfig from './app.config'

describe('deployment configuration', () => {
  it('provides complete bilingual branding', () => {
    expect(appConfig.branding.name.trim()).not.toBe('')
    expect(appConfig.branding.tagline.en.trim()).not.toBe('')
    expect(appConfig.branding.tagline['ms-MY'].trim()).not.toBe('')
    expect(appConfig.branding.description.en.trim()).not.toBe('')
    expect(appConfig.branding.description['ms-MY'].trim()).not.toBe('')
  })

  it('contains valid application defaults and limits', () => {
    expect(['en', 'ms-MY']).toContain(appConfig.defaultLocale)
    expect(['original', 'a4', 'letter']).toContain(appConfig.exportDefaults.pageMode)
    expect(['auto', 'portrait', 'landscape']).toContain(appConfig.exportDefaults.orientation)
    expect(['none', 'narrow', 'normal']).toContain(appConfig.exportDefaults.margin)
    expect(['small', 'balanced', 'best', 'originalQuality']).toContain(appConfig.exportDefaults.quality)
    expect(appConfig.limits.undoHistory).toBeGreaterThan(0)
    expect(appConfig.limits.viewerRenderPixels).toBeGreaterThan(1_000_000)
  })
})
