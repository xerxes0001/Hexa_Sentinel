/**
 * Features 18-24 — Attack History Memory
 * Remembers previous attacks per ASN
 * Auto-escalates severity for repeat attackers
 * Detects coordinated attack patterns
 */

// In-memory attack history store
// Structure: { [attackerASN]: { count, lastSeen, targets: Set, types: Set } }
const attackHistory = new Map()

/**
 * Record an attack and return enriched metadata
 */
export function recordAttack(incident) {
  const key = incident.attacker.asn
  const existing = attackHistory.get(key)

  if (!existing) {
    attackHistory.set(key, {
      count:    1,
      lastSeen: incident.timestamp,
      targets:  new Set([incident.victim.asn]),
      types:    new Set([incident.type]),
    })
    return { isRepeat: false, attackCount: 1, previousTargets: [] }
  }

  existing.count++
  existing.lastSeen = incident.timestamp
  existing.targets.add(incident.victim.asn)
  existing.types.add(incident.type)

  return {
    isRepeat:         true,
    attackCount:      existing.count,
    previousTargets:  Array.from(existing.targets).filter(t => t !== incident.victim.asn),
    typesUsed:        Array.from(existing.types),
  }
}

/**
 * Get history for a specific attacker ASN
 */
export function getAttackerHistory(asn) {
  return attackHistory.get(asn) ?? null
}

/**
 * Escalate severity if repeat attacker
 * MEDIUM -> HIGH, HIGH -> CRITICAL, CRITICAL stays CRITICAL
 */
export function escalateSeverity(severity, isRepeat) {
  if (!isRepeat) return severity
  const ladder = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
  const idx = ladder.indexOf(severity)
  return ladder[Math.min(idx + 1, ladder.length - 1)]
}

/**
 * Get all known attacker ASNs sorted by attack count
 */
export function getTopAttackers() {
  return Array.from(attackHistory.entries())
    .map(([asn, data]) => ({ asn, ...data, targets: Array.from(data.targets) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
}

export function clearHistory() {
  attackHistory.clear()
}
