/**
 * Public deployment configuration for Pagecraft.
 *
 * Edit this file, run `npm run build`, and redeploy `dist/` to apply changes.
 * Never place passwords, API keys, tokens, or other secrets here: everything in
 * this file is bundled into JavaScript and is visible to every visitor.
 */
export interface AppConfig {
  /** Public application version displayed in the footer. */
  version: string
  branding: {
    /** Application name shown in the header, footer, and browser title. */
    name: string
    /** Locale-specific short description shown beneath the application name. */
    tagline: { en: string; 'ms-MY': string }
    /** Locale-specific browser description metadata. */
    description: { en: string; 'ms-MY': string }
  }
  /** First-visit language. A saved browser preference takes precedence. */
  defaultLocale: 'en' | 'ms-MY'
  exportDefaults: {
    filename: string
    pageMode: 'original' | 'a4' | 'letter'
    orientation: 'auto' | 'portrait' | 'landscape'
    margin: 'none' | 'narrow' | 'normal'
    quality: 'small' | 'balanced' | 'best'
  }
  limits: {
    /** Maximum number of document states retained for undo and redo. */
    undoHistory: number
    /** Maximum pixel count for a high-resolution PDF viewer canvas. */
    viewerRenderPixels: number
    largeImportBytes: number
    largeImportPages: number
    thumbnailConcurrency: number
  }
}

const appConfig = {
  version: '1.0.0',
  branding: {
    name: 'EditPDF',
    tagline: {
      en: 'PDF maker',
      'ms-MY': 'Pembina PDF',
    },
    description: {
      en: 'Create and edit PDF documents privately in your browser.',
      'ms-MY': 'Cipta dan sunting dokumen PDF secara peribadi dalam pelayar anda.',
    },
  },
  defaultLocale: 'ms-MY',
  exportDefaults: {
    filename: 'bikinPDF-document',
    pageMode: 'original',
    orientation: 'auto',
    margin: 'normal',
    quality: 'balanced',
  },
  limits: {
    undoHistory: 50,
    viewerRenderPixels: 16_000_000,
    largeImportBytes: 100 * 1024 * 1024,
    largeImportPages: 250,
    thumbnailConcurrency: 2,
  },
} satisfies AppConfig

export default appConfig
