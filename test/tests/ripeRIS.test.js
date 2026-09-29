import { describe, it, expect } from 'vitest'
import { computeIsExpectedOrigin, scoreConfidence, scoreConfidenceBreakdown } from '../src/api/ripeRIS.js'

describe('computeIsExpectedOrigin — regression guard for sentinel-string bug', () => {
  it('treats a normal, correctly-matched origin as expected', () => {
    const matched = { asn: 'AS55655', isUnknown: false }
    expect(computeIsExpectedOrigin(matched, 'AS55655')).toBe(true)
  })

  it('treats a genuinely different origin as unexpected (real hijack signal)', () => {
    const matched = { asn: 'AS55655', isUnknown: false }
    expect(computeIsExpectedOrigin(matched, 'AS4134')).toBe(false)
  })

  // This is the exact bug found this session: apnic.js's two fallback code
  // paths tag unknown-ISP prefixes with different sentinel ASN strings
  // ('AS-IN-UNKNOWN' and 'AS-IN'), and ripeRIS.js used to compare against a
  // third, different string ('AS-UNKNOWN-IN') that matched neither —
  // meaning ALL traffic on unclaimed Indian IP ranges was scored as a
  // false origin mismatch, generating false-positive hijack alerts.
  it('treats an "AS-IN-UNKNOWN" sentinel prefix as expected regardless of origin (bug fix)', () => {
    const matched = { asn: 'AS-IN-UNKNOWN', isUnknown: true }
    expect(computeIsExpectedOrigin(matched, 'AS4134')).toBe(true)
  })

  it('treats an "AS-IN" sentinel prefix as expected regardless of origin (bug fix)', () => {
    const matched = { asn: 'AS-IN', isUnknown: true }
    expect(computeIsExpectedOrigin(matched, 'AS9999')).toBe(true)
  })

  it('does NOT treat an unknown-flagged prefix as unexpected just because the raw asn string looks unfamiliar', () => {
    // Guards against ever reverting to fragile string-matching in the future
    const matched = { asn: 'SOME-FUTURE-SENTINEL-FORMAT', isUnknown: true }
    expect(computeIsExpectedOrigin(matched, 'AS1')).toBe(true)
  })
})

describe('scoreConfidence — sanity bounds', () => {
  it('never returns a score outside 0-100', () => {
    // Worst-case: every signal maxed out
    const maxSignals = {
      pathAnomaly: 'PATH_TOO_SHORT', prependCount: 10,
      hasSuspiciousCommunity: true, hasBlackholeComm: true,
      isExpectedOrigin: false, prefix: '1.2.3.4/24',
      matchedASN: { prefixes: ['1.2.3.4/16'] },
    }
    expect(scoreConfidence(maxSignals, 'invalid')).toBeLessThanOrEqual(100)
  })

  it('never returns a negative score', () => {
    const minSignals = {
      pathAnomaly: null, prependCount: 0,
      hasSuspiciousCommunity: false, hasBlackholeComm: false,
      isExpectedOrigin: true, prefix: '1.2.3.4/24',
      matchedASN: { prefixes: ['1.2.3.4/24'] },
    }
    expect(scoreConfidence(minSignals, 'valid')).toBeGreaterThanOrEqual(0)
  })

  it('a clean, expected-origin, RPKI-valid route scores low', () => {
    const clean = {
      pathAnomaly: null, prependCount: 0,
      hasSuspiciousCommunity: false, hasBlackholeComm: false,
      isExpectedOrigin: true, prefix: '1.2.3.4/24',
      matchedASN: { prefixes: ['1.2.3.4/24'] },
    }
    expect(scoreConfidence(clean, 'valid')).toBeLessThan(30)
  })
})

describe('scoreConfidenceBreakdown — explainability', () => {
  const signals = {
    pathAnomaly: null, prependCount: 0,
    hasSuspiciousCommunity: false, hasBlackholeComm: false,
    isExpectedOrigin: false, prefix: '1.2.3.4/24',
    matchedASN: { prefixes: ['1.2.3.4/24'] },
  }

  it('the sum of all factor points always equals the total', () => {
    const { total, factors } = scoreConfidenceBreakdown(signals, 'invalid')
    const sum = factors.reduce((s, f) => s + f.points, 0)
    // total is clamped to 0-100; sum should match unless clamping kicked in
    expect(sum).toBe(total)
  })

  it('scoreConfidence(entry, rpkiState) matches scoreConfidenceBreakdown(...).total exactly', () => {
    // These must never drift apart — scoreConfidence delegates to the
    // breakdown function specifically so there's only one source of truth.
    for (const rpkiState of ['valid', 'invalid', 'not-found', null]) {
      expect(scoreConfidence(signals, rpkiState)).toBe(scoreConfidenceBreakdown(signals, rpkiState).total)
    }
  })

  it('every factor has a human-readable label, not just a number', () => {
    const { factors } = scoreConfidenceBreakdown(signals, 'invalid')
    for (const f of factors) {
      expect(typeof f.label).toBe('string')
      expect(f.label.length).toBeGreaterThan(5)
    }
  })

  it('always includes the base score as the first factor', () => {
    const { factors } = scoreConfidenceBreakdown(signals, null)
    expect(factors[0].label).toMatch(/base/i)
    expect(factors[0].points).toBe(40)
  })
})
