import { useEffect, useState, lazy, Suspense } from 'react'
import { useSHYENStore }      from './store/useSHYENStore.js'
import { RIPERISConnection, scoreConfidence, scoreConfidenceBreakdown } from './api/ripeRIS.js'
import { getDecision, connectThreatStream, checkHealth } from './api/hexasentinelAPI.js'
import { preCheckRPKI }       from './api/rpkiCheck.js'
import { lookupASCountry, prewarmASCache } from './api/asLookup.js'
import { loadAPNICData, getAPNICStatus, resolveRealASN } from './api/apnic.js'
import { recordAttack, escalateSeverity } from './engine/attackMemory.js'
import { getMitigationDelay, executeDeterministicMitigation, buildDeterministicSummary } from './engine/autonomousActions.js'
import { generateCountermeasures } from './engine/countermeasureGenerator.js'
import { checkCoordinatedAttack } from './utils/certMonitor.js'
import { DEMO_INCIDENTS, DEMO_INCIDENT_INTERVAL_MS } from './data/demoScript.js'
import { getSeverity }        from './engine/severityEngine.js'
import { hostToVantage }      from './data/vantagePoints.js'
import { usePageTitle }       from './hooks/usePageTitle.js'
import { SEVERITY_ORDER }     from './utils/severity.js'

import TopNav             from './components/layout/TopNav.jsx'
import BGPTicker          from './components/layout/BGPTicker.jsx'
import StatsBar           from './components/layout/StatsBar.jsx'
import WhatHappened        from './components/layout/WhatHappened.jsx'
import Footer              from './components/layout/Footer.jsx'
import OperationalTimeline from './components/layout/OperationalTimeline.jsx'
import IncidentList        from './components/incidents/IncidentList.jsx'
import AttackHeatmap       from './components/incidents/AttackHeatmap.jsx'
import ASNHealthGrid       from './components/asns/ASNHealthGrid.jsx'
import DetailPanel         from './components/detail/DetailPanel.jsx'
import AINotification      from './components/shared/AINotification.jsx'
import PanelErrorBoundary  from './components/shared/PanelErrorBoundary.jsx'
import ThreatMap           from './components/map/ThreatMap.jsx'
import HexaSentinelPanel     from './components/panels/HexaSentinelPanel.jsx'
import NetworkGraph       from './components/panels/NetworkGraph.jsx'

// Code-split: three.js (Globe3D) is the single largest dependency in this
// app and isn't needed until first paint of the globe view; the Breach
// Simulator and Country History page are only opened on click. Splitting
// these keeps the initial bundle smaller and lets the browser fetch them
// in parallel rather than blocking on one monolithic chunk.
const Globe3D            = lazy(() => import('./components/map/Globe3D.jsx'))
const BreachSimulator    = lazy(() => import('./components/breach/BreachSimulator.jsx'))
const CountryHistoryPage = lazy(() => import('./components/pages/CountryHistoryPage.jsx'))

function PanelFallback() {
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'center', height:'100%', minHeight:200,
      fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-muted)', letterSpacing:1,
    }}>
      LOADING…
    </div>
  )
}

let incidentIdCounter    = 100

// ── Incident rate limiting ────────────────────────────────────────────────
// Thresholds matched to the published ARTEMIS BGP-hijack-detection standard
// (Sermpezis et al., "ARTEMIS: Neutralizing BGP Hijacking within a Minute",
// ACM/IEEE ToN 2018 — the RIPE-hosted, production BGP hijack detector):
//   - ARTEMIS finds that requiring >=2 INDEPENDENT monitors/vantage points
//     to see the same anomaly "greatly reduces false positives"; SHYEN
//     requires the same (VANTAGE_CORROBORATION_REQUIRED below).
//   - ARTEMIS achieves its published near-zero false-positive rate because
//     it has operator-confirmed ground truth for legitimate origin ASNs.
//     SHYEN only has a heuristic ASN/prefix reference table, not ground
//     truth — so it also raises the confidence bar (MIN_CONFIDENCE_TO_INCIDENT)
//     as a second, compensating filter for that weaker ownership signal.
const PER_PREFIX_COOLDOWN        = 10000   // 10s per unique prefix/origin pair (fast churn)
const MIN_CONFIDENCE_TO_INCIDENT = 85      // raised from 70 — compensates for heuristic (non-ground-truth) ownership matching
const VANTAGE_CORROBORATION_REQUIRED = 2   // ARTEMIS: >=2 INDEPENDENT vantage points, not just 2 messages from the same collector

// NOTE: There is intentionally no global "max N incidents per hour" cap here.
// Every incident that reaches enrichAndAdd() has already cleared the real
// filters above (>=2 independent vantage points, confidence >= 85, per-prefix
// cooldown) — at that point it's a confirmed real detection, and silently
// dropping confirmed real detections just because a lot of them happened
// in the same hour would mean Live Mode stops showing real incidents
// during exactly the moment it matters most (a genuine BGP storm).
// The incident list itself is still bounded (MAX_INCIDENTS in the store)
// purely to cap memory/render cost, not to hide real detections.

const prefixCooldowns    = new Map() // key -> last incident timestamp

const activeIncidentKeys = new Map() // `${prefix}|${originAS}` -> incidentId
const anomalyVantagePoints = new Map() // `${prefix}|${originAS}` -> Set of distinct vantage points that have seen it
const recentTickerTexts  = new Map() // ticker text -> last-shown timestamp
const TICKER_DEDUPE_MS   = 45000

async function enrichAndAdd(incident) {
  // Always pull fresh store state — never rely on a passed-in object that may be stale
  const store                      = useSHYENStore.getState()

  // ── Interruption Handling — pause gate ──────────────────────────────────
  // Single choke point for BOTH the live RIS feed and demo mode (see the
  // comment on the demo session runner below). When the session is paused,
  // no new incident is created, no AI decision runs, no countermeasures
  // are generated — the pipeline is genuinely frozen, not just visually
  // hidden. The RIS socket and system clock keep running elsewhere so the
  // UI doesn't look broken while paused.
  if (store.isPaused) return null

  const addIncident                = store.addIncident
  const markAIDecided              = store.markAIDecided
  const markAIAnalyzing            = store.markAIAnalyzing
  const setIncidentRPKI            = store.setIncidentRPKI
  const setIncidentAttackerCountry = store.setIncidentAttackerCountry
  const addActivityLog             = store.addActivityLog
  const setIncidentVictim          = store.setIncidentVictim
  const setIncidentConfidence      = store.setIncidentConfidence

  const memory  = recordAttack(incident)
  const enriched = {
    ...incident,
    severity:             escalateSeverity(incident.severity, memory.isRepeat),
    isRepeatAttacker:     memory.isRepeat,
    repeatCount:          memory.attackCount,
    deterministicSummary: buildDeterministicSummary(incident),
  }

  // Add incident as ACTIVE — appears on dashboard immediately
  addIncident(enriched)

  // ── COUNTERMEASURE GENERATION — runs for BOTH real and simulated incidents.
  // This is the real, autonomous part: the moment an incident is confirmed,
  // SHYEN generates the exact RFC-format artifacts (RPKI ROA, RTBH, Flowspec)
  // a NOC engineer would deploy. For a REAL incident these are genuinely
  // ready to copy and hand to a human operator. For a SIMULATED (demo)
  // incident, the same generator runs against the fake attack, so the demo
  // showcases the actual capability instead of a disconnected fake button.
  const countermeasures = generateCountermeasures(enriched)
  useSHYENStore.setState(s => ({
    incidents: s.incidents.map(i => i.id === enriched.id
      ? { ...i, countermeasures, countermeasuresReady: true }
      : i),
    activityLog: [...s.activityLog, {
      id: Date.now(), level: 'SUCCESS',
      message: enriched.isSimulated
        ? `[DEMO] COUNTERMEASURES GENERATED (RPKI ROA + RTBH + Flowspec) · ${enriched.victim?.name}`
        : `COUNTERMEASURES GENERATED (RPKI ROA + RTBH + Flowspec) · ${enriched.victim?.name} · pending NOC authorization`,
      incidentId: enriched.id,
      timestamp: new Date().toISOString(),
    }].slice(-80),
  }))

  if (enriched.isSimulated) {
    // ── DEMO-ONLY — after a realistic delay, also flip to the theatrical
    // "MITIGATED" completion badge so the demo has a satisfying payoff.
    // This never runs for real incidents; SHYEN cannot claim real mitigation.
    const delay = getMitigationDelay(enriched.severity, enriched.isRepeatAttacker)
    setTimeout(() => {
      const freshStore = useSHYENStore.getState()
      const current    = freshStore.incidents.find(i => i.id === enriched.id)
      if (!current || current.status === 'MITIGATED') return
      const { updated, actions } = executeDeterministicMitigation(current)
      useSHYENStore.setState(s => ({
        incidents: s.incidents.map(i => i.id === enriched.id ? updated : i),
        activityLog: [...s.activityLog, {
          id: Date.now(), level: 'SUCCESS',
          message: `[DEMO] SIMULATED MITIGATION [${actions.map(a => a.label).join(' + ')}] · ${enriched.victim?.name} · TTM ${(delay / 1000).toFixed(1)}s`,
          incidentId: enriched.id,
          timestamp: new Date().toISOString(),
        }].slice(-80),
      }))
    }, delay)
  }

  // ── RPKI check — skip for simulated or unknown ASNs ──────────────────────
  if (!enriched.isSimulated && enriched.victim?.asn && !enriched.victim.asn.includes('UNKNOWN') && !enriched.victim?.isUnknown) {
    preCheckRPKI(enriched).then(rpki => {
      if (!rpki) return
      // Use fresh store ref — enriched.id is stable, store refs may have changed
      useSHYENStore.getState().setIncidentRPKI(enriched.id, rpki)
      const label = rpki.valid ? 'RPKI VALID' : rpki.invalid ? 'RPKI INVALID — vulnerable' : 'RPKI UNKNOWN'
      useSHYENStore.getState().addActivityLog?.(rpki.valid ? 'SUCCESS' : 'INFO', `RPKI check (${enriched.prefix}): ${label}`, enriched.id)

      const rpkiState   = rpki.invalid ? 'invalid' : rpki.valid ? 'valid' : 'not-found'
      const vantageBonus = Math.min((enriched.confirmedPoints?.length ?? 1) - 1, 4) * 5
      const signals = {
        pathAnomaly:           enriched.pathAnomaly,
        prependCount:          enriched.prependCount ?? 0,
        isExpectedOrigin:      enriched.victim?.asn === enriched.attacker?.asn,
        prefix:                enriched.prefix,
        matchedASN:            enriched.victim,
        hasSuspiciousCommunity: enriched.hasSuspiciousCommunity ?? false,
        hasBlackholeComm:      enriched.hasBlackholeComm ?? false,
      }
      const { total: baseScore, factors } = scoreConfidenceBreakdown(signals, rpkiState)
      const breakdown = vantageBonus > 0
        ? [...factors, { label: `${enriched.confirmedPoints?.length ?? 1} vantage points confirmed`, points: vantageBonus }]
        : factors
      const updatedConf = Math.min(99, Math.round(baseScore + vantageBonus))
      if (updatedConf !== enriched.confidence) {
        useSHYENStore.getState().setIncidentConfidence?.(enriched.id, updatedConf, breakdown)
        useSHYENStore.getState().addActivityLog?.('INFO', `Confidence updated: ${enriched.confidence}% → ${updatedConf}% (RPKI ${rpkiState})`, enriched.id)
      }
    })
  }

  // ── BGP + Certificate Transparency correlation ────────────────────────────
  // Real attack pattern: hijack a bank/gov prefix AND get a fraudulent TLS
  // cert issued for the same domain around the same time (2018 MyEtherWallet,
  // 2022 KLAYswap). Only runs for real incidents whose victim ASN has a known
  // domain mapped (Financial/Government sector orgs); fires async, never
  // blocks the main detection flow.
  if (!enriched.isSimulated) {
    checkCoordinatedAttack(enriched).then(match => {
      if (!match) return
      useSHYENStore.setState(s => ({
        incidents: s.incidents.map(i => i.id === enriched.id
          ? { ...i, coordinatedAttack: match, severity: 'CRITICAL' }
          : i),
        activityLog: [...s.activityLog, {
          id: Date.now(), level: 'CRITICAL',
          message: `⚠ COORDINATED ATTACK — BGP hijack + suspicious TLS cert on ${match.domain} (issued by "${match.certIssuer}", ${Math.round(match.windowMs / 60000)}min from hijack) · ${enriched.victim?.name}`,
          incidentId: enriched.id,
          timestamp: new Date().toISOString(),
        }].slice(-80),
      }))
    })
  }

  // ── Resolve attacker country ──────────────────────────────────────────────
  if (!enriched.isSimulated && enriched.attacker?.country === '??') {
    lookupASCountry(enriched.attacker.asn).then(result => {
      if (result?.country && result.country !== 'XX') {
        useSHYENStore.getState().setIncidentAttackerCountry(enriched.id, result.country)
        useSHYENStore.getState().addActivityLog?.('INFO', `Resolved attacker origin: ${enriched.attacker.asn} → ${result.country}`, enriched.id)
      }
    })
  }

  // ── Resolve victim ASN when unknown ──────────────────────────────────────
  if (!enriched.isSimulated && enriched.victim?.isUnknown && enriched.prefix) {
    resolveRealASN(enriched.prefix).then(result => {
      if (result) {
        const resolvedVictim = {
          ...enriched.victim,
          asn:       result.asn,
          name:      result.holder || enriched.victim.name,
          isUnknown: false,
        }
        useSHYENStore.getState().setIncidentVictim?.(enriched.id, resolvedVictim)
        useSHYENStore.getState().addActivityLog?.('INFO', `Resolved victim: ${enriched.prefix} → ${result.asn} (${result.holder})`, enriched.id)
      }
    })
  }

  // ── Autonomous AI — skip for simulated incidents (Llama runs on Hexagon NPU) ─
  if (!enriched.isSimulated) {
    getDecision(enriched, () => useSHYENStore.getState().markAIAnalyzing(enriched.id))
      .then(d => { if (d) useSHYENStore.getState().markAIDecided(enriched.id, d) })
  }

  return enriched.id
}

function detectAttackType(entry) {
  if (entry.pathAnomaly === 'PATH_TOO_SHORT') return 'ORIGIN_HIJACK'
  if (entry.pathAnomaly === 'PATH_TOO_LONG')  return 'PATH_MANIPULATION'
  const prefixBits   = parseInt(entry.prefix?.split('/')[1] ?? '0')
  const expectedBits = parseInt(entry.matchedASN?.prefixes?.[0]?.split('/')[1] ?? '0')
  if (prefixBits > expectedBits + 4) return 'SUBPREFIX_HIJACK'
  return 'ORIGIN_HIJACK'
}

function RecoveryBanner() {
  const recoveredSession         = useSHYENStore(s => s.recoveredSession)
  const recoveredAt              = useSHYENStore(s => s.recoveredAt)
  const recoveredUnfinishedCount = useSHYENStore(s => s.recoveredUnfinishedCount)
  const isPaused                 = useSHYENStore(s => s.isPaused)
  const incidentCount            = useSHYENStore(s => s.incidents.length)
  const dismissRecoveryBanner    = useSHYENStore(s => s.dismissRecoveryBanner)

  if (!recoveredSession) return null

  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10, padding:'8px 20px',
      background:'rgba(255,214,10,0.06)', borderBottom:'1px solid rgba(255,214,10,0.25)',
      fontFamily:'var(--font-mono)', fontSize:10, color:'#ffd60a', flexShrink:0, zIndex:9,
    }}>
      <span>⟳</span>
      <span>
        Session recovered from persisted storage — {incidentCount} incident{incidentCount === 1 ? '' : 's'} restored
        {recoveredUnfinishedCount > 0 && <>, {recoveredUnfinishedCount} still unmitigated</>}
        {isPaused && <> · session was paused, still paused</>}
        {recoveredAt && <> · recovered {new Date(recoveredAt).toISOString().slice(11,19)} UTC</>}
      </span>
      <button onClick={dismissRecoveryBanner} style={{
        marginLeft:'auto', background:'none', border:'none', color:'#ffd60a', cursor:'pointer',
        fontFamily:'var(--font-mono)', fontSize:10, opacity:0.7,
      }}>✕ DISMISS</button>
    </div>
  )
}

export default function App() {
  // Selective store subscriptions — do NOT subscribe to full store here.
  // `useSHYENStore()` (no selector) re-renders App on EVERY store mutation,
  // including setSystemTime which fires every 1s. That causes selectedIncident
  // to be recomputed and passed as a new object to DetailPanel every second,
  // massively increasing the chance of hitting transient render errors that black the panel.
  const incidents           = useSHYENStore(s => s.incidents)
  const appMode             = useSHYENStore(s => s.appMode)
  const selectedIncidentId  = useSHYENStore(s => s.selectedIncidentId)
  const selectIncident      = useSHYENStore(s => s.selectIncident)
  const addTickerEntry      = useSHYENStore(s => s.addTickerEntry)
  const setSystemTime       = useSHYENStore(s => s.setSystemTime)
  const setRisStatus        = useSHYENStore(s => s.setRisStatus)
  const setRisError         = useSHYENStore(s => s.setRisError)
  const incrementRisStats   = useSHYENStore(s => s.incrementRisStats)
  const markAIDecided       = useSHYENStore(s => s.markAIDecided)
  const markAIAnalyzing     = useSHYENStore(s => s.markAIAnalyzing)
  const setIncidentRPKI     = useSHYENStore(s => s.setIncidentRPKI)
  const setIncidentAttackerCountry = useSHYENStore(s => s.setIncidentAttackerCountry)
  const addActivityLog      = useSHYENStore(s => s.addActivityLog)
  const addVantageConfirmation = useSHYENStore(s => s.addVantageConfirmation)
  const setAPNICLoaded      = useSHYENStore(s => s.setAPNICLoaded)
  const addIncident         = useSHYENStore(s => s.addIncident)

  // NOTE: enrichAndAdd and RIS callbacks call useSHYENStore.getState() directly
  // to always get fresh state — no stale closure risk.

  const [showBreach,      setShowBreach]      = useState(false)
  // If a switch to Live Mode happens while the Breach Simulator panel is
  // open, force it closed rather than letting it linger as a live path to
  // inject simulated data.
  useEffect(() => {
    if (appMode !== 'demo' && showBreach) setShowBreach(false)
  }, [appMode, showBreach])
  const [apnicReady,      setApnicReady]       = useState(false)
  const [selectedCountry, setSelectedCountry]  = useState(null)
  const [historyCountry,  setHistoryCountry]   = useState(null)
  const [view3D,          setView3D]           = useState(true) // 2D/3D map toggle
  const [centerTab,       setCenterTab]        = useState('map') // 'map' | 'graph'

  const selectedIncident = incidents.find(i => i.id === selectedIncidentId) ?? null
  const filteredIncidents = selectedCountry
    ? incidents.filter(i => i.attacker?.country === selectedCountry)
    : incidents

  // Live browser tab title — was written but never called; genuinely useful
  // when a judge/user tabs away mid-demo and needs to know at a glance.
  usePageTitle(incidents.filter(i => i.status === 'DETECTED').length)

  useEffect(() => {
    if (!selectedIncidentId && incidents.length > 0) selectIncident(incidents[0].id)
  }, [incidents.length])

  // Garbage-collect activeIncidentKeys once their incident is mitigated,
  // so a repeat attack on the same prefix/origin can open a fresh incident
  // (rather than only ever growing the vantage matrix on the old one).
  useEffect(() => {
    for (const [key, id] of activeIncidentKeys.entries()) {
      const inc = incidents.find(i => i.id === id)
      if (!inc || inc.status === 'MITIGATED') {
        activeIncidentKeys.delete(key)
      }
    }
  }, [incidents])

  useEffect(() => {
    loadAPNICData().then(() => {
      const { prefixCount } = getAPNICStatus()
      setAPNICLoaded(prefixCount)
      setApnicReady(true)
    })
    // Pre-warm AS country cache so demo lookups feel instant
    prewarmASCache()
  }, [])

  useEffect(() => {
    // Demo Mode never opens a real network connection — see the demo
    // session effect below instead. This is the core of the zero-live-
    // dependency guarantee: no wss:// connection attempt at all in demo mode.
    if (!apnicReady || appMode !== 'live') return
    useSHYENStore.getState().clearIncidents() // clean slate — no leftover demo incidents in live view
    const ris = new RIPERISConnection({
      onStatusChange: setRisStatus,
      onError: msg => { setRisError(msg); console.warn('[HexaSentinel RIS]', msg) },
      onEntry: entry => {
        // Always use fresh store state — avoids stale closure from React hook snapshot
        const store = useSHYENStore.getState()
        const { addTickerEntry, incrementRisStats, incrementRisIndianCount, addVantageConfirmation, selectIncident } = store
        // Ticker dedupe — don't spam identical "ANOMALY: ..." lines every few seconds
        const lastShown = recentTickerTexts.get(entry.text)
        const now = Date.now()
        const isDuplicateTicker = lastShown && (now - lastShown < TICKER_DEDUPE_MS)
        if (!isDuplicateTicker) {
          recentTickerTexts.set(entry.text, now)
          addTickerEntry({ text: entry.text, suspicious: entry.isSuspicious, timestamp: entry.timestamp, realData: true })
        }
        incrementRisStats()
        if (!entry.isSuspicious || !entry.matchedASN) return
        incrementRisIndianCount()

        const key = `${entry.prefix}|${entry.originAS}`

        // If this prefix/origin combo already has an active incident,
        // treat this as ANOTHER real RIS collector confirming it —
        // grow the vantage matrix instead of spamming new incidents.
        if (activeIncidentKeys.has(key)) {
          addVantageConfirmation(activeIncidentKeys.get(key), hostToVantage(entry.host))
          return
        }

        // ARTEMIS-style corroboration: require the anomaly to be seen by
        // >=2 DISTINCT vantage points, not just 2 messages from the same
        // collector (a single collector re-announcing/session-resetting
        // is not independent confirmation).
        const vantage = hostToVantage(entry.host)
        const seenFrom = anomalyVantagePoints.get(key) ?? new Set()
        seenFrom.add(vantage)
        anomalyVantagePoints.set(key, seenFrom)
        if (seenFrom.size < VANTAGE_CORROBORATION_REQUIRED) return

        // Minimum confidence gate — skip low-signal events that aren't worth an incident
        const rawConf = Math.min(99, entry.rawConfidence ?? 0)
        if (rawConf < MIN_CONFIDENCE_TO_INCIDENT) return

        // Per-prefix rate limit — different prefixes can still create incidents
        // simultaneously; this only stops the SAME prefix/origin from re-firing
        // within the cooldown window (flapping protection, not a volume cap).
        const lastForPrefix = prefixCooldowns.get(key) ?? 0
        if (now - lastForPrefix < PER_PREFIX_COOLDOWN) return

        prefixCooldowns.set(key, now)

        // FIX: Deterministic attack type from real BGP data, not random
        // ORIGIN_HIJACK: different AS announces our prefix
        // SUBPREFIX_HIJACK: more specific prefix announced (hijackers win routing)
        // ROUTE_LEAK: unexpected origin but not clearly hijack (multi-homed case)
        // PATH_MANIPULATION: abnormal AS path length
        const type = detectAttackType(entry)

        const newId = ++incidentIdCounter
        activeIncidentKeys.set(key, newId)

        enrichAndAdd({
          id: newId, type,
          severity: getSeverity(type, entry.matchedASN.sector),
          victim: entry.matchedASN,
          attacker: { asn: entry.originAS, name: entry.originAS, country: '??' },
          prefix: entry.prefix,
          confirmedPoints: [hostToVantage(entry.host)],
          timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : entry.timestamp,
          status: 'DETECTED',
          rpkiPushed: false, ixpAlerted: false, forensicsReady: false,
          affectedIPs: (() => {
            // FIX: Calculate real IP count from prefix size
            const bits = parseInt(entry.prefix?.split('/')[1] ?? '24')
            return Math.pow(2, 32 - bits) // e.g. /24 = 256, /16 = 65536
          })(),
          // Real confidence from BGP signals (rawConfidence set in ripeRIS.js parser)
          confidence: Math.min(99, entry.rawConfidence ?? 55),
          isRealData: true, isSimulated: false,
          pathAnomaly: entry.pathAnomaly ?? null,
        })
      },
      onWithdrawal: entry => {
        const s = useSHYENStore.getState()
        s.addTickerEntry({ text: entry.text, suspicious: false, timestamp: entry.timestamp, realData: true, isWithdrawal: true })
        s.incrementRisStats()
      },
    })
    ris.connect()
    return () => ris.disconnect()
  }, [apnicReady, appMode])

  useEffect(() => {
    const t = setInterval(() => setSystemTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // ── Checkpoint markers — Interruption Handling ──────────────────────────
  // A periodic, comparable snapshot of aggregate session state, independent
  // of individual action/AI-decision entries. Runs whether paused or not —
  // a checkpoint taken while paused legitimately shows "nothing changed,"
  // which is itself evidence the pause held. Interval kept coarse (2 min)
  // so the log stays meaningful rather than noisy.
  useEffect(() => {
    const CHECKPOINT_INTERVAL_MS = 120000
    const t = setInterval(() => useSHYENStore.getState().recordCheckpoint('interval'), CHECKPOINT_INTERVAL_MS)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    // Breach Simulator must be unreachable in Live Mode — read appMode fresh
    // from the store (not a closure var) so this listener doesn't need to be
    // torn down/re-added on every mode switch.
    const fn = e => {
      if ((e.key==='b'||e.key==='B') && e.target.tagName!=='INPUT' && useSHYENStore.getState().appMode === 'demo') {
        setShowBreach(true)
      }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])


  // ── HexaSentinel on-device threat stream ──────────────────────────────────────
  // Receives live threat events from the Python backend:
  // scapy → ONNX (Hexagon NPU) → Llama 3.2 3B (Hexagon NPU) → FastAPI WebSocket
  // type: 'threat' | 'heartbeat'
  useEffect(() => {
    const conn = connectThreatStream(
      (event) => {
        const score = event.score ?? 0
        if (score >= 0.85 && event.type !== 'pong') {
          const store  = useSHYENStore.getState()
          const level  = score >= 0.92 ? 'CRITICAL' : 'WARNING'
          const report = event.report ?? ''
          // Append to OperationalTimeline
          store.addActivityLog?.(level,
            `[HexaSentinel NPU] S=${score.toFixed(3)} · ${report.split('\n')[0]?.slice(0, 80)}…`
          )
        }
      },
      (status) => console.log('[HexaSentinel WS]', status)
    )
    // Check backend health on mount so we can surface a warning if offline
    checkHealth().then(h => {
      if (!h) console.warn('[HexaSentinel] Backend not reachable — start the Python server')
    })
    return () => conn.close()
  }, [])

  // ── DEMO MODE SESSION RUNNER ────────────────────────────────────────────
  // Feeds the pre-scripted DEMO_INCIDENTS through the exact same
  // enrichAndAdd() pipeline real incidents use — same countermeasure
  // generation, same severity/repeat-attacker logic, same everything —
  // just sourced from src/data/demoScript.js instead of a live WebSocket.
  // Zero network calls happen in this effect.
  useEffect(() => {
    if (appMode !== 'demo') return
    useSHYENStore.getState().clearIncidents()
    useSHYENStore.getState().setRisStatus('connected') // demo mode shows as "connected" — it's not lying, it's simulating a healthy session

    let cancelled = false
    let i = 0

    function playNext() {
      if (cancelled || i >= DEMO_INCIDENTS.length) return
      // Defer without advancing — a paused demo picks up at the same
      // script index once resumed, rather than silently dropping
      // incidents while paused.
      if (useSHYENStore.getState().isPaused) {
        setTimeout(playNext, 1000)
        return
      }
      const script = DEMO_INCIDENTS[i]
      const inc = {
        ...script,
        id: ++incidentIdCounter,
        timestamp: new Date().toISOString(),
        isRealData: false,
        isSimulated: true,
        isDemoSession: true,
        status: 'DETECTED',
        rpkiPushed: false, ixpAlerted: false, forensicsReady: false,
      }
      enrichAndAdd(inc)
      if (i === 0) setTimeout(() => selectIncident(inc.id), 150)
      i++
      if (i < DEMO_INCIDENTS.length) setTimeout(playNext, DEMO_INCIDENT_INTERVAL_MS)
    }

    const startTimer = setTimeout(playNext, 800)
    return () => { cancelled = true; clearTimeout(startTimer) }
  }, [appMode])

  function onBreachIncident(inc) {
    // Defense-in-depth: even if the Breach Simulator UI is somehow reached
    // while not in Demo Mode (e.g. a stale panel left open across a mode
    // switch), refuse to inject the fabricated incident into the shared
    // store that Live Mode's feed/map/stats read from.
    if (useSHYENStore.getState().appMode !== 'demo') {
      console.warn('[HexaSentinel] Blocked: Breach Simulator output rejected — appMode is not demo')
      return
    }
    const sim = { ...inc, id: ++incidentIdCounter, isRealData:false, isSimulated:true, status:'DETECTED', rpkiPushed:false, ixpAlerted:false, forensicsReady:false }
    enrichAndAdd(sim)
    setTimeout(() => selectIncident(sim.id), 100)
  }

  return (
    <div style={{
      height:'100vh', display:'flex', flexDirection:'column',
      position:'relative', overflow:'hidden',
      background:`radial-gradient(ellipse at 20% 50%, rgba(0,255,136,0.04) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(255,45,85,0.05) 0%, transparent 50%), #060a0f`,
    }}>
      <div style={{ position:'fixed', inset:0, opacity:0.05, pointerEvents:'none', zIndex:0,
        backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='%2300ff88' stroke-width='0.5'/%3E%3C/svg%3E")`,
      }} />

      <TopNav onBreachClick={() => setShowBreach(true)} />
      <RecoveryBanner />
      <BGPTicker />
      <StatsBar />
      <WhatHappened />

      <main style={{ flex:1, display:'grid', gridTemplateColumns:'330px 1fr 360px', overflow:'hidden', position:'relative', zIndex:5 }}>

        {/* LEFT — Incident list + heatmap */}
        <div style={{ borderRight:'1px solid var(--border-subtle)', overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <div style={{ flex:'1 1 60%', minHeight:0, borderBottom:'1px solid var(--border-subtle)', overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'10px 10px 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:700 }}>LIVE THREAT FEED</div>
              {selectedCountry && (
                <button onClick={() => setSelectedCountry(null)} style={{
                  fontFamily:'var(--font-mono)', fontSize:8, color:'var(--accent-red)',
                  background:'rgba(255,45,85,0.08)', border:'1px solid rgba(255,45,85,0.25)',
                  borderRadius:3, padding:'2px 8px', cursor:'pointer', letterSpacing:1,
                }}>
                  {selectedCountry} ✕
                </button>
              )}
            </div>
            <IncidentList filteredIncidents={filteredIncidents} />
          </div>
          <div style={{ flex:'0 0 auto', overflowY:'auto', display:'flex', flexDirection:'column' }}>
            <div style={{ maxHeight:'30%', overflowY:'auto' }}><AttackHeatmap /></div>
            <div style={{ flexShrink:0, borderTop:'1px solid var(--border-subtle)' }}>
              <HexaSentinelPanel compact={true} />
            </div>
          </div>
        </div>

        {/* CENTER — Map/Globe + ASN health + timeline */}
        <div style={{ overflowY:'auto', borderRight:'1px solid var(--border-subtle)', display:'flex', flexDirection:'column' }}>
          <div style={{ padding:12 }}>
            <div style={{ background: 'rgba(6,10,15,0.9)', border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden' }}>

              {/* Header with 2D/3D toggle */}
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700 }}>
                    {view3D ? 'GLOBAL BGP THREAT GLOBE' : 'GLOBAL BGP THREAT MAP'}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', marginTop: 2 }}>
                    {view3D ? 'Drag to rotate · click a marker for recent attacks & full history' : 'Live attack visualization · click a node to filter incidents'}
                  </div>
                </div>
                <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                  {[
                    { key: true,  label: '🌐 3D' },
                    { key: false, label: '🗺 2D' },
                  ].map(opt => (
                    <button key={String(opt.key)} onClick={() => setView3D(opt.key)} style={{
                      fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, letterSpacing:'0.05em',
                      padding:'4px 10px', borderRadius:3, cursor:'pointer',
                      background: view3D === opt.key ? 'var(--accent-green)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${view3D === opt.key ? 'var(--accent-green)' : 'var(--border-subtle)'}`,
                      color: view3D === opt.key ? '#000' : 'var(--text-muted)',
                      transition:'all 0.15s',
                    }}>{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* Map / Globe body */}
              {view3D
                ? <Suspense fallback={<PanelFallback />}><Globe3D onViewHistory={setHistoryCountry} onCountryClick={setSelectedCountry} /></Suspense>
                : (
                  <>
                    {/* ── BGP Map / Network Graph tab bar ── */}
                    <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--border-subtle)', flexShrink:0 }}>
                      {[['map','🗺 BGP MAP'],['graph','📡 NETWORK GRAPH']].map(([id,label]) => (
                        <button key={id} onClick={() => setCenterTab(id)}
                          style={{ fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, letterSpacing:'0.07em',
                            padding:'7px 18px', background:'transparent', border:'none', cursor:'pointer',
                            color: centerTab === id ? 'var(--accent-green,#10B981)' : 'var(--text-muted)',
                            borderBottom: centerTab === id ? '2px solid var(--accent-green,#10B981)' : '2px solid transparent',
                            transition:'all 0.15s' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {centerTab === 'graph' && <NetworkGraph height={380} />}
                    {centerTab === 'map'   && <ThreatMap onCountryClick={setSelectedCountry} selectedCountry={selectedCountry} />}
                  </>
                )}

              {view3D && <GlobeStats incidents={incidents} />}
            </div>
          </div>
          <div style={{ borderTop:'1px solid var(--border-subtle)' }}>
            <ASNHealthGrid />
          </div>
          <OperationalTimeline />
        </div>

        {/* RIGHT — AI SOC Analyst detail panel */}
        <div style={{ overflowY:'auto', padding:16, background:'rgba(6,10,15,0.9)' }}>
          <PanelErrorBoundary incidentId={selectedIncidentId}>
            {selectedIncident
              ? <DetailPanel incident={selectedIncident} />
              : (
                <>
                  <EmptyState apnicReady={apnicReady} />
                  <div style={{ marginTop:12, border:'1px solid var(--border-subtle)', borderRadius:6, overflow:'hidden', height:420 }}>
                    <div style={{ padding:'8px 12px', borderBottom:'1px solid var(--border-subtle)', fontFamily:'var(--font-display)', fontSize:11, fontWeight:700 }}>ON-DEVICE NPU MONITOR</div>
                    <HexaSentinelPanel />
                  </div>
                </>
              )
            }
          </PanelErrorBoundary>
        </div>
      </main>

      <Footer />
      <AINotification />
      {showBreach && <Suspense fallback={<PanelFallback />}><BreachSimulator onClose={() => setShowBreach(false)} onIncidentGenerated={onBreachIncident} /></Suspense>}
      {historyCountry && (
        <Suspense fallback={<PanelFallback />}><CountryHistoryPage countryCode={historyCountry} onBack={() => setHistoryCountry(null)} /></Suspense>
      )}
    </div>
  )
}

// Stats strip below the globe — mirrors the 2D map's footer stats
function GlobeStats({ incidents }) {
  const SEV_ORDER = SEVERITY_ORDER
  const attackMap = new Map()
  let unresolved = 0
  let totalActive = 0
  for (const inc of incidents) {
    if (inc.status === 'MITIGATED') continue
    totalActive++
    const c = inc.attacker?.country
    if (!c || c === '??') { unresolved++; continue }
    const ex = attackMap.get(c)
    if (!ex || SEV_ORDER.indexOf(inc.severity) < SEV_ORDER.indexOf(ex.severity)) attackMap.set(c, inc)
  }
  const attacks = Array.from(attackMap.entries())
  const avgConf = attacks.length ? Math.round(attacks.reduce((s,[,a]) => s + a.confidence, 0) / attacks.length) : 0

  return (
    <>
      <div style={{ display:'flex', borderTop:'1px solid var(--border-subtle)' }}>
        {[
          ['Attack Origins', attacks.length],
          ['Active Attacks', totalActive],
          ['Avg Confidence', attacks.length ? `${avgConf}%` : '—'],
        ].map(([label, value]) => (
          <div key={label} style={{ flex:1, padding:'8px 0', textAlign:'center', borderRight:'1px solid var(--border-subtle)' }}>
            <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:800, color:'var(--text-primary)' }}>{value}</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', letterSpacing:1 }}>{label}</div>
          </div>
        ))}
      </div>
      {unresolved > 0 && (
        <div style={{ padding:'5px 16px', borderTop:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:5, height:5, borderRadius:'50%', background:'#ffd60a', animation:'termBlink 1.2s ease infinite' }} />
          <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>
            Resolving origin for {unresolved} incident{unresolved > 1 ? 's' : ''} via RIPE STAT...
          </span>
        </div>
      )}
    </>
  )
}

function EmptyState({ apnicReady }) {
  const appMode = useSHYENStore(s => s.appMode)
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:16 }}>
      <div style={{ width:48, height:48, border:'1px solid rgba(0,255,136,0.15)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background: apnicReady ? 'var(--accent-green)' : '#ffd60a', animation:'pulse 2s ease infinite', boxShadow:`0 0 8px ${apnicReady ? 'var(--accent-green)' : '#ffd60a'}` }} />
      </div>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-muted)', letterSpacing:2, marginBottom:6 }}>
          {apnicReady ? 'MONITORING LIVE BGP FEED' : 'LOADING PREFIX DATABASE...'}
        </div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'#222', letterSpacing:1, lineHeight:1.8 }}>
          {!apnicReady
            ? 'Fetching APNIC delegation file...'
            : appMode === 'demo'
              ? <>Select an incident · Press <span style={{color:'#ff2d55'}}>B</span> to simulate</>
              : 'Select an incident'}
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  )
}
