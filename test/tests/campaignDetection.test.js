import { describe, it, expect } from 'vitest'
import { detectCampaigns, findCampaignForIncident } from '../src/engine/campaignDetection.js'

function mkIncident(id, attackerAsn, victimAsn, sector, minutesAgo, country = 'CN') {
  return {
    id,
    attacker: { asn: attackerAsn, name: `Attacker ${attackerAsn}`, country },
    victim:   { asn: victimAsn, name: `Victim ${victimAsn}`, sector },
    severity: 'HIGH',
    timestamp: new Date(Date.now() - minutesAgo * 60000).toISOString(),
  }
}

describe('detectCampaigns — same-ASN tier (strong signal)', () => {
  it('does not flag a single incident as a campaign', () => {
    const incidents = [mkIncident(1, 'AS4134', 'AS55655', 'Financial', 10)]
    expect(detectCampaigns(incidents)).toHaveLength(0)
  })

  it('does not flag two incidents from unrelated attackers (different ASN, different country) as a campaign', () => {
    const incidents = [
      mkIncident(1, 'AS4134', 'AS55655', 'Financial', 10, 'CN'),
      mkIncident(2, 'AS1221', 'AS45764', 'Financial', 5, 'AU'),
    ]
    expect(detectCampaigns(incidents)).toHaveLength(0)
  })

  it('flags two incidents from the SAME attacker against DIFFERENT victims as a campaign', () => {
    const incidents = [
      mkIncident(1, 'AS4134', 'AS55655', 'Financial', 90),
      mkIncident(2, 'AS4134', 'AS45764', 'Financial', 30),
    ]
    const campaigns = detectCampaigns(incidents)
    expect(campaigns).toHaveLength(1)
    expect(campaigns[0].correlationType).toBe('same-asn')
    expect(campaigns[0].victimCount).toBe(2)
    expect(campaigns[0].attackerAsn).toBe('AS4134')
  })

  it('does NOT count repeated hijacks of the SAME victim as a multi-target campaign', () => {
    // Same attacker, same victim twice — this is a repeat attack, not a
    // campaign across multiple targets (that's attackMemory.js's job).
    const incidents = [
      mkIncident(1, 'AS4134', 'AS55655', 'Financial', 90),
      mkIncident(2, 'AS4134', 'AS55655', 'Financial', 30),
    ]
    expect(detectCampaigns(incidents)).toHaveLength(0)
  })

  it('does not merge incidents outside the campaign time window', () => {
    const incidents = [
      mkIncident(1, 'AS4134', 'AS55655', 'Financial', 300), // 5 hours ago
      mkIncident(2, 'AS4134', 'AS45764', 'Financial', 10),  // 10 min ago
    ]
    expect(detectCampaigns(incidents)).toHaveLength(0)
  })

  it('collects sectors across all victims in the campaign', () => {
    const incidents = [
      mkIncident(1, 'AS4134', 'AS55655', 'Financial', 90),
      mkIncident(2, 'AS4134', 'AS55824', 'Defense', 60),
      mkIncident(3, 'AS4134', 'AS45764', 'Financial', 30),
    ]
    const campaigns = detectCampaigns(incidents)
    expect(campaigns[0].victimCount).toBe(3)
    expect(campaigns[0].sectors).toContain('Financial')
    expect(campaigns[0].sectors).toContain('Defense')
  })

  it('escalates maxSeverity to CRITICAL if any member incident is CRITICAL', () => {
    const incidents = [
      { ...mkIncident(1, 'AS4134', 'AS55655', 'Financial', 90), severity: 'MEDIUM' },
      { ...mkIncident(2, 'AS4134', 'AS45764', 'Financial', 30), severity: 'CRITICAL' },
    ]
    expect(detectCampaigns(incidents)[0].maxSeverity).toBe('CRITICAL')
  })

  it('ignores incidents with no attacker ASN rather than crashing', () => {
    const incidents = [
      { ...mkIncident(1, 'AS4134', 'AS55655', 'Financial', 10), attacker: null },
      mkIncident(2, 'AS4134', 'AS45764', 'Financial', 5),
    ]
    expect(() => detectCampaigns(incidents)).not.toThrow()
  })
})

describe('detectCampaigns — same-country tier (weaker, cross-ASN signal)', () => {
  it('flags two incidents from DIFFERENT ASNs in the SAME country as a weaker-tier campaign', () => {
    const incidents = [
      mkIncident(1, 'AS4134', 'AS55655', 'Financial', 90, 'CN'),
      mkIncident(2, 'AS9999', 'AS45764', 'Defense', 30, 'CN'),
    ]
    const campaigns = detectCampaigns(incidents)
    expect(campaigns).toHaveLength(1)
    expect(campaigns[0].correlationType).toBe('same-country')
    expect(campaigns[0].attackerCountry).toBe('CN')
    expect(campaigns[0].attackerAsns).toHaveLength(2)
  })

  it('requires at least 2 DISTINCT ASNs for the country tier — same ASN twice does not count twice', () => {
    // This scenario is already fully captured by the same-ASN tier; the
    // country tier must not also fire for it under a fuzzier label.
    const incidents = [
      mkIncident(1, 'AS4134', 'AS55655', 'Financial', 90, 'CN'),
      mkIncident(2, 'AS4134', 'AS45764', 'Financial', 30, 'CN'),
    ]
    const campaigns = detectCampaigns(incidents)
    expect(campaigns).toHaveLength(1)
    expect(campaigns[0].correlationType).toBe('same-asn')
  })

  it('never double-counts: incidents already claimed by a same-ASN campaign are excluded from country-tier clustering', () => {
    const incidents = [
      mkIncident(1, 'AS4134', 'AS55655', 'Financial', 100, 'CN'), // same-ASN pair with #2
      mkIncident(2, 'AS4134', 'AS45764', 'Financial', 80, 'CN'),
      mkIncident(3, 'AS9999', 'AS55824', 'Defense', 20, 'CN'),    // different ASN, same country
    ]
    const campaigns = detectCampaigns(incidents)
    // incident 3 alone (AS9999) has no other same-country partner ASN left
    // to cluster with, since 1 and 2 were claimed by the same-ASN campaign —
    // so it should NOT form a spurious 3-victim country campaign that
    // double-counts incidents 1/2.
    const countryCampaign = campaigns.find(c => c.correlationType === 'same-country')
    expect(countryCampaign).toBeUndefined()
  })

  it('does not flag same-country incidents with only 1 distinct victim', () => {
    const incidents = [
      mkIncident(1, 'AS4134', 'AS55655', 'Financial', 90, 'CN'),
      mkIncident(2, 'AS9999', 'AS55655', 'Financial', 30, 'CN'), // same victim
    ]
    expect(detectCampaigns(incidents)).toHaveLength(0)
  })
})

describe('findCampaignForIncident', () => {
  it('returns null for an incident not part of any campaign', () => {
    const incidents = [mkIncident(1, 'AS4134', 'AS55655', 'Financial', 10)]
    expect(findCampaignForIncident(incidents[0], incidents)).toBeNull()
  })

  it('finds the correct campaign for a member incident', () => {
    const incidents = [
      mkIncident(1, 'AS4134', 'AS55655', 'Financial', 90),
      mkIncident(2, 'AS4134', 'AS45764', 'Financial', 30),
    ]
    const found = findCampaignForIncident(incidents[1], incidents)
    expect(found).not.toBeNull()
    expect(found.incidentIds).toContain(1)
    expect(found.incidentIds).toContain(2)
  })
})
