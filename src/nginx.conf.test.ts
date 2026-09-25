import { describe, expect, it } from 'vitest'
import nginxConfig from '../nginx.conf?raw'

describe('production security headers', () => {
  it('sets the complete content security policy', () => {
    expect(nginxConfig).toContain('Content-Security-Policy "default-src \'self\'; script-src \'self\' \'wasm-unsafe-eval\'; worker-src \'self\' blob:; style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com; font-src \'self\' https://fonts.gstatic.com; img-src \'self\' blob: data:; connect-src \'self\'; object-src \'none\'; base-uri \'self\'; form-action \'self\'; frame-ancestors \'self\'" always;')
  })

  it('sets browser hardening headers on every response', () => {
    expect(nginxConfig).toContain('X-Content-Type-Options "nosniff" always;')
    expect(nginxConfig).toContain('Referrer-Policy "strict-origin-when-cross-origin" always;')
    expect(nginxConfig).toContain('X-Frame-Options "SAMEORIGIN" always;')
    expect(nginxConfig).toContain('Permissions-Policy "camera=(), geolocation=(), microphone=(), payment=(), usb=()" always;')
  })
})
