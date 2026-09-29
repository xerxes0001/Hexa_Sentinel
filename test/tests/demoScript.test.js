import { describe, it, expect } from 'vitest'
import { DEMO_INCIDENTS } from '../src/data/demoScript.js'
import { isModeledInTopology, simulateBlastRadius } from '../src/engine/blastRadiusEngine.js'
import { INDIAN_ASNS } from '../src/data/indianASNs.js'
import { generateCountermeasures } from '../src/engine/countermeasureGenerator.js'

describe('DEMO_INCIDENTS — data integrity (guards against the exact bug class found this session)', () => {
  it('every scripted attacker ASN is modeled in the Blast Radius topology', () => {
    // This is precisely the bug that shipped earlier this session: 7 of 8
    // Breach Simulator attacker ASNs weren't in the topology, so Blast
    // Radius silently returned 0% during demos. Demo Mode incidents must
    // never repeat that mistake.
    for (const inc of DEMO_INCIDENTS) {
      expect(isModeledInTopology(inc.attacker.asn), `${inc.attacker.name} (${inc.attacker.asn}) must be modeled`).toBe(true)
    }
  })

  it('every scripted attacker produces a non-trivial blast radius result', () => {
    for (const inc of DEMO_INCIDENTS) {
      const r = simulateBlastRadius(inc.attacker.asn, inc.victim.asn)
      expect(r.affectedASNs.length, `${inc.attacker.asn} should reach at least 1 ASN`).toBeGreaterThan(0)
    }
  })

  it('every scripted victim ASN + prefix pair matches the real ASN registry', () => {
    // Exact bug class from earlier this session: digit-transposed ASN codes
    // that create silently-wrong references.
    for (const inc of DEMO_INCIDENTS) {
      const registryEntry = INDIAN_ASNS.find(a => a.asn === inc.victim.asn)
      expect(registryEntry, `${inc.victim.asn} must exist in indianASNs.js`).toBeTruthy()
      expect(registryEntry.name).toBe(inc.victim.name)
      expect(registryEntry.prefixes, `${inc.prefix} must be one of ${inc.victim.asn}'s real prefixes`).toContain(inc.prefix)
    }
  })

  it('every scripted incident has pre-baked RPKI status (no live network dependency)', () => {
    for (const inc of DEMO_INCIDENTS) {
      expect(inc.rpkiStatus).toBeTruthy()
      expect(inc.rpkiStatus.state).toBeTruthy()
    }
  })

  it('every scripted incident has pre-written AI analysis text (no live Groq dependency)', () => {
    for (const inc of DEMO_INCIDENTS) {
      expect(inc.demoAnalysisText, `${inc.victim.name} incident needs demoAnalysisText`).toBeTruthy()
      expect(inc.demoAnalysisText.length).toBeGreaterThan(50)
    }
  })

  it('every confidenceBreakdown sums exactly to the stated confidence (regression guard against drift)', () => {
    for (const inc of DEMO_INCIDENTS) {
      expect(inc.confidenceBreakdown, `${inc.victim.name} needs a confidenceBreakdown`).toBeTruthy()
      const sum = inc.confidenceBreakdown.reduce((s, f) => s + f.points, 0)
      expect(sum, `${inc.victim.name}: breakdown sums to ${sum}, confidence is ${inc.confidence}`).toBe(inc.confidence)
    }
  })

  it('every scripted incident generates valid countermeasures through the real pipeline', () => {
    // Countermeasure generation is pure/local already — this just confirms
    // scripted incident shapes don't break it (e.g. missing victim.asn).
    for (const inc of DEMO_INCIDENTS) {
      const cm = generateCountermeasures(inc)
      expect(cm.roa).toBeTruthy()
      expect(cm.rtbh).toBeTruthy()
      expect(cm.flowspec).toBeTruthy()
      expect(cm.moreSpecific).toBeTruthy()
    }
  })

  it('at least one scripted incident demonstrates the CT+BGP correlation feature', () => {
    const withCorrelation = DEMO_INCIDENTS.filter(inc => inc.coordinatedAttack)
    expect(withCorrelation.length).toBeGreaterThan(0)
  })

  it('covers more than one sector, for a representative demo', () => {
    const sectors = new Set(DEMO_INCIDENTS.map(inc => inc.victim.sector))
    expect(sectors.size).toBeGreaterThan(1)
  })
})
