import { describe, expect, it } from 'vitest'
import pdfSource from './pdf.ts?raw'

describe('PDF.js scripting protection', () => {
  it('applies the disabled-scripting option to every document load', () => {
    const calls = pdfSource.match(/pdfjsLib\.getDocument\(/g) ?? []
    expect(calls).toHaveLength(3)
    expect(pdfSource).toContain("const PDF_DOCUMENT_OPTIONS = { enableScripting: false } as const")
    expect(pdfSource.match(/getDocument\(\{[^\n]+\.\.\.PDF_DOCUMENT_OPTIONS[^\n]+\}\)/g)).toHaveLength(calls.length)
  })
})
