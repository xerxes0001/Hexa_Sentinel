// Feature #76 #77 — Certificate Transparency monitoring via crt.sh
//
// BGP + Certificate Transparency correlation — the real attack pattern this
// defends against: an attacker hijacks a bank/gov IP range AND simultaneously
// gets a new TLS cert issued for that domain, so browsers show a valid
// padlock while traffic is actually going to the attacker. This is the
// mechanism behind real incidents like the 2018 MyEtherWallet and 2022
// KLAYswap hijacks — BGP hijack + malicious cert issuance, timed together.
// Correlating routing-layer (BGP) with PKI-layer (CT logs) evidence gives a
// much higher-confidence signal than either alone.

// Per-ASN domain mapping — lets us correlate a SPECIFIC incident's victim to
// its SPECIFIC real domain, rather than guessing from sector alone.
export const ASN_DOMAIN_MAP = {
  'AS55655':  ['npci.org.in'],                        // NPCI / UPI
  'AS136334': ['sbi.co.in'],                           // SBI
  'AS45764':  ['hdfcbank.com'],                        // HDFC Bank
  'AS136768': ['icicibank.com'],                       // ICICI Bank
  'AS55588':  ['rbi.org.in'],                          // RBI
  'AS45117':  ['uidai.gov.in'],                        // UIDAI / Aadhaar
  'AS55665':  ['nseindia.com'],                        // NSE India
  'AS136987': ['bseindia.com'],                        // BSE India
  'AS45758':  ['incometax.gov.in'],                    // NIC India
}

const INDIAN_BANK_DOMAINS = [
  'sbi.co.in','hdfcbank.com','icicibank.com','axisbank.com',
  'pnb.co.in','bankofbaroda.com','uidai.gov.in','rbi.org.in',
  'npci.org.in','incometax.gov.in',
]
const TRUSTED_CAS = ['DigiCert','Let\'s Encrypt','GlobalSign','Sectigo','GoDaddy','Amazon','Google Trust','Comodo','Entrust']

// Correlation window — real coordinated attacks issue the fraudulent cert
// tightly around the hijack (minutes to a few hours), not days apart.
// Wider than that and it's very likely coincidental routine cert renewal.
const CORRELATION_WINDOW_MS = 6 * 3600 * 1000 // 6 hours

export async function fetchCertEvents(domain) {
  try {
    const r = await fetch(
      `https://crt.sh/?q=${encodeURIComponent('%25.' + domain)}&output=json&limit=8`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!r.ok) return []
    const certs = await r.json()
    const cutoff = Date.now() - 7 * 86400000 // last 7 days
    return certs
      .filter(c => new Date(c.not_before).getTime() > cutoff)
      .map(c => {
        const trusted = TRUSTED_CAS.some(ca => (c.issuer_name || '').includes(ca))
        return {
          domain, id: c.id,
          commonName: c.common_name,
          issuer:     (c.issuer_name || 'Unknown').slice(0, 80),
          issuedAt:   c.not_before,
          suspicious: !trusted,
          severity:   !trusted ? 'HIGH' : 'LOW',
        }
      })
  } catch { return [] }
}

export async function runCertSentinel() {
  const results = []
  for (const domain of INDIAN_BANK_DOMAINS.slice(0, 5)) {
    const certs = await fetchCertEvents(domain)
    results.push(...certs)
    await new Promise(r => setTimeout(r, 400))
  }
  return results
}

// ── Real-time correlation for a SINGLE incident ────────────────────────────
// Called from the real detection path the moment a Financial/Government
// incident is confirmed. Checks CT logs for the victim's actual domain(s)
// and flags a coordinated attack only if a suspicious cert was issued
// within CORRELATION_WINDOW_MS of the hijack — not just "sometime this week".
export async function checkCoordinatedAttack(incident) {
  const domains = ASN_DOMAIN_MAP[incident.victim?.asn]
  if (!domains) return null // no mapped domain for this ASN — can't correlate

  const incidentTime = new Date(incident.timestamp).getTime()
  for (const domain of domains) {
    const certs = await fetchCertEvents(domain)
    const match = certs.find(c => {
      if (!c.suspicious) return false
      const certTime = new Date(c.issuedAt).getTime()
      return Math.abs(certTime - incidentTime) <= CORRELATION_WINDOW_MS
    })
    if (match) {
      return {
        domain,
        certIssuer:    match.issuer,
        certCommonName: match.commonName,
        certIssuedAt:  match.issuedAt,
        windowMs:      Math.abs(new Date(match.issuedAt).getTime() - incidentTime),
        detectedAt:    new Date().toISOString(),
      }
    }
  }
  return null
}

// ── Batch version — scans across all currently active incidents ───────────
// (used by the CertSentinel agent panel for an on-demand full sweep)
export function detectCoordinatedAttack(incidents, certEvents) {
  const coordinated = []
  for (const inc of incidents.filter(i => i.status === 'DETECTED')) {
    const domains = ASN_DOMAIN_MAP[inc.victim?.asn] ?? []
    const suspCert = certEvents.find(c => c.suspicious && domains.includes(c.domain))
    if (suspCert) {
      coordinated.push({
        incidentId:  inc.id,
        victim:      inc.victim,
        prefix:      inc.prefix,
        domain:      suspCert.domain,
        certIssuer:  suspCert.issuer,
        severity:    'CRITICAL',
        detectedAt:  new Date(),
        type:        'COORDINATED_ATTACK',
      })
    }
  }
  return coordinated
}
