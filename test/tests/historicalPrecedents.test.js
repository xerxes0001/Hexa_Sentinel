import { describe, it, expect } from 'vitest'
import { matchPrecedents, HISTORICAL_PRECEDENTS } from '../src/data/historicalPrecedents.js'

describe('matchPrecedents', () => {
  it('returns empty array for an incident with no type', () => {
    expect(matchPrecedents({})).toHaveLength(0)
  })

  it('matches ORIGIN_HIJACK incidents to at least the Pakistan/YouTube and Rostelecom precedents', () => {
    const matches = matchPrecedents({ type: 'ORIGIN_HIJACK' })
    const ids = matches.map(m => m.id)
    expect(ids).toContain('pakistan-youtube-2008')
    expect(ids).toContain('rostelecom-2022')
  })

  it('does NOT match coordinated-attack-only precedents unless the incident has coordinatedAttack set', () => {
    const withoutCorrelation = matchPrecedents({ type: 'SUBPREFIX_HIJACK' })
    const ids = withoutCorrelation.map(m => m.id)
    expect(ids).not.toContain('myetherwallet-2018')
    expect(ids).not.toContain('klayswap-2022')
  })

  it('DOES match coordinated-attack precedents when the incident has coordinatedAttack set', () => {
    const withCorrelation = matchPrecedents({ type: 'SUBPREFIX_HIJACK', coordinatedAttack: { domain: 'test.com' } })
    const ids = withCorrelation.map(m => m.id)
    expect(ids).toContain('myetherwallet-2018')
    expect(ids).toContain('klayswap-2022')
  })

  it('returns no matches for an attack type with no real precedent in the dataset', () => {
    expect(matchPrecedents({ type: 'PATH_MANIPULATION' })).toHaveLength(0)
  })

  it('every precedent has a source citation (no unsourced claims)', () => {
    for (const p of HISTORICAL_PRECEDENTS) {
      expect(p.source, `${p.id} needs a source`).toBeTruthy()
    }
  })

  it('every precedent has both a summary and a lesson (not just a name)', () => {
    for (const p of HISTORICAL_PRECEDENTS) {
      expect(p.summary.length).toBeGreaterThan(30)
      expect(p.lesson.length).toBeGreaterThan(20)
    }
  })
})

describe('matchPrecedents — weighted similarity scoring', () => {
  it('every returned match has a numeric matchScore between 0 and 100', () => {
    const matches = matchPrecedents({ type: 'ORIGIN_HIJACK', severity: 'CRITICAL' })
    for (const m of matches) {
      expect(m.matchScore).toBeGreaterThanOrEqual(0)
      expect(m.matchScore).toBeLessThanOrEqual(100)
    }
  })

  it('results are sorted by descending matchScore, not just insertion order', () => {
    const matches = matchPrecedents({ type: 'SUBPREFIX_HIJACK', severity: 'CRITICAL', coordinatedAttack: { domain: 'x' }, victim: { sector: 'Financial' } })
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].matchScore).toBeGreaterThanOrEqual(matches[i].matchScore)
    }
  })

  it('a precedent matching primary type + sector + coordinated attack + severity scores at or near 100', () => {
    const matches = matchPrecedents({
      type: 'SUBPREFIX_HIJACK', severity: 'CRITICAL',
      coordinatedAttack: { domain: 'test.com' }, victim: { sector: 'Financial' },
    })
    const mew = matches.find(m => m.id === 'myetherwallet-2018')
    expect(mew.matchScore).toBe(100)
  })

  it('a precedent matching only a secondary type scores lower than one matching the primary type', () => {
    // Rostelecom's primaryType is ORIGIN_HIJACK; for a SUBPREFIX_HIJACK
    // incident it should score lower than for an ORIGIN_HIJACK incident.
    const asOrigin    = matchPrecedents({ type: 'ORIGIN_HIJACK', severity: 'LOW' }).find(m => m.id === 'rostelecom-2022')
    const asSubprefix = matchPrecedents({ type: 'SUBPREFIX_HIJACK', severity: 'LOW' }).find(m => m.id === 'rostelecom-2022')
    expect(asOrigin.matchScore).toBeGreaterThan(asSubprefix.matchScore)
  })

  it('sector mismatch never crashes and never awards sector points for precedents with no known sector', () => {
    // Pakistan/YouTube has sectors:[] (real target wasn't in SHYEN's taxonomy)
    const matches = matchPrecedents({ type: 'ORIGIN_HIJACK', severity: 'LOW', victim: { sector: 'Financial' } })
    const pk = matches.find(m => m.id === 'pakistan-youtube-2008')
    expect(pk).toBeTruthy() // still matches on type, just without the sector bonus
  })

  it('does not penalize a precedent for a criterion that was never part of its real story', () => {
    // Pakistan/YouTube never involved a coordinated cert attack — it
    // shouldn't be scored against that criterion at all (denominator
    // excludes it), so a low-severity, no-sector-match, primary-type-match
    // incident should still score reasonably, not artificially low.
    const matches = matchPrecedents({ type: 'ORIGIN_HIJACK', severity: 'LOW' })
    const pk = matches.find(m => m.id === 'pakistan-youtube-2008')
    // 40/(40+15) = 73%, not e.g. 40/100=40% — both sector and coordinated
    // attack are excluded from the denominator (never part of this
    // precedent's real story), not silently unearnable.
    expect(pk.matchScore).toBe(73)
  })
})
