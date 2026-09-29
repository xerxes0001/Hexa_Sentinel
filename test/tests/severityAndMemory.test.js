import { describe, it, expect } from 'vitest'
import { getSeverity } from '../src/engine/severityEngine.js'
import { escalateSeverity } from '../src/engine/attackMemory.js'

describe('getSeverity — severity matrix', () => {
  it('ORIGIN_HIJACK on Financial is CRITICAL', () => {
    expect(getSeverity('ORIGIN_HIJACK', 'Financial')).toBe('CRITICAL')
  })

  it('PATH_MANIPULATION on ISP is LOW', () => {
    expect(getSeverity('PATH_MANIPULATION', 'ISP')).toBe('LOW')
  })

  it('falls back to LOW for an unknown attack type', () => {
    expect(getSeverity('UNKNOWN_TYPE', 'Financial')).toBe('LOW')
  })

  it('falls back to LOW for an unknown sector', () => {
    expect(getSeverity('ORIGIN_HIJACK', 'UnknownSector')).toBe('LOW')
  })
})

describe('escalateSeverity — repeat attacker ladder', () => {
  it('does not escalate a first-time attacker', () => {
    expect(escalateSeverity('MEDIUM', false)).toBe('MEDIUM')
  })

  it('escalates MEDIUM to HIGH for a repeat attacker', () => {
    expect(escalateSeverity('MEDIUM', true)).toBe('HIGH')
  })

  it('escalates HIGH to CRITICAL for a repeat attacker', () => {
    expect(escalateSeverity('HIGH', true)).toBe('CRITICAL')
  })

  it('CRITICAL stays CRITICAL — does not overflow the ladder (regression guard)', () => {
    expect(escalateSeverity('CRITICAL', true)).toBe('CRITICAL')
  })

  it('escalates LOW to MEDIUM for a repeat attacker', () => {
    expect(escalateSeverity('LOW', true)).toBe('MEDIUM')
  })
})
