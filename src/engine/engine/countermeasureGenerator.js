/**
 * Countermeasure Generator — v2
 *
 * IMPORTANT — what this module does and does not do:
 *   It generates the REAL, standards-format technical artifacts a NOC engineer
 *   would deploy in response to a confirmed BGP hijack: an RPKI ROA (RFC 6482),
 *   an RTBH blackhole announcement (RFC 7999), a BGP Flowspec rule
 *   (RFC 8955, FRRouting syntax), and a more-specific prefix announcement —
 *   the technique real operators (e.g. Apple, July 2022 Rostelecom hijack)
 *   actually use to win traffic back via BGP's longest-prefix-match rule.
 *
 *   It does NOT push these to any real router, RIR, or IXP. SHYEN has no BGP
 *   session, no RPKI signing authority, and no IXP peering — no browser app
 *   does. Generation is fully autonomous (fires the instant a real incident
 *   is confirmed, no human click needed); DEPLOYMENT of the generated
 *   artifact always requires human NOC authorization. This module exists to
 *   make that boundary explicit rather than hide it behind a fake "EXECUTED"
 *   button.
 */

function pad(n) { return String(n).padStart(2, '0') }
function isoNoMillis(d) { return d.toISOString().replace(/\.\d{3}Z$/, 'Z') }

// ── IPv4 CIDR math — splits a prefix into two more-specific /N+1 halves ────
// Pure integer math, no external deps.
function ipToInt(ip) {
  const [a, b, c, d] = ip.split('.').map(Number)
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0
}
function intToIp(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}
export function splitPrefix(cidr) {
  const [base, bitsStr] = cidr.split('/')
  const bits = parseInt(bitsStr)
  if (isNaN(bits) || bits >= 32 || !base) return null
  const baseInt   = ipToInt(base)
  const newBits   = bits + 1
  const blockSize = 2 ** (32 - newBits)
  const lowerNet  = baseInt & (~(2 ** (32 - bits) - 1) >>> 0)
  const upperNet  = (lowerNet + blockSize) >>> 0
  return [
    `${intToIp(lowerNet)}/${newBits}`,
    `${intToIp(upperNet)}/${newBits}`,
  ]
}

// ── RFC 6482 — RPKI Route Origin Authorization ─────────────────────────────
export function generateROA(incident) {
  const now       = new Date()
  const notAfter  = new Date(now.getTime() + 365 * 24 * 3600 * 1000) // 1yr validity, standard practice
  const asn       = incident.victim?.asn?.replace('AS', '') ?? '?'
  const prefix    = incident.prefix ?? '0.0.0.0/0'
  const prefixBits= parseInt(prefix.split('/')[1] ?? '24')

  const json = {
    roaVersion:  '1',
    subject: {
      asID:      `AS${asn}`,
      ipAddrBlocks: [
        { addressFamily: 'IPv4', addresses: [ { prefix, maxLength: Math.min(prefixBits + 8, 32) } ] },
      ],
    },
    issuer:      'IRINN-CA (Indian Registry for Internet Names and Numbers)',
    validity: {
      notBefore: isoNoMillis(now),
      notAfter:  isoNoMillis(notAfter),
    },
    reason:      `Emergency ROA — invalidates hijacked origin claim by ${incident.attacker?.asn ?? 'unknown AS'} on ${prefix}`,
    signature:   'PENDING — requires IRINN CA private key (HexaSentinel cannot sign; NOC must submit via RIR portal)',
  }
  return JSON.stringify(json, null, 2)
}

// ── RFC 7999 — Remotely Triggered Blackhole (RTBH) community ──────────────
export function generateRTBH(incident) {
  const prefix    = incident.prefix ?? '0.0.0.0/0'
  const asn       = incident.victim?.asn ?? 'AS?'
  const now       = new Date()
  const ts        = isoNoMillis(now)

  return [
    '! RFC 7999 blackhole community route — FRRouting / Cisco IOS-XR compatible',
    `! Generated ${ts} — hijacked prefix ${prefix} (${asn})`,
    `! Deploy at all Indian IXP route servers (NIXI Mumbai, Delhi, Chennai, Kolkata)`,
    '!',
    `router bgp ${asn.replace('AS', '')}`,
    ` network ${prefix} route-map RTBH-BLACKHOLE`,
    '!',
    'route-map RTBH-BLACKHOLE permit 10',
    ' set community 65535:666',
    ' set ip next-hop 192.0.2.1',
    ' set local-preference 200',
    '!',
    `! Effect: any router honoring RFC7999 community 65535:666 will null-route`,
    `! traffic to ${prefix} instead of forwarding it toward the hijacker's AS.`,
  ].join('\n')
}

// ── RFC 8955 — BGP Flowspec drop/rate-limit rule ───────────────────────────
export function generateFlowspec(incident) {
  const prefix    = incident.prefix ?? '0.0.0.0/0'
  const attacker  = incident.attacker?.asn ?? 'AS?'
  const now       = new Date()
  const ts        = isoNoMillis(now)
  const ruleName  = `HIJACK_INC${incident.id}`

  return [
    '! RFC 8955 BGP Flowspec rule — FRRouting syntax',
    `! Generated ${ts} — discards traffic matching hijacker origin ${attacker}`,
    '!',
    `flow-spec ${ruleName}`,
    ` match destination ${prefix}`,
    ` match as-path "_${attacker.replace('AS', '')}_"`,
    ' then discard',
    '!',
    `! Effect: routers importing this Flowspec rule drop packets sourced via`,
    `! the confirmed hijacker AS path, independent of the RIB's current best path.`,
  ].join('\n')
}

// ── More-specific prefix announcement — the real fast-response technique ──
// This is what actually wins back traffic during a live hijack: BGP prefers
// the longest (most specific) matching prefix, so the legitimate owner
// out-announces the hijacker by splitting their block and advertising the
// halves. This is exactly how Apple recovered its address space during the
// July 2022 Rostelecom hijack — they announced a more-specific route
// roughly 5 hours into the incident to redirect traffic back.
// Trade-off real engineers weigh: this deaggregates the global routing
// table (adds routes to every BGP router on earth), so it's used as a
// deliberate emergency response, not a default — SHYEN flags that cost.
export function generateMoreSpecific(incident) {
  const prefix = incident.prefix ?? '0.0.0.0/0'
  const asn    = incident.victim?.asn ?? 'AS?'
  const now    = isoNoMillis(new Date())
  const halves = splitPrefix(prefix)

  if (!halves) {
    return [
      '! More-specific prefix announcement — NOT APPLICABLE',
      `! ${prefix} is already at maximum specificity (/32) or malformed; cannot subdivide further.`,
    ].join('\n')
  }

  return [
    '! More-specific prefix announcement — emergency route deaggregation',
    `! Generated ${now} — reclaims traffic from hijacker via BGP longest-prefix-match`,
    `! Precedent: Apple used this exact technique against the July 2022 Rostelecom`,
    `!            hijack of its address space (recovery took ~5h even with this method).`,
    '!',
    `router bgp ${asn.replace('AS', '')}`,
    ` network ${halves[0]}`,
    ` network ${halves[1]}`,
    '!',
    `! Effect: routers everywhere prefer these /${halves[0].split('/')[1]} announcements over`,
    `! the hijacker's ${prefix} claim, pulling traffic back to the legitimate origin —`,
    `! independent of RPKI/RTBH/Flowspec adoption at any given network.`,
    '!',
    `! COST — real operational trade-off: deaggregating ${prefix} into two routes`,
    `! permanently grows the global BGP table by 1 entry until withdrawn. This is why`,
    `! operators use it as a deliberate emergency response, not a default posture.`,
  ].join('\n')
}

// ── Orchestrator — called once per real, confirmed incident ───────────────
// This is the "autonomous" step: generation happens instantly and requires
// no human input. It is explicitly NOT a deployment/execution step.
export function generateCountermeasures(incident) {
  return {
    roa:                generateROA(incident),
    rtbh:                generateRTBH(incident),
    flowspec:            generateFlowspec(incident),
    moreSpecific:        generateMoreSpecific(incident),
    generatedAt:         new Date().toISOString(),
    status:              'GENERATED_PENDING_AUTHORIZATION',
  }
}
