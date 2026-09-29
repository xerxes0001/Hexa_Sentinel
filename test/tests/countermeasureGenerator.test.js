import { describe, it, expect } from 'vitest'
import {
  generateROA, generateRTBH, generateFlowspec, generateMoreSpecific, generateCountermeasures,
} from '../src/engine/countermeasureGenerator.js'

const INCIDENT = {
  id: 42,
  prefix: '103.47.140.0/22',
  victim:   { asn: 'AS55655', name: 'NPCI / UPI', sector: 'Financial' },
  attacker: { asn: 'AS4134', name: 'China Telecom', country: 'CN' },
}

describe('generateMoreSpecific — CIDR split math', () => {
  it('splits a /22 into two valid /23 halves', () => {
    const text = generateMoreSpecific(INCIDENT)
    expect(text).toContain('103.47.140.0/23')
    expect(text).toContain('103.47.142.0/23')
  })

  it('splits a /8 into two correct /9 halves', () => {
    const text = generateMoreSpecific({ ...INCIDENT, prefix: '10.0.0.0/8' })
    expect(text).toContain('10.0.0.0/9')
    expect(text).toContain('10.128.0.0/9')
  })

  it('splits a /24 into two correct /25 halves', () => {
    const text = generateMoreSpecific({ ...INCIDENT, prefix: '192.168.1.0/24' })
    expect(text).toContain('192.168.1.0/25')
    expect(text).toContain('192.168.1.128/25')
  })

  it('refuses to split a /32 (already maximally specific)', () => {
    const text = generateMoreSpecific({ ...INCIDENT, prefix: '1.1.1.1/32' })
    expect(text).toContain('NOT APPLICABLE')
  })

  it('cites the real Apple/Rostelecom precedent (credibility check)', () => {
    const text = generateMoreSpecific(INCIDENT)
    expect(text).toMatch(/Rostelecom/i)
  })
})

describe('generateROA — RFC 6482 shape', () => {
  it('produces valid parseable JSON', () => {
    const text = generateROA(INCIDENT)
    expect(() => JSON.parse(text)).not.toThrow()
  })

  it('includes the victim ASN and prefix, not the attacker', () => {
    const json = JSON.parse(generateROA(INCIDENT))
    expect(json.subject.asID).toBe('AS55655')
    expect(json.subject.ipAddrBlocks[0].addresses[0].prefix).toBe('103.47.140.0/22')
  })

  it('never claims to be signed (honesty check — no real CA access)', () => {
    const json = JSON.parse(generateROA(INCIDENT))
    expect(json.signature).toMatch(/PENDING/)
  })
})

describe('generateRTBH — RFC 7999', () => {
  it('includes the correct blackhole community', () => {
    const text = generateRTBH(INCIDENT)
    expect(text).toContain('65535:666')
    expect(text).toContain(INCIDENT.prefix)
  })
})

describe('generateFlowspec — RFC 8955', () => {
  it('matches on the attacker AS path, not the victim', () => {
    const text = generateFlowspec(INCIDENT)
    expect(text).toContain('4134')
    expect(text).toContain(INCIDENT.prefix)
  })
})

describe('generateCountermeasures — orchestrator', () => {
  it('returns all four artifacts plus metadata', () => {
    const cm = generateCountermeasures(INCIDENT)
    expect(cm.roa).toBeTruthy()
    expect(cm.rtbh).toBeTruthy()
    expect(cm.flowspec).toBeTruthy()
    expect(cm.moreSpecific).toBeTruthy()
    expect(cm.status).toBe('GENERATED_PENDING_AUTHORIZATION')
  })

  it('never sets a status implying real deployment (honesty check)', () => {
    const cm = generateCountermeasures(INCIDENT)
    expect(cm.status).not.toMatch(/EXECUTED|DEPLOYED|MITIGATED/)
  })
})
