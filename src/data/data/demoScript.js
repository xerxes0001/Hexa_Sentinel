/**
 * Demo Script — pre-authored incidents for Demo Mode
 *
 * Design goal: Demo Mode must render through the EXACT SAME UI components
 * as Live Mode (DetailPanel, ResponseActions, BlastRadiusPanel, AIAnalysis,
 * etc.) so what a judge sees on stage is provably the real interface — but
 * with ZERO live network dependency, so a bad venue wifi connection or a
 * rate-limited API can't break the presentation.
 *
 * Every field here matches the exact shape enrichAndAdd() and the detail
 * components expect from a REAL incident (rpkiStatus, coordinatedAttack,
 * demoAnalysisText), so every feature — RPKI display, CT+BGP correlation
 * banner, AI Analysis panel, Blast Radius, all four countermeasure
 * artifacts — visibly works exactly as it would on real data.
 *
 * Attacker ASNs are deliberately chosen from the Blast Radius Simulator's
 * modeled topology (src/data/asTopology.js) so "SIMULATE BLAST RADIUS"
 * produces a real, non-trivial result during the demo — not the "attacker
 * not modeled" fallback message.
 */

const ANALYSIS = {
  originHijackFinancial: `THREAT ASSESSMENT: A foreign autonomous system is falsely claiming ownership of critical financial infrastructure address space, redirecting legitimate payment traffic through an unauthorized network. This exposes transaction data and creates a man-in-the-middle opportunity against India's core payment rails.
ATTACK VECTOR: The attacker announced a BGP route for the victim's prefix without authorization, exploiting the internet's default trust-based routing model. Networks without RPKI Route Origin Validation accepted the false announcement, redirecting a portion of global traffic.
RECOMMENDED ACTIONS: Deploy the generated RPKI ROA to cryptographically invalidate the hijacker's claim. Push the RTBH blackhole announcement to Indian IXP route servers immediately. Notify the victim's NOC to authorize the more-specific prefix announcement if the hijack persists beyond 15 minutes.`,

  originHijackGovernment: `THREAT ASSESSMENT: A foreign autonomous system has originated a false BGP route for government-sector address space, capable of intercepting citizen-facing services and internal government traffic routed through the hijacked prefix.
ATTACK VECTOR: The attacker's origin AS announced ownership of address space it has no delegation for. Absent RPKI Route Origin Validation at intervening networks, the false route propagated and won the routing race on path length alone.
RECOMMENDED ACTIONS: Deploy the generated RPKI ROA immediately to invalidate the false origin claim network-wide. Push the RTBH blackhole to Indian IXP route servers to stop traffic redirection while the ROA propagates. Escalate to CERT-In given the government classification.`,

  originHijackCritical: `THREAT ASSESSMENT: A false BGP origination against critical-infrastructure address space has been confirmed, with the potential to intercept or disrupt operational technology traffic tied to national infrastructure.
ATTACK VECTOR: The attacker's AS announced the victim's prefix without authorization; the internet's default trust-based routing model accepted the announcement absent RPKI validation at enough transit networks.
RECOMMENDED ACTIONS: Deploy the generated RPKI ROA to cryptographically invalidate the hijacker's route. Push the RTBH blackhole to Indian IXP route servers. Given the critical-infrastructure classification, escalate to CERT-In and the sector's designated CERT immediately.`,

  subprefixDefense: `THREAT ASSESSMENT: A more-specific sub-prefix hijack has been detected against defense-sector infrastructure. Because BGP prefers longer prefix matches, this narrow announcement can silently capture traffic even where the broader legitimate route remains intact — making it harder to detect via casual monitoring.
ATTACK VECTOR: The attacker announced a smaller, more specific block carved out of the victim's larger allocation. This wins the routing race for that specific address range without needing to out-announce the entire prefix, a technique that's historically evaded naive anomaly detection.
RECOMMENDED ACTIONS: Authorize immediate deployment of the generated Flowspec rule to drop traffic matching the hijacker's AS path. File the RPKI ROA with explicit maxLength coverage to close this sub-prefix gap permanently. Escalate to CERT-In given defense-sector classification.`,

  subprefixEducation: `THREAT ASSESSMENT: A more-specific sub-prefix hijack has been detected against an academic/research network's address space. The narrower announcement wins the BGP routing race for that specific range even though the institution's broader route is still correctly announced elsewhere.
ATTACK VECTOR: The attacker carved out and announced a smaller block from within the victim's larger allocation, a technique that frequently evades detection systems tuned only to whole-prefix hijacks.
RECOMMENDED ACTIONS: Deploy the generated Flowspec rule to drop traffic on the hijacker's AS path. File the RPKI ROA with explicit maxLength coverage so future sub-prefix attempts against this block are rejected automatically.`,

  subprefixCloud: `THREAT ASSESSMENT: A more-specific sub-prefix hijack against cloud/datacenter address space has been confirmed, putting hosted tenant traffic at risk of interception via the narrower, routing-race-winning announcement.
ATTACK VECTOR: The attacker announced a smaller block carved from the datacenter's larger allocation, which wins the BGP longest-prefix-match race without needing to out-announce the whole range.
RECOMMENDED ACTIONS: Deploy the generated Flowspec rule immediately to drop traffic matching the attacker's AS path. File an RPKI ROA with maxLength coverage on this allocation to close the sub-prefix gap for good.`,

  routeLeakTelecom: `THREAT ASSESSMENT: A route leak has propagated an internal or restricted route to the global routing table via an unauthorized AS path, exposing telecom backbone topology and creating potential for traffic interception at a national scale.
ATTACK VECTOR: A route learned from a peer or customer was incorrectly re-exported to a provider or another peer — a Gao-Rexford policy violation. This class of incident is often accidental misconfiguration rather than deliberate attack, but the traffic-redirection risk is identical either way.
RECOMMENDED ACTIONS: Contact the leaking AS's NOC directly to request withdrawal — this is the fastest real-world remediation for a leak, faster than any cryptographic countermeasure. Monitor for reoccurrence over the next 48 hours. File the RPKI ROA regardless, since it provides standing protection against future leaks of this prefix.`,

  routeLeakISP: `THREAT ASSESSMENT: A route leak has re-exported an ISP's customer or peer route outside its intended scope, creating an unintended and unauthorized path for traffic destined to that provider's address space.
ATTACK VECTOR: A Gao-Rexford policy violation at the leaking AS — a route learned from one peer/customer was incorrectly announced onward to another peer or upstream, widening its visibility far past where it should propagate.
RECOMMENDED ACTIONS: Contact the leaking AS's NOC directly to request withdrawal; this is typically faster than any cryptographic remediation. Monitor for a recurrence over the following 48 hours and file an RPKI ROA as standing protection.`,

  routeLeakMedia: `THREAT ASSESSMENT: A route leak affecting media/broadcast infrastructure address space has propagated an internal route into the global table via an unauthorized AS path, risking content-delivery interception or disruption.
ATTACK VECTOR: A route learned from a peer or customer was mistakenly re-announced to another peer or provider — a routing-policy violation rather than a cryptographic attack, though the redirection risk is identical.
RECOMMENDED ACTIONS: Contact the leaking AS's NOC to request immediate withdrawal. File the RPKI ROA for standing protection against recurrence, and monitor the prefix over the next 48 hours.`,
}

// Each attacker is deliberately drawn from the Blast Radius Simulator's
// modeled AS topology (src/data/asTopology.js) so "SIMULATE BLAST RADIUS"
// always produces a real, non-trivial result for every scripted incident
// — never the "attacker not modeled" fallback message.
const ATTACKERS = {
  chinaTelecom:    { asn: 'AS4134',  name: 'China Telecom',     country: 'CN' },
  ptcl:            { asn: 'AS45595', name: 'PTCL',              country: 'PK' },
  telstra:         { asn: 'AS1221',  name: 'Telstra',           country: 'AU' },
  deutscheTelekom: { asn: 'AS3320',  name: 'Deutsche Telekom',  country: 'DE' },
  kddi:            { asn: 'AS2516',  name: 'KDDI',              country: 'JP' },
  telecomEgypt:    { asn: 'AS8452',  name: 'Telecom Egypt',     country: 'EG' },
}

const VP = {
  amsterdam: 'RIPE-RIS-01 Amsterdam', oregon: 'RouteViews Oregon', geneva: 'RIPE-RIS-04 Geneva',
  tokyo: 'RouteViews Tokyo', singapore: 'RIPE-RIS-10 Singapore', sydney: 'RouteViews Sydney',
  newYork: 'RIPE-RIS-11 New York', saoPaulo: 'RouteViews Sao Paulo',
}

export const DEMO_INCIDENTS = [
  {
    type: 'ORIGIN_HIJACK',
    victim:   { asn: 'AS55655', name: 'NPCI / UPI', sector: 'Financial' },
    attacker: ATTACKERS.chinaTelecom,
    prefix: '103.47.140.0/22',
    confidence: 94,
    confidenceBreakdown: [
      { label: 'Base score', points: 40 },
      { label: 'RPKI invalid (cryptographically wrong origin)', points: 35 },
      { label: 'Origin AS does not match expected owner', points: 15 },
      { label: '5 vantage points confirmed', points: 4 },
    ],
    severity: 'CRITICAL',
    confirmedPoints: [VP.amsterdam, VP.oregon, VP.geneva, VP.tokyo, VP.singapore],
    affectedIPs: 1024,
    rpkiStatus: { valid: false, invalid: true, unknown: false, state: 'invalid', reason: 'Origin AS4134 does not match any ROA for this prefix', asn: 'AS4134', prefix: '103.47.140.0/22' },
    coordinatedAttack: {
      domain: 'npci.org.in', certIssuer: 'Unknown CA (not in trusted list)', certCommonName: '*.npci.org.in',
      certIssuedAt: new Date().toISOString(), windowMs: 8 * 60 * 1000, detectedAt: new Date().toISOString(),
    },
    demoAnalysisText: ANALYSIS.originHijackFinancial,
  },
  {
    type: 'SUBPREFIX_HIJACK',
    victim:   { asn: 'AS55824', name: 'DRDO', sector: 'Defense' },
    attacker: ATTACKERS.ptcl,
    prefix: '14.139.128.0/17',
    confidence: 89,
    confidenceBreakdown: [
      { label: 'Base score', points: 40 },
      { label: 'No ROA on file (unprotected prefix)', points: 10 },
      { label: 'More-specific sub-prefix (wins routing race)', points: 20 },
      { label: 'Origin AS does not match expected owner', points: 15 },
      { label: '3 vantage points confirmed', points: 4 },
    ],
    severity: 'CRITICAL',
    confirmedPoints: [VP.amsterdam, VP.geneva, VP.oregon],
    affectedIPs: 512,
    rpkiStatus: { valid: false, invalid: false, unknown: true, state: 'not-found', reason: 'No Route Origin Authorization found for this prefix', asn: 'AS45595', prefix: '14.139.129.0/24' },
    demoAnalysisText: ANALYSIS.subprefixDefense,
  },
  {
    type: 'ROUTE_LEAK',
    victim:   { asn: 'AS24560', name: 'Airtel India', sector: 'Telecom' },
    attacker: ATTACKERS.telstra,
    prefix: '182.68.0.0/15',
    confidence: 76,
    confidenceBreakdown: [
      { label: 'Base score', points: 40 },
      { label: 'RPKI valid (likely legitimate)', points: -20 },
      { label: 'AS path suspiciously long (inflation)', points: 15 },
      { label: 'AS-path prepending ×3', points: 20 },
      { label: 'Origin AS does not match expected owner', points: 15 },
      { label: '3 vantage points confirmed', points: 6 },
    ],
    severity: 'HIGH',
    confirmedPoints: [VP.oregon, VP.singapore],
    affectedIPs: 4096,
    rpkiStatus: { valid: true, invalid: false, unknown: false, state: 'valid', reason: null, asn: 'AS24560', prefix: '182.68.0.0/15' },
    demoAnalysisText: ANALYSIS.routeLeakTelecom,
  },
  {
    type: 'ORIGIN_HIJACK',
    victim:   { asn: 'AS45117', name: 'UIDAI / Aadhaar', sector: 'Government' },
    attacker: ATTACKERS.deutscheTelekom,
    prefix: '103.57.188.0/22',
    confidence: 94,
    confidenceBreakdown: [
      { label: 'Base score', points: 40 },
      { label: 'RPKI invalid (cryptographically wrong origin)', points: 35 },
      { label: 'Origin AS does not match expected owner', points: 15 },
      { label: '4 vantage points confirmed', points: 4 },
    ],
    severity: 'CRITICAL',
    confirmedPoints: [VP.geneva, VP.newYork, VP.oregon, VP.saoPaulo],
    affectedIPs: 256,
    rpkiStatus: { valid: false, invalid: true, unknown: false, state: 'invalid', reason: 'Origin AS3320 does not match any ROA for this prefix', asn: 'AS3320', prefix: '103.57.188.0/22' },
    demoAnalysisText: ANALYSIS.originHijackGovernment,
  },
  {
    type: 'SUBPREFIX_HIJACK',
    victim:   { asn: 'AS45528', name: 'CtrlS Datacenters', sector: 'Cloud' },
    attacker: ATTACKERS.kddi,
    prefix: '103.53.98.0/23',
    confidence: 85,
    confidenceBreakdown: [
      { label: 'Base score', points: 40 },
      { label: 'No ROA on file (unprotected prefix)', points: 10 },
      { label: 'More-specific sub-prefix (wins routing race)', points: 20 },
      { label: 'Origin AS does not match expected owner', points: 15 },
    ],
    severity: 'HIGH',
    confirmedPoints: [VP.tokyo, VP.sydney],
    affectedIPs: 128,
    rpkiStatus: { valid: false, invalid: false, unknown: true, state: 'not-found', reason: 'No Route Origin Authorization found for this prefix', asn: 'AS2516', prefix: '103.53.99.0/24' },
    demoAnalysisText: ANALYSIS.subprefixCloud,
  },
  {
    type: 'ROUTE_LEAK',
    victim:   { asn: 'AS10029', name: 'Tata Communications', sector: 'ISP' },
    attacker: ATTACKERS.telecomEgypt,
    prefix: '203.200.0.0/14',
    confidence: 54,
    confidenceBreakdown: [
      { label: 'Base score', points: 40 },
      { label: 'RPKI valid (likely legitimate)', points: -20 },
      { label: 'AS path suspiciously long (inflation)', points: 15 },
      { label: 'Origin AS does not match expected owner', points: 15 },
      { label: '2 vantage points confirmed', points: 4 },
    ],
    severity: 'MEDIUM',
    confirmedPoints: [VP.saoPaulo, VP.newYork],
    affectedIPs: 8192,
    rpkiStatus: { valid: true, invalid: false, unknown: false, state: 'valid', reason: null, asn: 'AS10029', prefix: '203.200.0.0/14' },
    demoAnalysisText: ANALYSIS.routeLeakISP,
  },
  {
    type: 'ORIGIN_HIJACK',
    victim:   { asn: 'AS55789', name: 'PGCIL (Power Grid)', sector: 'Critical' },
    attacker: ATTACKERS.ptcl,
    prefix: '203.200.202.0/24',
    confidence: 96,
    confidenceBreakdown: [
      { label: 'Base score', points: 40 },
      { label: 'RPKI invalid (cryptographically wrong origin)', points: 35 },
      { label: 'Origin AS does not match expected owner', points: 15 },
      { label: 'Critical-infrastructure sector escalation', points: 2 },
      { label: '4 vantage points confirmed', points: 4 },
    ],
    severity: 'CRITICAL',
    confirmedPoints: [VP.amsterdam, VP.oregon, VP.geneva, VP.tokyo, VP.singapore, VP.sydney],
    affectedIPs: 64,
    rpkiStatus: { valid: false, invalid: true, unknown: false, state: 'invalid', reason: 'Origin AS45595 does not match any ROA for this prefix', asn: 'AS45595', prefix: '203.200.202.0/24' },
    demoAnalysisText: ANALYSIS.originHijackCritical,
  },
  {
    type: 'SUBPREFIX_HIJACK',
    victim:   { asn: 'AS45272', name: 'IITB', sector: 'Education' },
    attacker: ATTACKERS.chinaTelecom,
    prefix: '14.139.120.0/22',
    confidence: 74,
    confidenceBreakdown: [
      { label: 'Base score', points: 40 },
      { label: 'No ROA on file (unprotected prefix)', points: 10 },
      { label: 'More-specific sub-prefix (wins routing race)', points: 20 },
      { label: '2 vantage points confirmed', points: 4 },
    ],
    severity: 'MEDIUM',
    confirmedPoints: [VP.singapore, VP.tokyo],
    affectedIPs: 96,
    rpkiStatus: { valid: false, invalid: false, unknown: true, state: 'not-found', reason: 'No Route Origin Authorization found for this prefix', asn: 'AS4134', prefix: '14.139.121.0/24' },
    demoAnalysisText: ANALYSIS.subprefixEducation,
  },
  {
    type: 'ROUTE_LEAK',
    victim:   { asn: 'AS45820', name: 'Zee Entertainment', sector: 'Media' },
    attacker: ATTACKERS.telstra,
    prefix: '103.0.72.0/22',
    confidence: 51,
    confidenceBreakdown: [
      { label: 'Base score', points: 40 },
      { label: 'RPKI valid (likely legitimate)', points: -20 },
      { label: 'AS-path prepending ×2', points: 12 },
      { label: 'Origin AS does not match expected owner', points: 15 },
      { label: '2 vantage points confirmed', points: 4 },
    ],
    severity: 'MEDIUM',
    confirmedPoints: [VP.sydney, VP.oregon],
    affectedIPs: 512,
    rpkiStatus: { valid: true, invalid: false, unknown: false, state: 'valid', reason: null, asn: 'AS45820', prefix: '103.0.72.0/22' },
    demoAnalysisText: ANALYSIS.routeLeakMedia,
  },
  {
    type: 'ORIGIN_HIJACK',
    victim:   { asn: 'AS136334', name: 'SBI', sector: 'Financial' },
    attacker: ATTACKERS.deutscheTelekom,
    prefix: '103.36.80.0/21',
    confidence: 91,
    confidenceBreakdown: [
      { label: 'Base score', points: 40 },
      { label: 'RPKI invalid (cryptographically wrong origin)', points: 35 },
      { label: 'Origin AS does not match expected owner', points: 15 },
      { label: '3 vantage points confirmed', points: 1 },
    ],
    severity: 'CRITICAL',
    confirmedPoints: [VP.geneva, VP.amsterdam, VP.newYork],
    affectedIPs: 2048,
    rpkiStatus: { valid: false, invalid: true, unknown: false, state: 'invalid', reason: 'Origin AS3320 does not match any ROA for this prefix', asn: 'AS3320', prefix: '103.36.80.0/21' },
    demoAnalysisText: ANALYSIS.originHijackFinancial,
  },
  {
    type: 'SUBPREFIX_HIJACK',
    victim:   { asn: 'AS45258', name: 'ISRO', sector: 'Defense' },
    attacker: ATTACKERS.kddi,
    prefix: '202.78.0.0/18',
    confidence: 93,
    confidenceBreakdown: [
      { label: 'Base score', points: 40 },
      { label: 'No ROA on file (unprotected prefix)', points: 10 },
      { label: 'More-specific sub-prefix (wins routing race)', points: 20 },
      { label: 'Origin AS does not match expected owner', points: 15 },
      { label: 'Defense-sector escalation', points: 4 },
      { label: '4 vantage points confirmed', points: 4 },
    ],
    severity: 'CRITICAL',
    confirmedPoints: [VP.tokyo, VP.sydney, VP.oregon, VP.singapore],
    affectedIPs: 320,
    rpkiStatus: { valid: false, invalid: false, unknown: true, state: 'not-found', reason: 'No Route Origin Authorization found for this prefix', asn: 'AS2516', prefix: '202.78.1.0/24' },
    demoAnalysisText: ANALYSIS.subprefixDefense,
  },
  {
    type: 'ROUTE_LEAK',
    victim:   { asn: 'AS9829', name: 'BSNL', sector: 'Telecom' },
    attacker: ATTACKERS.telecomEgypt,
    prefix: '117.192.0.0/10',
    confidence: 74,
    confidenceBreakdown: [
      { label: 'Base score', points: 40 },
      { label: 'RPKI valid (likely legitimate)', points: -20 },
      { label: 'AS path suspiciously long (inflation)', points: 15 },
      { label: 'AS-path prepending ×3', points: 20 },
      { label: 'Origin AS does not match expected owner', points: 15 },
      { label: '2 vantage points confirmed', points: 4 },
    ],
    severity: 'HIGH',
    confirmedPoints: [VP.saoPaulo, VP.geneva],
    affectedIPs: 16384,
    rpkiStatus: { valid: true, invalid: false, unknown: false, state: 'valid', reason: null, asn: 'AS9829', prefix: '117.192.0.0/10' },
    demoAnalysisText: ANALYSIS.routeLeakTelecom,
  },
  {
    type: 'ORIGIN_HIJACK',
    victim:   { asn: 'AS55665', name: 'NSE India', sector: 'Financial' },
    attacker: ATTACKERS.ptcl,
    prefix: '203.170.50.0/23',
    confidence: 95,
    confidenceBreakdown: [
      { label: 'Base score', points: 40 },
      { label: 'RPKI invalid (cryptographically wrong origin)', points: 35 },
      { label: 'Origin AS does not match expected owner', points: 15 },
      { label: '5 vantage points confirmed', points: 5 },
    ],
    severity: 'CRITICAL',
    confirmedPoints: [VP.amsterdam, VP.oregon, VP.geneva, VP.singapore, VP.newYork],
    affectedIPs: 512,
    rpkiStatus: { valid: false, invalid: true, unknown: false, state: 'invalid', reason: 'Origin AS45595 does not match any ROA for this prefix', asn: 'AS45595', prefix: '203.170.50.0/23' },
    coordinatedAttack: {
      domain: 'nseindia.com', certIssuer: 'Unknown CA (not in trusted list)', certCommonName: '*.nseindia.com',
      certIssuedAt: new Date().toISOString(), windowMs: 6 * 60 * 1000, detectedAt: new Date().toISOString(),
    },
    demoAnalysisText: ANALYSIS.originHijackFinancial,
  },
  {
    type: 'SUBPREFIX_HIJACK',
    victim:   { asn: 'AS55714', name: 'Indian Railways IT', sector: 'Government' },
    attacker: ATTACKERS.chinaTelecom,
    prefix: '164.100.136.0/21',
    confidence: 85,
    confidenceBreakdown: [
      { label: 'Base score', points: 40 },
      { label: 'No ROA on file (unprotected prefix)', points: 10 },
      { label: 'More-specific sub-prefix (wins routing race)', points: 20 },
      { label: 'Origin AS does not match expected owner', points: 15 },
    ],
    severity: 'HIGH',
    confirmedPoints: [VP.singapore, VP.tokyo, VP.sydney],
    affectedIPs: 224,
    rpkiStatus: { valid: false, invalid: false, unknown: true, state: 'not-found', reason: 'No Route Origin Authorization found for this prefix', asn: 'AS4134', prefix: '164.100.137.0/24' },
    demoAnalysisText: ANALYSIS.originHijackGovernment,
  },
  {
    type: 'ROUTE_LEAK',
    victim:   { asn: 'AS45271', name: 'Vodafone Idea', sector: 'Telecom' },
    attacker: ATTACKERS.deutscheTelekom,
    prefix: '27.56.0.0/14',
    confidence: 53,
    confidenceBreakdown: [
      { label: 'Base score', points: 40 },
      { label: 'RPKI valid (likely legitimate)', points: -20 },
      { label: 'AS-path prepending ×2', points: 12 },
      { label: 'Origin AS does not match expected owner', points: 15 },
      { label: '3 vantage points confirmed', points: 6 },
    ],
    severity: 'MEDIUM',
    confirmedPoints: [VP.geneva, VP.oregon, VP.amsterdam],
    affectedIPs: 6144,
    rpkiStatus: { valid: true, invalid: false, unknown: false, state: 'valid', reason: null, asn: 'AS45271', prefix: '27.56.0.0/14' },
    demoAnalysisText: ANALYSIS.routeLeakTelecom,
  },
  {
    type: 'ORIGIN_HIJACK',
    victim:   { asn: 'AS45764', name: 'HDFC Bank', sector: 'Financial' },
    attacker: ATTACKERS.kddi,
    prefix: '103.49.168.0/21',
    confidence: 90,
    confidenceBreakdown: [
      { label: 'Base score', points: 40 },
      { label: 'RPKI invalid (cryptographically wrong origin)', points: 35 },
      { label: 'Origin AS does not match expected owner', points: 15 },
    ],
    severity: 'CRITICAL',
    confirmedPoints: [VP.tokyo, VP.sydney, VP.saoPaulo],
    affectedIPs: 1536,
    rpkiStatus: { valid: false, invalid: true, unknown: false, state: 'invalid', reason: 'Origin AS2516 does not match any ROA for this prefix', asn: 'AS2516', prefix: '103.49.168.0/21' },
    demoAnalysisText: ANALYSIS.originHijackFinancial,
  },
  {
    type: 'SUBPREFIX_HIJACK',
    victim:   { asn: 'AS18234', name: 'ONGC', sector: 'Critical' },
    attacker: ATTACKERS.telecomEgypt,
    prefix: '210.212.240.0/20',
    confidence: 87,
    confidenceBreakdown: [
      { label: 'Base score', points: 40 },
      { label: 'No ROA on file (unprotected prefix)', points: 10 },
      { label: 'More-specific sub-prefix (wins routing race)', points: 20 },
      { label: 'Origin AS does not match expected owner', points: 15 },
      { label: 'Critical-infrastructure sector escalation', points: 2 },
    ],
    severity: 'HIGH',
    confirmedPoints: [VP.saoPaulo, VP.newYork, VP.geneva],
    affectedIPs: 160,
    rpkiStatus: { valid: false, invalid: false, unknown: true, state: 'not-found', reason: 'No Route Origin Authorization found for this prefix', asn: 'AS8452', prefix: '210.212.241.0/24' },
    demoAnalysisText: ANALYSIS.subprefixCloud,
  },
  {
    type: 'ROUTE_LEAK',
    victim:   { asn: 'AS17488', name: 'Hathway Cable', sector: 'ISP' },
    attacker: ATTACKERS.telstra,
    prefix: '59.92.0.0/14',
    confidence: 54,
    confidenceBreakdown: [
      { label: 'Base score', points: 40 },
      { label: 'RPKI valid (likely legitimate)', points: -20 },
      { label: 'AS path suspiciously long (inflation)', points: 15 },
      { label: 'Origin AS does not match expected owner', points: 15 },
      { label: '2 vantage points confirmed', points: 4 },
    ],
    severity: 'MEDIUM',
    confirmedPoints: [VP.sydney, VP.oregon],
    affectedIPs: 3072,
    rpkiStatus: { valid: true, invalid: false, unknown: false, state: 'valid', reason: null, asn: 'AS17488', prefix: '59.92.0.0/14' },
    demoAnalysisText: ANALYSIS.routeLeakISP,
  },
]

// Timing between scripted incidents appearing on the dashboard, in ms.
// With 18 scripted incidents this paces a full run to roughly 3 minutes —
// enough to feel like a live feed without dragging out a stage demo.
export const DEMO_INCIDENT_INTERVAL_MS = 10000
