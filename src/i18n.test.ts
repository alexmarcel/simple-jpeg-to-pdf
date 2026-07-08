import { describe, expect, it } from 'vitest'
import { translate, translationKeys, translations } from './i18n'

describe('localization', () => {
  it('keeps English and Bahasa Malaysia dictionaries in parity', () => {
    expect(Object.keys(translations.en).sort()).toEqual(Object.keys(translations['ms-MY']).sort())
    expect(translationKeys.length).toBeGreaterThan(100)
  })
  it('interpolates variables in either language', () => {
    expect(translate('en', 'selected', { count: 3 })).toBe('3 selected')
    expect(translate('ms-MY', 'selected', { count: 3 })).toBe('3 dipilih')
  })
  it('uses localized recovery copy', () => {
    expect(translate('ms-MY', 'pickUp')).toBe('Sambung kerja anda?')
  })
})
