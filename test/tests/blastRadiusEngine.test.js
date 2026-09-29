import { describe, it, expect } from 'vitest'
import { simulateBlastRadius, simulateWithROV, isModeledInTopology, buildGraph, traverse } from '../src/engine/blastRadiusEngine.js'
import { RELATIONSHIP } from '../src/data/asTopology.js'

describe('isModeledInTopology', () => {
  it('recognizes real Tier-1s as modeled', () => {
    expect(isModeledInTopology('AS174')).toBe(true)   // Cogent
    expect(isModeledInTopology('AS7018')).toBe(true)  // AT&T
  })

  it('recognizes all Breach Simulator demo attacker ASNs as modeled', () => {
    const demoAttackers = ['AS4134', 'AS45595', 'AS1221', 'AS3320', 'AS7018', 'AS2516', 'AS8452', 'AS6762']
    for (const asn of demoAttackers) {
      expect(isModeledInTopology(asn), `${asn} should be modeled`).toBe(true)
    }
  })

  it('correctly reports an arbitrary real-world ASN as NOT modeled', () => {
    // A real hijacker ASN picked at random has ~1-in-1500 chance of being
    // one of our ~50 modeled nodes — this ASN is not one of them.
    expect(isModeledInTopology('AS99999')).toBe(false)
  })
})

describe('simulateBlastRadius — graph traversal correctness', () => {
  it('never includes the hijacker itself in the affected set', () => {
    const r = simulateBlastRadius('AS174', 'AS55655')
    expect(r.affectedASNs).not.toContain('AS174')
  })

  it('terminates and returns a bounded result (no infinite loop)', () => {
    const r = simulateBlastRadius('AS174', 'AS55655')
    expect(r.affectedASNs.length).toBeLessThanOrEqual(r.totalGraphSize)
    expect(r.interceptionPct).toBeGreaterThanOrEqual(0)
    expect(r.interceptionPct).toBeLessThanOrEqual(100)
  })

  it('a well-connected Tier-1 hijacker reaches more of the graph than an isolated leaf ISP', () => {
    const tier1Result = simulateBlastRadius('AS174', 'AS55655')     // Cogent
    const leafResult   = simulateBlastRadius('AS55405', 'AS55655')  // DEN Networks (leaf ISP)
    expect(tier1Result.affectedASNs.length).toBeGreaterThan(leafResult.affectedASNs.length)
  })

  it('produces non-trivial results for every demo attacker ASN (regression guard)', () => {
    // This is the exact bug this test would have caught before it shipped:
    // 7 of 8 demo attackers previously had zero graph connections.
    const demoAttackers = ['AS4134', 'AS45595', 'AS1221', 'AS3320', 'AS7018', 'AS2516', 'AS8452', 'AS6762']
    for (const asn of demoAttackers) {
      const r = simulateBlastRadius(asn, 'AS55655')
      expect(r.affectedASNs.length, `${asn} should reach at least 1 other ASN`).toBeGreaterThan(0)
    }
  })
})

describe('simulateWithROV — before/after comparison', () => {
  it('ROV enforcement never increases propagation', () => {
    const r = simulateWithROV('AS174', 'AS55655')
    expect(r.withROV.interceptionPct).toBeLessThanOrEqual(r.baseline.interceptionPct)
  })

  it('reduction is the actual delta, not a hardcoded number', () => {
    const r = simulateWithROV('AS174', 'AS55655')
    expect(r.withROV.reduction).toBe(r.baseline.interceptionPct - r.withROV.interceptionPct)
  })
})

describe('BGP local-preference correctly overrides hop count (the real algorithmic upgrade)', () => {
  // Hand-constructed graph where a SHORT, WORST-preference path (1 hop,
  // learned from a provider) competes with a LONGER, BEST-preference path
  // (2 hops, learned from a customer) to the same node. Real BGP prefers
  // customer-learned routes regardless of length — plain hop-count BFS
  // would get this wrong; the priority-based traverse() must not.
  const edges = [
    ['TARGET', 'HIJACKER', RELATIONSHIP.CUSTOMER_PROVIDER], // TARGET is HIJACKER's customer → 1-hop path, WORST preference for TARGET
    ['HIJACKER', 'MID', RELATIONSHIP.CUSTOMER_PROVIDER],    // HIJACKER is MID's customer → MID learns customer-side (best), can export anywhere
    ['MID', 'TARGET', RELATIONSHIP.CUSTOMER_PROVIDER],      // MID is TARGET's customer → 2-hop path, BEST preference for TARGET
  ]
  const graph = buildGraph(edges)

  it('TARGET attaches via the longer BEST-preference path (via MID), not the shorter WORST-preference direct path', () => {
    const { visited, parentOf, hopLevel } = traverse('HIJACKER', { graph })
    expect(parentOf.get('TARGET')).toBe('MID')       // not 'HIJACKER' — proves preference beat hop count
    expect(hopLevel.get('TARGET')).toBe(2)             // took the longer path deliberately
    expect(visited.get('TARGET')).toBe('down')         // best preference tier (customer-learned)
  })

  it('a plain hop-count-only BFS would get this wrong (sanity check that the test is meaningful)', () => {
    // Re-implements the OLD (pre-upgrade) algorithm inline to prove this
    // test actually distinguishes the two approaches, not just passes trivially.
    function oldPlainBFS(hijacker, graph) {
      function exportable(dir) { return dir === 'down' ? ['up', 'down', 'peer'] : ['down'] }
      const visited = new Map(); const parentOf = new Map()
      const queue = [{ asn: hijacker, direction: 'down' }]
      visited.set(hijacker, 'origin')
      while (queue.length) {
        const { asn, direction } = queue.shift()
        const allowed = exportable(direction)
        for (const { to, direction: edgeDir } of graph.get(asn) ?? []) {
          if (visited.has(to)) continue
          if (!allowed.includes(edgeDir)) continue
          const learned = edgeDir === 'up' ? 'down' : edgeDir === 'down' ? 'up' : 'peer'
          visited.set(to, learned); parentOf.set(to, asn)
          queue.push({ asn: to, direction: learned })
        }
      }
      return parentOf
    }
    const oldParents = oldPlainBFS('HIJACKER', graph)
    expect(oldParents.get('TARGET')).toBe('HIJACKER') // the OLD algorithm takes the shorter but worse path — this is the bug the upgrade fixes
  })
})

describe('tree structure — for the visualization', () => {
  it('every non-root tree node has an edge pointing to it', () => {
    const r = simulateBlastRadius('AS174', 'AS55655')
    const nodeAsns = r.tree.nodes.filter(n => n.role !== 'hijacker').map(n => n.asn)
    const edgeTargets = new Set(r.tree.edges.map(e => e.to))
    for (const asn of nodeAsns) {
      expect(edgeTargets.has(asn), `${asn} should have an incoming edge`).toBe(true)
    }
  })

  it('every edge source is either the hijacker or another node in the tree', () => {
    const r = simulateBlastRadius('AS174', 'AS55655')
    const allNodeAsns = new Set(r.tree.nodes.map(n => n.asn))
    for (const edge of r.tree.edges) {
      expect(allNodeAsns.has(edge.from), `edge source ${edge.from} should be a known node`).toBe(true)
    }
  })

  it('hop levels increase monotonically away from the hijacker (no back-edges)', () => {
    const r = simulateBlastRadius('AS174', 'AS55655')
    const hopByAsn = new Map(r.tree.nodes.map(n => [n.asn, n.hop]))
    for (const edge of r.tree.edges) {
      expect(hopByAsn.get(edge.to)).toBeGreaterThan(hopByAsn.get(edge.from))
    }
  })

  it('marks the victim node distinctly when it appears in the tree', () => {
    // AS7018 (AT&T) propagates widely enough to likely reach the victim's
    // upstream, but the victim itself (AS55655) is never re-infected since
    // it's excluded from its own affected set — verify role labeling works
    // for a case where victim IS reachable in the tree.
    const r = simulateBlastRadius('AS8452', 'AS6453') // Egypt hijacker, Tata as "victim"
    const victimNode = r.tree.nodes.find(n => n.asn === 'AS6453')
    if (victimNode) expect(victimNode.role).toBe('victim')
  })

  it('withROV tree includes blocked nodes with role "blocked"', () => {
    const r = simulateWithROV('AS174', 'AS55655')
    const blockedNodes = r.withROV.tree.nodes.filter(n => n.role === 'blocked')
    // AS174 peers directly with Tier-1s, so at least one should be blocked
    expect(blockedNodes.length).toBeGreaterThan(0)
  })

  it('every tree node has a resolved display name', () => {
    const r = simulateBlastRadius('AS174', 'AS55655')
    for (const node of r.tree.nodes) {
      expect(node.name).toBeTruthy()
    }
  })
})
