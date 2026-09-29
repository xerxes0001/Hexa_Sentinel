import { describe, it, expect } from 'vitest'
import {
  getMitigationDelay, applyAutonomousDecision, applyAlertModeDecision, executeDeterministicMitigation,
} from '../src/engine/autonomousActions.js'

describe('getMitigationDelay — bounds check', () => {
  it('never exceeds 12 seconds regardless of severity or jitter', () => {
    for (let i = 0; i < 50; i++) {
      expect(getMitigationDelay('LOW', false)).toBeLessThanOrEqual(12000)
      expect(getMitigationDelay('CRITICAL', true)).toBeLessThanOrEqual(12000)
    }
  })

  it('is always positive', () => {
    expect(getMitigationDelay('CRITICAL', true)).toBeGreaterThan(0)
  })

  it('falls back gracefully for an unknown severity', () => {
    expect(() => getMitigationDelay('NOT_A_REAL_SEVERITY', false)).not.toThrow()
  })
})

describe('Real-vs-fake mitigation boundary (the core honesty guarantee of this project)', () => {
  const incident = {
    id: 1, timestamp: new Date().toISOString(), status: 'DETECTED',
    victim: { asn: 'AS55655', name: 'NPCI' }, confidence: 90,
  }

  it('applyAutonomousDecision (real incidents, AI path) NEVER sets status to MITIGATED', () => {
    const decision = { attackConfirmed: true, recommendRPKI: true, recommendIXP: true }
    const updated = applyAutonomousDecision(incident, decision)
    expect(updated.status).not.toBe('MITIGATED')
    expect(updated.status).toBe('DETECTED') // preserved from input, never touched by this function
  })

  it('applyAlertModeDecision (real incidents) NEVER sets status to MITIGATED', () => {
    const updated = applyAlertModeDecision(incident, {})
    expect(updated.status).not.toBe('MITIGATED')
  })

  it('executeDeterministicMitigation (demo-only path) DOES set MITIGATED when RPKI+IXP both fire', () => {
    // This function is only ever called from App.jsx's isSimulated branch —
    // it's allowed to claim MITIGATED because it's explicitly the demo path.
    const highConfIncident = { ...incident, confidence: 95, confirmedPoints: [1, 2, 3] }
    const { updated } = executeDeterministicMitigation(highConfIncident)
    expect(updated.status).toBe('MITIGATED')
    expect(updated.mitigationSource).toBe('AUTONOMOUS_PLAYBOOK')
  })
})
