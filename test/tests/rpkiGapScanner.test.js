import { describe, it, expect, beforeEach } from 'vitest'
import { summarizeGaps, generateProactiveROA, getScanHistory, saveScanToHistory, computeTrend, clearScanHistory } from '../src/engine/rpkiGapScanner.js'

const MOCK_RESULTS = [
  { asn: 'AS1', name: 'A', sector: 'Financial',  prefix: '1.0.0.0/24', rpkiState: 'valid' },
  { asn: 'AS2', name: 'B', sector: 'Government', prefix: '2.0.0.0/24', rpkiState: 'not-found' },
  { asn: 'AS3', name: 'C', sector: 'ISP',        prefix: '3.0.0.0/24', rpkiState: 'invalid' },
  { asn: 'AS4', name: 'D', sector: 'Telecom',    prefix: '4.0.0.0/24', rpkiState: 'unknown' },
  { asn: 'AS5', name: 'E', sector: 'ISP',        prefix: '5.0.0.0/24', rpkiState: 'unreachable' },
]

describe('summarizeGaps', () => {
  it('correctly buckets all four RPKI states', () => {
    const s = summarizeGaps(MOCK_RESULTS)
    expect(s.coveredCount).toBe(1)  // valid
    expect(s.invalidCount).toBe(1)  // invalid
    // gaps = not-found + unreachable + unknown (regression guard: 'unknown'
    // was missing from this filter in the first version, undercounting gaps)
    expect(s.gapCount).toBe(3)
  })

  it('computes coverage percentage correctly', () => {
    const s = summarizeGaps(MOCK_RESULTS)
    expect(s.coveragePct).toBe(20) // 1/5 = 20%
  })

  it('sorts gap list with priority sectors first', () => {
    const s = summarizeGaps(MOCK_RESULTS)
    const sectors = s.gapList.map(g => g.sector)
    // Government (priority) should appear before ISP (non-priority)
    const govIdx = sectors.indexOf('Government')
    const ispIdx = sectors.indexOf('ISP')
    expect(govIdx).toBeLessThan(ispIdx)
  })

  it('handles an empty result set without crashing', () => {
    const s = summarizeGaps([])
    expect(s.total).toBe(0)
    expect(s.coveragePct).toBe(0)
  })
})

describe('generateProactiveROA', () => {
  it('produces valid parseable JSON', () => {
    const gap = { asn: 'AS55655', name: 'NPCI', sector: 'Financial', prefix: '103.47.140.0/22' }
    expect(() => JSON.parse(generateProactiveROA(gap))).not.toThrow()
  })

  it('frames itself as preventive, not reactive to an attack (honesty check)', () => {
    const gap = { asn: 'AS55655', name: 'NPCI', sector: 'Financial', prefix: '103.47.140.0/22' }
    const json = JSON.parse(generateProactiveROA(gap))
    expect(json.reason).toMatch(/proactive|preventive/i)
    expect(json.reason).not.toMatch(/hijack detected|attack in progress/i)
  })
})

describe('scan history / trend tracking', () => {
  beforeEach(() => {
    clearScanHistory()
  })

  it('starts with empty history', () => {
    expect(getScanHistory()).toEqual([])
  })

  it('saveScanToHistory appends a new entry', () => {
    const summary = { coveragePct: 50, total: 89, coveredCount: 44, gapCount: 40, invalidCount: 5 }
    const updated = saveScanToHistory(summary)
    expect(updated).toHaveLength(1)
    expect(updated[0].coveragePct).toBe(50)
  })

  it('history survives across multiple saves, in order', () => {
    saveScanToHistory({ coveragePct: 40, total: 89, coveredCount: 36, gapCount: 48, invalidCount: 5 })
    saveScanToHistory({ coveragePct: 55, total: 89, coveredCount: 49, gapCount: 35, invalidCount: 5 })
    const history = getScanHistory()
    expect(history).toHaveLength(2)
    expect(history[0].coveragePct).toBe(40)
    expect(history[1].coveragePct).toBe(55)
  })

  it('caps history at HISTORY_LIMIT entries (bounded growth)', () => {
    for (let i = 0; i < 25; i++) {
      saveScanToHistory({ coveragePct: i, total: 89, coveredCount: i, gapCount: 89 - i, invalidCount: 0 })
    }
    expect(getScanHistory().length).toBeLessThanOrEqual(20)
  })

  it('clearScanHistory resets to empty', () => {
    saveScanToHistory({ coveragePct: 50, total: 89, coveredCount: 44, gapCount: 40, invalidCount: 5 })
    clearScanHistory()
    expect(getScanHistory()).toEqual([])
  })
})

describe('computeTrend', () => {
  it('returns null when there is no prior history (first scan ever)', () => {
    expect(computeTrend({ coveragePct: 50 }, [])).toBeNull()
    expect(computeTrend({ coveragePct: 50 }, null)).toBeNull()
  })

  it('correctly computes a positive delta (improvement)', () => {
    const trend = computeTrend({ coveragePct: 62 }, [{ coveragePct: 41, timestamp: '2026-01-01T00:00:00Z' }])
    expect(trend.direction).toBe('improved')
    expect(trend.delta).toBe(21)
    expect(trend.previousPct).toBe(41)
  })

  it('correctly computes a negative delta (regression)', () => {
    const trend = computeTrend({ coveragePct: 30 }, [{ coveragePct: 50, timestamp: '2026-01-01T00:00:00Z' }])
    expect(trend.direction).toBe('declined')
    expect(trend.delta).toBe(-20)
  })

  it('reports unchanged when coverage is identical', () => {
    const trend = computeTrend({ coveragePct: 50 }, [{ coveragePct: 50, timestamp: '2026-01-01T00:00:00Z' }])
    expect(trend.direction).toBe('unchanged')
    expect(trend.delta).toBe(0)
  })

  it('compares against the MOST RECENT prior scan, not the first one ever', () => {
    const history = [
      { coveragePct: 20, timestamp: '2026-01-01T00:00:00Z' },
      { coveragePct: 45, timestamp: '2026-01-02T00:00:00Z' },
    ]
    const trend = computeTrend({ coveragePct: 50 }, history)
    expect(trend.previousPct).toBe(45) // not 20
  })
})
