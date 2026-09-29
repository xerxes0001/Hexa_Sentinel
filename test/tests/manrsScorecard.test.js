import { describe, it, expect } from 'vitest'
import { computeManrsScorecard, MANRS_ACTIONS } from '../src/engine/manrsScorecard.js'

describe('MANRS_ACTIONS — real framework data integrity', () => {
  it('has exactly the 4 real MANRS network operator actions', () => {
    expect(MANRS_ACTIONS).toHaveLength(4)
    const names = MANRS_ACTIONS.map(a => a.name)
    expect(names).toContain('Filtering')
    expect(names).toContain('Anti-Spoofing')
    expect(names).toContain('Coordination')
    expect(names).toContain('Global Validation')
  })

  it('only Global Validation is marked measurable (honesty guard)', () => {
    const measurable = MANRS_ACTIONS.filter(a => a.measurable)
    expect(measurable).toHaveLength(1)
    expect(measurable[0].id).toBe('validation')
  })

  it('every unmeasurable action has a stated reason (no silent gaps)', () => {
    for (const action of MANRS_ACTIONS.filter(a => !a.measurable)) {
      expect(action.reason, `${action.name} needs a reason it's not measured`).toBeTruthy()
    }
  })
})

describe('computeManrsScorecard', () => {
  it('gives Global Validation a real numeric score from gap scan data', () => {
    const gapSummary = { coveragePct: 62, coveredCount: 55, total: 89 }
    const scorecard = computeManrsScorecard(gapSummary)
    const validation = scorecard.actions.find(a => a.id === 'validation')
    expect(validation.score).toBe(62)
  })

  it('never fabricates a score for the 3 unmeasurable actions', () => {
    const gapSummary = { coveragePct: 62, coveredCount: 55, total: 89 }
    const scorecard = computeManrsScorecard(gapSummary)
    const others = scorecard.actions.filter(a => a.id !== 'validation')
    for (const action of others) {
      expect(action.score).toBeNull()
    }
  })

  it('handles a missing gap summary without crashing or fabricating data', () => {
    const scorecard = computeManrsScorecard(null)
    const validation = scorecard.actions.find(a => a.id === 'validation')
    expect(validation.score).toBeNull()
  })

  it('reports the honest 1-of-4 measurable count', () => {
    const scorecard = computeManrsScorecard({ coveragePct: 50 })
    expect(scorecard.measurableCount).toBe(1)
    expect(scorecard.totalActions).toBe(4)
  })
})
