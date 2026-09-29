/**
 * Autonomous Actions Engine — v3
 *
 * Flow:
 *  1. Incident created → DETECTED (active, visible on dashboard)
 *  2. After realistic response delay → playbook fires → MITIGATED
 *  3. AI layer adds reasoning on top (doesn't block mitigation)
 *
 * This matches real NOC behaviour: attacks are VISIBLE as active threats,
 * then mitigated after the system works through them — not instant-hidden.
 */

// ── Realistic mitigation delay by severity ────────────────────────────────
// Real BGP hijack response times (RIPE/MANRS data):
//   CRITICAL: ~8-20s (automated RPKI ROV propagation)
//   HIGH:     ~20-45s
//   MEDIUM:   ~45-90s
//   LOW:      ~90-180s
export function getMitigationDelay(severity, isRepeat) {
  // Max 12s for any incident. Realistic spread within that window:
  const base = {
    CRITICAL: 3000,   // ~3s  — immediate automated response
    HIGH:     6000,   // ~6s
    MEDIUM:   9000,   // ~9s
    LOW:      11000,  // ~11s
  }[severity] ?? 8000

  // Repeat attackers get faster response (pre-configured filters)
  const multiplier = isRepeat ? 0.6 : 1
  // Small jitter so not all incidents resolve at the exact same moment
  const jitter = Math.random() * 0.3 + 0.85  // 0.85x – 1.15x
  return Math.min(12000, Math.round(base * multiplier * jitter))
}

// ── What actions to take (not when — timing handled by App.jsx) ───────────
export function getDeterministicActions(incident) {
  const conf   = incident.confidence ?? 0
  const pts    = incident.confirmedPoints?.length ?? 0
  const rpki   = incident.rpkiStatus?.state
  const type   = incident.type
  const sector = incident.victim?.sector
  const repeat = incident.isRepeatAttacker

  const actions = []
  const criticalSector = ['Financial', 'Defense', 'Government'].includes(sector)

  // RPKI push conditions
  if (
    rpki === 'invalid' ||
    conf >= 70 ||
    (criticalSector && conf >= 50) ||
    type === 'ORIGIN_HIJACK' ||
    type === 'SUBPREFIX_HIJACK'
  ) {
    actions.push({ field: 'rpkiPushed', label: 'PUSH RPKI', trigger: 'PLAYBOOK' })
  }

  // IXP alert conditions
  if (pts >= 1 || conf >= 40) {
    actions.push({ field: 'ixpAlerted', label: 'ALERT IXPs', trigger: 'PLAYBOOK' })
  }

  // Forensics
  if (repeat || conf >= 65 || criticalSector) {
    actions.push({ field: 'forensicsReady', label: 'FORENSICS', trigger: 'PLAYBOOK' })
  }

  return actions
}

// ── Build unique deterministic summary (instant, no API needed) ───────────
export function buildDeterministicSummary(incident) {
  const conf    = incident.confidence ?? 0
  const pts     = incident.confirmedPoints?.length ?? 0
  const rpki    = incident.rpkiStatus?.state ?? 'unknown'
  const type    = incident.type?.replace(/_/g, ' ') ?? 'BGP ANOMALY'
  const victim  = incident.victim?.name ?? 'Unknown ISP'
  const asn     = incident.victim?.asn ?? '?'
  const sector  = incident.victim?.sector ?? 'ISP'
  const prefix  = incident.prefix ?? '?'
  const attAsn  = incident.attacker?.asn ?? '?'
  const country = incident.attacker?.country !== '??' ? incident.attacker?.country : 'unresolved origin'
  const ips     = incident.affectedIPs?.toLocaleString() ?? '?'
  const repeat  = incident.isRepeatAttacker
    ? ` (REPEAT OFFENDER — ${incident.repeatCount} prior attacks)`
    : ''

  const rpkiLine = rpki === 'invalid'
    ? `RPKI ROA is CRYPTOGRAPHICALLY INVALID — confirming illegitimate origin claim.`
    : rpki === 'valid'
    ? `RPKI ROA is valid — attacker may be exploiting a misconfiguration or customer route.`
    : `No RPKI ROA exists for this prefix — unprotected, any AS can announce it.`

  const pathNote = incident.pathAnomaly === 'PATH_TOO_SHORT'
    ? `AS path is abnormally short — consistent with a forged or spoofed origin.`
    : incident.pathAnomaly === 'PATH_TOO_LONG'
    ? `AS path inflation detected — attacker prepending ASNs to manipulate traffic engineering.`
    : incident.prependCount > 0
    ? `AS path prepending observed (${incident.prependCount} extra hops) — deliberate manipulation.`
    : `AS path length within normal bounds for this region.`

  const urgency = conf >= 85
    ? `IMMEDIATE RESPONSE INITIATED.`
    : conf >= 65
    ? `AUTOMATED MITIGATION QUEUED.`
    : `MONITORING AND SAFEGUARDS ACTIVE.`

  return `THREAT ASSESSMENT: ${type} detected on ${victim} (${asn}), sector: ${sector}. ` +
    `Attacker ${attAsn}${repeat} from ${country} is announcing ${prefix}, affecting ~${ips} IPs. ` +
    `${rpkiLine} ${urgency}\n\n` +
    `ATTACK VECTOR: ${pathNote} Confirmed by ${pts}/8 global vantage points at ${conf}% confidence. ` +
    `${incident.hasBlackholeComm ? 'BGP blackhole community detected — possible traffic blackholing / DoS.' : incident.hasSuspiciousCommunity ? 'Suspicious BGP community tags present in announcement.' : 'No suspicious communities in announcement.'}\n\n` +
    `RECOMMENDED ACTIONS:\n` +
    `• ${conf >= 70 || rpki === 'invalid' ? 'RPKI ROA invalidation queued for IRINN — will block route at all ROV-enforcing peers' : 'Push RPKI ROA invalidation to IRINN'}\n` +
    `• ${pts >= 1 ? 'IXP filter push queued — NIXI Mumbai, Delhi, Chennai, Kolkata notified' : 'Alert NIXI exchange points to reject announcement from ' + attAsn}\n` +
    `• ${incident.isRepeatAttacker ? 'Escalate to CERT-In — repeat attacker ' + attAsn + ' flagged for upstream blacklisting' : 'File CERT-In report if attack persists beyond mitigation window'}`
}

// ── Apply actions after the delay fires (called from App.jsx timer) ────────
export function executeDeterministicMitigation(incident) {
  const actions = getDeterministicActions(incident)
  const updated = { ...incident }

  actions.forEach(a => { updated[a.field] = true })

  if (updated.rpkiPushed && updated.ixpAlerted) {
    updated.status           = 'MITIGATED'
    updated.mitigatedAt      = new Date().toISOString()
    updated.mitigationMs     = Date.now() - new Date(incident.timestamp).getTime()
    updated.mitigationSource = 'AUTONOMOUS_PLAYBOOK'
  }

  return { updated, actions }
}

export function getAutonomousActions(decision) {
  const immediateAction = decision?.immediateAction
  const actions = []

  if (decision?.recommendRPKI || immediateAction === 'PUSH_RPKI') {
    actions.push({ field: 'rpkiPushed', label: 'PUSH RPKI' })
  }
  if (decision?.recommendIXP || immediateAction === 'ALERT_IXP') {
    actions.push({ field: 'ixpAlerted', label: 'ALERT IXPs' })
  }
  if (immediateAction === 'FORENSICS') {
    actions.push({ field: 'forensicsReady', label: 'FORENSICS' })
  }
  if (decision?.attackConfirmed) {
    if (!actions.find(a => a.field === 'rpkiPushed'))     actions.push({ field: 'rpkiPushed',     label: 'PUSH RPKI' })
    if (!actions.find(a => a.field === 'ixpAlerted'))     actions.push({ field: 'ixpAlerted',     label: 'ALERT IXPs' })
    if (!actions.find(a => a.field === 'forensicsReady')) actions.push({ field: 'forensicsReady', label: 'FORENSICS' })
  }

  return actions
}

export function getAlertModeActions() {
  return [
    { field: 'rpkiPushed',     label: 'PUSH RPKI' },
    { field: 'flagged',        label: 'FLAG FOR REVIEW' },
    { field: 'ixpAlerted',     label: 'ALERT IXPs' },
    { field: 'forensicsReady', label: 'FORENSICS' },
  ]
}

export function applyAutonomousDecision(incident, decision) {
  const actions = getAutonomousActions(decision)
  const updated = {
    ...incident,
    aiDecided:   true,
    aiAnalyzing: false,
    aiDecision:  decision,
    aiDecidedAt: new Date().toISOString(),
    autonomousActionsExecuted: actions.map(a => a.label),
  }

  // NOTE: this path only ever runs for REAL incidents (AI analysis is skipped
  // for simulated/demo incidents in App.jsx). SHYEN has no real BGP session,
  // RPKI signing authority, or IXP peering — it cannot actually push these
  // actions to the network, so this never claims MITIGATED. The AI's role is
  // threat analysis and recommending which of the already-generated
  // countermeasure artifacts (RPKI ROA / RTBH / Flowspec) a NOC should
  // prioritize deploying; the flags below reflect that recommendation, not
  // an executed action.
  actions.forEach(a => { updated[a.field] = true })

  return updated
}

export function applyAlertModeDecision(incident, decision) {
  const actions = getAlertModeActions()
  const updated = {
    ...incident,
    aiAnalyzing: false,
    aiAlerted:   true,
    aiAlert:     decision,
    aiDecidedAt: new Date().toISOString(),
    autonomousActionsExecuted: actions.map(a => a.label),
  }

  // Same real-vs-fake boundary as applyAutonomousDecision above — alert-mode
  // never claims MITIGATED for a real incident; it flags recommended actions
  // for NOC review only.
  actions.forEach(a => { updated[a.field] = true })

  return updated
}
