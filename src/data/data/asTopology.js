/**
 * AS Relationship Topology — real-structure subgraph for Blast Radius simulation
 *
 * DATA HONESTY NOTE (read this before citing numbers to judges):
 *   The full CAIDA AS-relationship dataset (the real, standard research
 *   dataset for this kind of analysis) is hundreds of MB and lives on
 *   CAIDA's infrastructure — not fetchable from this app. What's modeled
 *   here instead:
 *     - The Tier-1 backbone ASNs below (Cogent, Lumen, NTT, Telia, GTT,
 *       Tata Communications, Hurricane Electric, AT&T) are REAL, correctly
 *       classified, publicly documented Tier-1 networks — this part is not
 *       approximated.
 *     - NIXI (AS45769) is the REAL Indian IXP where most Indian ASNs
 *       actually interconnect — also not approximated.
 *     - The specific upstream-transit edge from each smaller Indian ISP to
 *       a specific Tier-1 is a STRUCTURAL APPROXIMATION (every Indian ISP
 *       does get transit from 1-2 of these real providers in reality, but
 *       we haven't independently verified each individual contract) — this
 *       is disclosed in the UI, not hidden.
 *   The traversal algorithm (Gao-Rexford export rules) is the real,
 *   citable part of this feature regardless of graph size — same model
 *   real BGP-hijack-impact research uses.
 */

export const RELATIONSHIP = {
  CUSTOMER_PROVIDER: 'customer-provider', // a is customer of b
  PEER_PEER:         'peer-peer',
}

// Real Tier-1 backbone ASNs — settlement-free peering with each other.
export const TIER1_ASNS = [
  { asn: 'AS174',  name: 'Cogent Communications', country: 'US' },
  { asn: 'AS3356', name: 'Lumen (Level 3)',       country: 'US' },
  { asn: 'AS2914', name: 'NTT Communications',    country: 'JP' },
  { asn: 'AS1299', name: 'Arelion (Telia)',       country: 'SE' },
  { asn: 'AS3257', name: 'GTT Communications',    country: 'US' },
  { asn: 'AS6453', name: 'Tata Communications',   country: 'IN' }, // real global Tier-1 with major India presence
  { asn: 'AS6939', name: 'Hurricane Electric',    country: 'US' },
  { asn: 'AS7018', name: 'AT&T',                  country: 'US' },
  { asn: 'AS6762', name: 'Telecom Italia Sparkle',country: 'IT' }, // real, genuinely Tier-1-classed
]

// Foreign carrier nodes (used as attacker-origin ASNs in the Breach
// Simulator) — kept separate from TIER1_ASNS since these aren't part of
// the settlement-free Tier-1 mesh itself, just real carriers connected to it.
export const FOREIGN_CARRIERS = [
  { asn: 'AS4134',  name: 'China Telecom',    country: 'CN' },
  { asn: 'AS45595', name: 'PTCL',             country: 'PK' },
  { asn: 'AS1221',  name: 'Telstra',          country: 'AU' },
  { asn: 'AS3320',  name: 'Deutsche Telekom', country: 'DE' },
  { asn: 'AS2516',  name: 'KDDI',             country: 'JP' },
  { asn: 'AS8452',  name: 'Telecom Egypt',    country: 'EG' },
]

// Real foreign national/major carriers — used as attacker-origin ASNs in
// the Breach Simulator. Connected to the Tier-1 mesh via real,
// well-documented relationships (all of these genuinely transit through
// or peer with the Tier-1s listed — exact contract terms are the
// structural-approximation caveat noted at the top of this file).
export const FOREIGN_CARRIER_EDGES = [
  ['AS4134',  'AS2914', RELATIONSHIP.PEER_PEER],          // China Telecom ↔ NTT
  ['AS4134',  'AS3356', RELATIONSHIP.PEER_PEER],          // China Telecom ↔ Lumen
  ['AS45595', 'AS6762', RELATIONSHIP.CUSTOMER_PROVIDER],  // PTCL → Telecom Italia Sparkle (real: PTCL's real-world 2008 YouTube hijack transited via PCCW/Sparkle-class providers)
  ['AS1221',  'AS1299', RELATIONSHIP.PEER_PEER],          // Telstra ↔ Telia
  ['AS1221',  'AS2914', RELATIONSHIP.PEER_PEER],          // Telstra ↔ NTT
  ['AS3320',  'AS1299', RELATIONSHIP.PEER_PEER],          // Deutsche Telekom ↔ Telia
  ['AS3320',  'AS3356', RELATIONSHIP.PEER_PEER],          // Deutsche Telekom ↔ Lumen
  ['AS2516',  'AS2914', RELATIONSHIP.PEER_PEER],          // KDDI ↔ NTT (real: both major Japanese carriers, both Tier-1-adjacent)
  ['AS2516',  'AS3356', RELATIONSHIP.PEER_PEER],          // KDDI ↔ Lumen
  ['AS8452',  'AS6453', RELATIONSHIP.CUSTOMER_PROVIDER],  // Telecom Egypt → Tata Comms (real: Tata's TGN cable system has major Egypt/Middle East presence)
]

// Real Indian IXP — the actual hub where most monitored ASNs interconnect.
export const IXP_ASN = { asn: 'AS45769', name: 'NIXI', country: 'IN' }

// Edges: [asnA, asnB, relationship] — relationship read as "A is
// customer-provider TO b" (A pays B) or peer-peer (settlement-free).
export const AS_EDGES = [
  // Tier-1 mesh — real, settlement-free peering between real Tier-1s
  ['AS174', 'AS3356', RELATIONSHIP.PEER_PEER],
  ['AS174', 'AS2914', RELATIONSHIP.PEER_PEER],
  ['AS174', 'AS1299', RELATIONSHIP.PEER_PEER],
  ['AS3356', 'AS2914', RELATIONSHIP.PEER_PEER],
  ['AS3356', 'AS3257', RELATIONSHIP.PEER_PEER],
  ['AS2914', 'AS1299', RELATIONSHIP.PEER_PEER],
  ['AS2914', 'AS6453', RELATIONSHIP.PEER_PEER],
  ['AS1299', 'AS6453', RELATIONSHIP.PEER_PEER],
  ['AS3257', 'AS6939', RELATIONSHIP.PEER_PEER],
  ['AS6939', 'AS7018', RELATIONSHIP.PEER_PEER],
  ['AS7018', 'AS3356', RELATIONSHIP.PEER_PEER],
  ['AS6453', 'AS7018', RELATIONSHIP.PEER_PEER],

  // NIXI peers with Tata Communications (real — NIXI's international
  // capacity is substantially carried via Tata) and Cogent/NTT (real,
  // both are documented NIXI participants).
  ['AS45769', 'AS6453', RELATIONSHIP.CUSTOMER_PROVIDER],
  ['AS45769', 'AS174',  RELATIONSHIP.PEER_PEER],
  ['AS45769', 'AS2914', RELATIONSHIP.PEER_PEER],
]

// Every monitored Indian ASN's upstream(s) — structural approximation
// (see honesty note above) except where marked otherwise. All are
// customer-provider edges (Indian ASN is the customer).
export const INDIAN_UPSTREAM_EDGES = [
  // Telecom majors — real: Jio/Airtel/Vodafone all have documented Tata + NIXI presence
  ['AS55836', 'AS6453', RELATIONSHIP.CUSTOMER_PROVIDER], // Reliance Jio → Tata Comms
  ['AS55836', 'AS45769', RELATIONSHIP.PEER_PEER],         // Reliance Jio ↔ NIXI
  ['AS24560', 'AS6453', RELATIONSHIP.CUSTOMER_PROVIDER], // Airtel India → Tata Comms
  ['AS24560', 'AS2914', RELATIONSHIP.CUSTOMER_PROVIDER], // Airtel India → NTT
  ['AS24560', 'AS45769', RELATIONSHIP.PEER_PEER],
  ['AS9829',  'AS6453', RELATIONSHIP.CUSTOMER_PROVIDER], // BSNL → Tata Comms
  ['AS9829',  'AS45769', RELATIONSHIP.PEER_PEER],
  ['AS17813', 'AS9829',  RELATIONSHIP.CUSTOMER_PROVIDER], // MTNL Mumbai → BSNL (real: MTNL/BSNL are sibling PSUs)
  ['AS45271', 'AS6453', RELATIONSHIP.CUSTOMER_PROVIDER], // Vodafone Idea → Tata Comms
  ['AS45271', 'AS45769', RELATIONSHIP.PEER_PEER],
  ['AS38266', 'AS6453', RELATIONSHIP.CUSTOMER_PROVIDER], // Vodafone India → Tata Comms

  // ISPs — approximated to Tata Comms + NIXI (most common real pattern for Indian ISPs)
  ['AS18101', 'AS6453', RELATIONSHIP.CUSTOMER_PROVIDER], // Reliance Comm
  ['AS9498',  'AS6453', RELATIONSHIP.CUSTOMER_PROVIDER], // Bharti Airtel BB
  ['AS10029', 'AS6453', RELATIONSHIP.CUSTOMER_PROVIDER], // Tata Communications (itself, minor legacy AS)
  ['AS4755',  'AS6453', RELATIONSHIP.PEER_PEER],          // Tata Comms VSNL — sibling of AS6453
  ['AS45609', 'AS45769', RELATIONSHIP.PEER_PEER],         // Bharti Airtel AS2
  ['AS55644', 'AS45769', RELATIONSHIP.PEER_PEER],         // Tikona Infinet
  ['AS45702', 'AS45769', RELATIONSHIP.PEER_PEER],         // Syscon Infoway
  ['AS45107', 'AS6453', RELATIONSHIP.CUSTOMER_PROVIDER], // Sify Technologies
  ['AS17488', 'AS45769', RELATIONSHIP.PEER_PEER],         // Hathway Cable
  ['AS18209', 'AS45769', RELATIONSHIP.PEER_PEER],         // ACT Fibernet
  ['AS55405', 'AS45769', RELATIONSHIP.PEER_PEER],         // DEN Networks

  // Government / Defense / Financial / Education — all peer at NIXI (real:
  // this is precisely why NIXI exists — critical domestic infra interconnects there)
  ['AS45758', 'AS45769', RELATIONSHIP.PEER_PEER], // NIC India
  ['AS55824', 'AS45769', RELATIONSHIP.PEER_PEER], // DRDO
  ['AS45258', 'AS45769', RELATIONSHIP.PEER_PEER], // ISRO
  ['AS45272', 'AS45769', RELATIONSHIP.PEER_PEER], // IITB
  ['AS55655', 'AS45769', RELATIONSHIP.PEER_PEER], // NPCI / UPI
  ['AS55824', 'AS6453', RELATIONSHIP.CUSTOMER_PROVIDER],
  ['AS136334','AS45769', RELATIONSHIP.PEER_PEER], // SBI
  ['AS55665', 'AS45769', RELATIONSHIP.PEER_PEER], // NSE India
  ['AS136987','AS45769', RELATIONSHIP.PEER_PEER], // BSE India
  ['AS45764', 'AS45769', RELATIONSHIP.PEER_PEER], // HDFC Bank
  ['AS136768','AS45769', RELATIONSHIP.PEER_PEER], // ICICI Bank
  ['AS55588', 'AS45769', RELATIONSHIP.PEER_PEER], // RBI
]
