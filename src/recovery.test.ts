import { describe, expect, it } from 'vitest'
import appConfig from './app.config'
import { isRecoveryExpired, isValidRecoverySnapshot, type RecoverySnapshot } from './recovery'

const snapshot: RecoverySnapshot = { version: 3, savedAt: 1_000, sources: [], assets: [], pages: [], settings: { mode: 'original', orientation: 'auto', margin: 'normal', quality: 'balanced', filename: 'document' } }

describe('recovery retention', () => {
  it('expires at the 24-hour boundary', () => {
    const ttl = appConfig.limits.recoveryMaxAgeMs
    expect(isRecoveryExpired(snapshot, snapshot.savedAt + ttl - 1)).toBe(false)
    expect(isRecoveryExpired(snapshot, snapshot.savedAt + ttl)).toBe(true)
    expect(isRecoveryExpired(snapshot, snapshot.savedAt + ttl + 1)).toBe(true)
  })

  it('rejects future, malformed, and incomplete snapshots', () => {
    expect(isRecoveryExpired(snapshot, snapshot.savedAt - 1)).toBe(true)
    expect(isValidRecoverySnapshot(snapshot)).toBe(true)
    expect(isValidRecoverySnapshot({ ...snapshot, pages: null })).toBe(false)
    expect(isValidRecoverySnapshot({ ...snapshot, savedAt: Number.NaN })).toBe(false)
    expect(isValidRecoverySnapshot({ ...snapshot, settings: {} })).toBe(false)
  })
})
