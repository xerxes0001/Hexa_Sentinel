/**
 * Historical Precedent Matching
 *
 * Matches a detected incident's signature against real, publicly
 * documented BGP hijack incidents. Deliberately conservative: only
 * includes incidents with solid public documentation (RIPE NCC, Kentik/
 * Doug Madory's writeups, or multiple corroborating news sources), and
 * avoids precise figures (dollar amounts, exact durations) the team
 * hasn't independently verified — matched to the pattern, not claiming
 * exact numeric parity.
 */

export const HISTORICAL_PRECEDENTS = [
  {
    id: 'pakistan-youtube-2008',
    name: 'Pakistan Telecom / YouTube Hijack',
    year: 2008,
    matchTypes: ['ORIGIN_HIJACK'],
    primaryType: 'ORIGIN_HIJACK',
    sectors: [], // real event targeted a tech/media company, not one of SHYEN's monitored sectors
    summary: 'Pakistan Telecom (AS17557) announced a more-specific route for YouTube\'s address block, intending to block YouTube domestically for censorship purposes. The route leaked to Pakistan Telecom\'s upstream (PCCW) and propagated globally, taking YouTube offline worldwide for roughly two hours.',
    lesson: 'Demonstrates how even a locally-intended, non-malicious route announcement can cause global outages without origin validation — the founding case study for why RPKI/ROV exists.',
    source: 'Widely documented by RIPE NCC and multiple contemporary reports (Feb 2008).',
  },
  {
    id: 'rostelecom-2022',
    name: 'Rostelecom Hijack of Apple, Meta, Twitter Prefixes',
    year: 2022,
    matchTypes: ['ORIGIN_HIJACK', 'SUBPREFIX_HIJACK'],
    primaryType: 'ORIGIN_HIJACK',
    sectors: [], // real event targeted tech companies, not one of SHYEN's monitored sectors
    summary: 'Russian ISP Rostelecom (AS12389) originated around 200 IP prefixes belonging to major providers including Apple, Facebook/Meta, and Twitter for roughly an hour. Apple\'s response — announcing a more-specific prefix to win the traffic back via BGP\'s longest-prefix-match rule — is the same technique HexaSentinel\'s countermeasure generator produces automatically.',
    lesson: 'The real-world precedent for the more-specific prefix countermeasure this dashboard generates for every incident.',
    source: 'Reported by network researchers including Doug Madory (Kentik), July 2022.',
  },
  {
    id: 'myetherwallet-2018',
    name: 'MyEtherWallet DNS/BGP Hijack',
    year: 2018,
    matchTypes: ['SUBPREFIX_HIJACK'],
    primaryType: 'SUBPREFIX_HIJACK',
    sectors: ['Financial'], // real target was a cryptocurrency wallet platform
    requiresCoordinatedAttack: true,
    summary: 'Attackers hijacked a more-specific prefix covering an Amazon Route 53 DNS server, redirecting MyEtherWallet users to a phishing site with a fraudulently-issued TLS certificate, resulting in cryptocurrency theft from users who saw a "secure" but fake site.',
    lesson: 'The precedent for HexaSentinel\'s BGP + Certificate Transparency correlation feature — combining a routing anomaly with a suspicious cert issuance is a much stronger signal than either alone.',
    source: 'Widely reported by security researchers and press, April 2018.',
  },
  {
    id: 'klayswap-2022',
    name: 'KLAYswap BGP Hijack',
    year: 2022,
    matchTypes: ['SUBPREFIX_HIJACK', 'ORIGIN_HIJACK'],
    primaryType: 'SUBPREFIX_HIJACK',
    sectors: ['Financial'], // real target was a cryptocurrency exchange
    requiresCoordinatedAttack: true,
    summary: 'Attackers hijacked a South Korean ISP\'s address block to intercept a JavaScript SDK request used by the KLAYswap cryptocurrency platform, substituting malicious code that redirected user funds.',
    lesson: 'A second real precedent for combined routing + application-layer attacks — reinforces why cross-layer correlation matters for financial infrastructure specifically.',
    source: 'Reported by multiple security research outlets, February 2022.',
  },
]

/**
 * Weighted similarity score (0-100), not just a binary type match.
 *   - Attack type: 40 pts for matching the precedent's PRIMARY type,
 *     25 pts for matching a secondary/related type in matchTypes.
 *   - Sector: 20 pts if the incident's victim sector matches a sector the
 *     real precedent actually affected (only scored where that's known —
 *     see the honesty note on `sectors: []` above for events where SHYEN's
 *     sector taxonomy doesn't map cleanly onto the real target).
 *   - Coordinated attack: 25 pts, but ONLY counted in the denominator for
 *     precedents where that pattern is actually part of what happened
 *     (MEW, KLAYswap) — irrelevant precedents aren't penalized for a
 *     criterion that was never part of their story.
 *   - Severity plausibility: 15 pts if the incident's severity is
 *     CRITICAL/HIGH, matching that all 4 precedents were serious,
 *     high-impact real events.
 * Score is normalized against the criteria that actually apply to each
 * precedent, so precedents aren't unfairly penalized for criteria that
 * were never part of their real story.
 */
function computeMatchScore(incident, precedent) {
  let score = 0, maxScore = 0

  maxScore += 40
  score += precedent.primaryType === incident.type ? 40 : 25

  // Only counted in the denominator when the real event's sector is
  // actually known — same fairness principle as coordinatedAttack below:
  // don't penalize a precedent for a criterion nobody can honestly
  // evaluate for it (Pakistan/YouTube and Rostelecom targeted companies
  // outside SHYEN's sector taxonomy, not "no sector, so always a miss").
  if (precedent.sectors?.length) {
    maxScore += 20
    if (precedent.sectors.includes(incident.victim?.sector)) score += 20
  }

  if (precedent.requiresCoordinatedAttack) {
    maxScore += 25
    if (incident.coordinatedAttack) score += 25
  }

  maxScore += 15
  if (['CRITICAL', 'HIGH'].includes(incident.severity)) score += 15

  return Math.round((score / maxScore) * 100)
}

/**
 * Returns precedents whose matchTypes include the incident's attack type
 * (and, where required, only if the incident also has a coordinated-attack
 * correlation — matching MEW/KLAYswap's combined-layer pattern specifically),
 * each annotated with a matchScore (0-100) and sorted by descending score —
 * not just a flat, unranked list.
 */
export function matchPrecedents(incident) {
  if (!incident?.type) return []
  return HISTORICAL_PRECEDENTS
    .filter(p => {
      if (!p.matchTypes.includes(incident.type)) return false
      if (p.requiresCoordinatedAttack && !incident.coordinatedAttack) return false
      return true
    })
    .map(p => ({ ...p, matchScore: computeMatchScore(incident, p) }))
    .sort((a, b) => b.matchScore - a.matchScore)
}
