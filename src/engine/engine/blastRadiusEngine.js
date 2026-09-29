/**
 * Blast Radius Simulator — Gao-Rexford AS-relationship traversal
 *
 * Predicts hijack impact BEFORE it fully propagates, using the same
 * relationship-based routing policy model real BGP-hijack-impact research
 * uses (Gao, "On Inferring Autonomous System Relationships in the
 * Internet", 2001 — the standard citable model for this kind of analysis).
 *
 * Core rule: an AS only re-exports a route it learned from a PEER or
 * PROVIDER to its own CUSTOMERS — never to other peers/providers. A route
 * learned from a CUSTOMER gets exported to everyone. This is real BGP
 * economics (peering is a cost-saving deal, not a resold transit service)
 * and it's what actually determines which networks would propagate a
 * hijacked route, not just "everyone within N hops".
 *
 * See src/data/asTopology.js for the honesty note on dataset scope.
 */
import { RELATIONSHIP, TIER1_ASNS, IXP_ASN, AS_EDGES, INDIAN_UPSTREAM_EDGES, FOREIGN_CARRIER_EDGES, FOREIGN_CARRIERS } from '../data/asTopology.js'
import { INDIAN_ASNS } from '../data/indianASNs.js'

// Name/type lookup for tree visualization labels
const NAME_LOOKUP = new Map()
for (const t of TIER1_ASNS)      NAME_LOOKUP.set(t.asn, { name: t.name, kind: 'tier1' })
for (const f of FOREIGN_CARRIERS) NAME_LOOKUP.set(f.asn, { name: f.name, kind: 'foreign' })
for (const a of INDIAN_ASNS)     NAME_LOOKUP.set(a.asn, { name: a.name, kind: 'indian', sector: a.sector })
NAME_LOOKUP.set(IXP_ASN.asn, { name: IXP_ASN.name, kind: 'ixp' })

export function lookupNode(asn) {
  return NAME_LOOKUP.get(asn) ?? { name: asn, kind: 'unknown' }
}

// Build adjacency: for each node, list of { neighbor, relation, direction }
// direction 'up' = neighbor is our provider (we are customer)
// direction 'down' = neighbor is our customer (they are customer of us)
// direction 'peer' = settlement-free peer
function buildGraph(edges) {
  const adj = new Map() // asn -> [{ to, relation }]

  function addNode(asn) {
    if (!adj.has(asn)) adj.set(asn, [])
  }

  for (const [a, b, relation] of edges) {
    addNode(a); addNode(b)
    if (relation === RELATIONSHIP.CUSTOMER_PROVIDER) {
      // a is customer of b
      adj.get(a).push({ to: b, direction: 'up' })   // a sees b as provider
      adj.get(b).push({ to: a, direction: 'down' }) // b sees a as customer
    } else {
      adj.get(a).push({ to: b, direction: 'peer' })
      adj.get(b).push({ to: a, direction: 'peer' })
    }
  }
  return adj
}

const GRAPH = buildGraph([...AS_EDGES, ...INDIAN_UPSTREAM_EDGES, ...FOREIGN_CARRIER_EDGES])

// Exported purely for testing the preference-priority logic directly
// against a small hand-constructed graph, rather than relying on the real
// topology happening to contain an ambiguous-path case.
export { buildGraph, traverse }

// True if this ASN is one of the nodes actually modeled in our topology
// subgraph (see honesty note in asTopology.js). A real, live-detected
// hijacker's ASN will very often NOT be one of these — the full internet
// has ~75,000 active ASNs and we model ~50. Callers should check this
// before showing a result, rather than presenting a trivial "0%" as if it
// were a real finding.
export function isModeledInTopology(asn) {
  return GRAPH.has(asn)
}

// ── Gao-Rexford export rule ────────────────────────────────────────────────
// Given the direction a route was LEARNED from (relative to the current
// node), which directions can it legally be RE-EXPORTED to?
//   learned from a customer (direction==='down')  → export to up, down, peer (everyone)
//   learned from a peer or provider (direction!=='down') → export only to 'down' (customers)
function exportableDirections(learnedFromDirection) {
  if (learnedFromDirection === 'down') return ['up', 'down', 'peer']
  return ['down']
}

// ── BGP local-preference ordering ───────────────────────────────────────────
// Real BGP best-path selection checks LOCAL_PREF before AS-path length —
// operators assign the highest local preference to routes learned from
// customers (revenue-generating), medium to peers (free, cost-saving),
// and lowest to providers (paid transit, avoided when a cheaper option
// exists). This is why the traversal below is a priority search (lower
// PREF_COST always wins, hop count only breaks ties within the same
// preference tier) rather than plain hop-count BFS — a customer-learned
// route 4 hops away legitimately beats a provider-learned route 2 hops
// away in real BGP, and the earlier version of this engine didn't model
// that (it just took whichever path a FIFO queue discovered first).
const PREF_COST = { down: 0, peer: 1, up: 2 } // 'down' = learned from a customer = best

/**
 * Core traversal, shared by simulateBlastRadius and simulateWithROV.
 * Dijkstra-style: at each step, finalizes the not-yet-visited node with
 * the globally best (lowest) priority = preferenceTier*1000 + hopCount,
 * then relaxes its neighbors. This is well-founded (optimal) because
 * priority only increases along any path — the same guarantee that makes
 * Dijkstra correct for non-negative edge weights.
 *
 * @param {string} hijackerASN
 * @param {{ blockTier1?: boolean }} opts — if true, any Tier-1 network
 *   finalizes as 'blocked' instead of propagating further (ROV enforcement).
 */
function traverse(hijackerASN, { blockTier1 = false, graph = GRAPH } = {}) {
  const visited  = new Map() // asn -> finalized learnedDirection | 'blocked-by-rov' | 'origin'
  const parentOf = new Map()
  const hopLevel = new Map()
  const candidates = new Map() // asn -> { direction, hop, parent, priority } — best known, not yet finalized

  visited.set(hijackerASN, 'origin')
  hopLevel.set(hijackerASN, 0)

  function relaxFrom(fromAsn, fromDirection, fromHop) {
    const neighbors = graph.get(fromAsn) ?? []
    const allowedExports = exportableDirections(fromDirection)
    for (const { to, direction: edgeDir } of neighbors) {
      if (visited.has(to)) continue
      if (!allowedExports.includes(edgeDir)) continue
      const learnedDirection = edgeDir === 'up' ? 'down' : edgeDir === 'down' ? 'up' : 'peer'
      const priority = PREF_COST[learnedDirection] * 1000 + (fromHop + 1)
      const existing = candidates.get(to)
      if (!existing || priority < existing.priority) {
        candidates.set(to, { direction: learnedDirection, hop: fromHop + 1, parent: fromAsn, priority })
      }
    }
  }

  relaxFrom(hijackerASN, 'down', 0) // hijacker "originates" — treated as customer-learned, exports everywhere

  // Graph here is small (~50 nodes), so a linear scan for the minimum each
  // round is simpler and plenty fast — no need for a real heap.
  while (candidates.size > 0) {
    let bestAsn = null, bestPriority = Infinity
    for (const [asn, c] of candidates) {
      if (c.priority < bestPriority) { bestPriority = c.priority; bestAsn = asn }
    }
    const { direction, hop, parent } = candidates.get(bestAsn)
    candidates.delete(bestAsn)

    if (blockTier1 && TIER1_ASNS.some(t => t.asn === bestAsn)) {
      visited.set(bestAsn, 'blocked-by-rov')
      parentOf.set(bestAsn, parent)
      hopLevel.set(bestAsn, hop)
      continue // finalized as blocked — do not relax further from here
    }

    visited.set(bestAsn, direction)
    parentOf.set(bestAsn, parent)
    hopLevel.set(bestAsn, hop)
    relaxFrom(bestAsn, direction, hop)
  }

  return { visited, parentOf, hopLevel }
}

function buildResultFromTraversal(hijackerASN, victimASN, { visited, parentOf, hopLevel }) {
  visited.delete(hijackerASN)
  const blockedASNs  = [...visited.keys()].filter(a => visited.get(a) === 'blocked-by-rov')
  const affectedASNs = [...visited.keys()].filter(a => visited.get(a) !== 'blocked-by-rov')

  const affectedIndianASNs = INDIAN_ASNS.filter(a => affectedASNs.includes(a.asn) && a.asn !== victimASN)

  const countries = new Set()
  for (const asn of affectedASNs) {
    const t1 = TIER1_ASNS.find(t => t.asn === asn)
    const fc = FOREIGN_CARRIERS.find(f => f.asn === asn)
    if (t1) countries.add(t1.country)
    else if (fc) countries.add(fc.country)
    else if (INDIAN_ASNS.some(a => a.asn === asn) || asn === IXP_ASN.asn) countries.add('IN')
  }

  const totalGraphSize = GRAPH.size - 1
  const interceptionPct = totalGraphSize > 0 ? Math.round((affectedASNs.length / totalGraphSize) * 100) : 0

  const tree = {
    nodes: [
      { asn: hijackerASN, hop: 0, role: 'hijacker', ...lookupNode(hijackerASN) },
      ...affectedASNs.map(asn => ({
        asn, hop: hopLevel.get(asn), role: asn === victimASN ? 'victim' : 'affected', ...lookupNode(asn),
      })),
      ...blockedASNs.map(asn => ({
        asn, hop: hopLevel.get(asn), role: 'blocked', ...lookupNode(asn),
      })),
    ],
    edges: [...affectedASNs, ...blockedASNs].map(asn => ({ from: parentOf.get(asn), to: asn })),
  }

  return { affectedASNs, affectedIndianASNs, countries: [...countries], interceptionPct, totalGraphSize, tree, blockedASNs }
}

/**
 * Traverse the graph from the hijacker outward, following only
 * Gao-Rexford-legal export paths AND real BGP local-preference ordering
 * (customer-learned > peer-learned > provider-learned, hop count only as
 * a tiebreaker within the same preference tier), to compute which ASes
 * would settle on the hijacked route as their best path.
 */
export function simulateBlastRadius(hijackerASN, victimASN) {
  const result = buildResultFromTraversal(hijackerASN, victimASN, traverse(hijackerASN))
  return { hijackerASN, victimASN, ...result }
}

/**
 * Run the simulation twice — once as-is, once assuming RPKI ROV is
 * enforced (i.e. any AS that would validate the hijack as RPKI-invalid
 * simply drops it and never re-exports it further). This produces the
 * real before/after comparison for the "if ROV were deployed" pitch.
 *
 * Simplification disclosed: we model 100% ROV enforcement at the FIRST
 * Tier-1 hop the hijack would reach (a reasonable proxy — major transit
 * providers are the highest-value ROV deployment targets in reality, and
 * ~50% of global prefixes already have ROA coverage per RPKI adoption
 * stats), rather than simulating partial per-AS ROV adoption rates, which
 * would need real per-AS ROV-enforcement data we don't have.
 */
export function simulateWithROV(hijackerASN, victimASN) {
  const baseline = simulateBlastRadius(hijackerASN, victimASN)
  const rovResult = buildResultFromTraversal(hijackerASN, victimASN, traverse(hijackerASN, { blockTier1: true }))

  return {
    baseline,
    withROV: {
      affectedASNs: rovResult.affectedASNs,
      interceptionPct: rovResult.interceptionPct,
      reduction: baseline.interceptionPct - rovResult.interceptionPct,
      tree: rovResult.tree,
    },
  }
}
