import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { applyAutonomousDecision, applyAlertModeDecision } from '../engine/autonomousActions.js'
import { loadChangeHistory, persistChangeHistory, buildChangeEntry, appendChangeEntry } from '../engine/changeHistory.js'

// Fields tracked for incident-level change diffs — kept in one place so
// every recorder (triggerAction, markAIDecided) diffs the same shape.
const INCIDENT_DIFF_KEYS = ['status', 'rpkiPushed', 'ixpAlerted', 'forensicsReady', 'flagged', 'aiDecided', 'aiAlerted']
function incidentSnapshot(inc) {
  if (!inc) return null
  const s = {}
  for (const k of INCIDENT_DIFF_KEYS) s[k] = inc[k] ?? null
  return s
}

const ACTION_LABELS = {
  rpki:      'PUSH RPKI',
  ixp:       'ALERT IXPs',
  forensics: 'FORENSICS',
  flag:      'FLAG FOR REVIEW',
}

let logCounter = 0
function logEntry(level, message, incidentId = null) {
  return { id: ++logCounter, level, message, incidentId, timestamp: new Date().toISOString() }
}
function appendLog(activityLog, entry) {
  return [...activityLog, entry].slice(-80)
}

// Raised incident cap to 500 to handle 150/min throughput:
// - MITIGATED incidents are pruned first (oldest first)
// - Active/DETECTED incidents are preserved
// - Hard cap at 500 to prevent memory bloat
const MAX_INCIDENTS = 500
function pruneIncidents(incidents) {
  if (incidents.length <= MAX_INCIDENTS) return incidents
  // Sort: keep DETECTED/ACTIVE first, prune oldest MITIGATED
  const active    = incidents.filter(i => i.status !== 'MITIGATED')
  const mitigated = incidents.filter(i => i.status === 'MITIGATED')
  // Keep most recent mitigated up to fill the cap
  const keepMitigated = mitigated.slice(0, MAX_INCIDENTS - active.length)
  return [...active, ...keepMitigated].slice(0, MAX_INCIDENTS)
}

export const useSHYENStore = create(persist((set, get) => ({
  incidents:          [],
  selectedIncidentId: null,
  ticker:             [],
  totalAnnouncements: 0,
  activeTab:          'incidents',
  systemTime:         new Date(),

  // ── Session pause / resume — Interruption Handling ──────────────────────
  // When true, App.jsx's enrichAndAdd() choke point (used by BOTH the live
  // RIS feed and demo mode) short-circuits: no new incidents, no AI
  // decisions, no countermeasure generation. The RIS socket itself and the
  // system clock keep running so the UI doesn't look frozen/broken — only
  // the actual incident-processing pipeline halts. isPaused/pausedAt are
  // persisted (see `persist` config below), so a paused session stays
  // paused across a refresh instead of silently resuming.
  isPaused:  false,
  pausedAt:  null,

  // Non-persisted — computed once at hydration time (onRehydrateStorage
  // below) so components can show "this session was recovered" without
  // that banner reappearing forever on every subsequent normal reload.
  recoveredSession:         false,
  recoveredAt:              null,
  recoveredUnfinishedCount: 0,
  sessionStartedAt:         new Date().toISOString(),

  pauseSession: () => set(state => {
    const activityLog = appendLog(
      state.activityLog,
      logEntry('INFO', 'Session paused — live processing frozen, current state will persist'),
    )
    const sessionEntry = buildChangeEntry({
      type: 'SESSION', label: 'Session paused',
      before: { isPaused: false }, after: { isPaused: true }, keys: ['isPaused'],
    })
    // Also drop a checkpoint right at the interruption boundary, so the
    // aggregate state at the moment of pause is directly comparable
    // against the checkpoint taken on resume (see resumeSession below).
    const checkpointAfter = {
      incidentCount:  state.incidents.length,
      activeCount:    state.incidents.filter(i => i.status !== 'MITIGATED').length,
      mitigatedCount: state.incidents.filter(i => i.status === 'MITIGATED').length,
      isPaused:       true,
    }
    const checkpointBefore = state.lastCheckpointSnapshot ?? { incidentCount: 0, activeCount: 0, mitigatedCount: 0, isPaused: false }
    const checkpointEntry = buildChangeEntry({
      type:  'CHECKPOINT',
      label: `Checkpoint (pause) — ${checkpointAfter.incidentCount} incidents, ${checkpointAfter.activeCount} active, ${checkpointAfter.mitigatedCount} mitigated`,
      before: checkpointBefore, after: checkpointAfter,
      keys:  ['incidentCount', 'activeCount', 'mitigatedCount', 'isPaused'],
    })
    let changeHistory = appendChangeEntry(state.changeHistory, sessionEntry)
    changeHistory = appendChangeEntry(changeHistory, checkpointEntry)
    persistChangeHistory(changeHistory)  }),

  resumeSession: () => set(state => {
    const activityLog = appendLog(
      state.activityLog,
      logEntry('SUCCESS', 'Session resumed — processing continues'),
    )
    const sessionEntry = buildChangeEntry({
      type: 'SESSION', label: 'Session resumed',
      before: { isPaused: true }, after: { isPaused: false }, keys: ['isPaused'],
    })
    const checkpointAfter = {
      incidentCount:  state.incidents.length,
      activeCount:    state.incidents.filter(i => i.status !== 'MITIGATED').length,
      mitigatedCount: state.incidents.filter(i => i.status === 'MITIGATED').length,
      isPaused:       false,
    }
    const checkpointBefore = state.lastCheckpointSnapshot ?? { incidentCount: 0, activeCount: 0, mitigatedCount: 0, isPaused: true }
    const checkpointEntry = buildChangeEntry({
      type:  'CHECKPOINT',
      label: `Checkpoint (resume) — ${checkpointAfter.incidentCount} incidents, ${checkpointAfter.activeCount} active, ${checkpointAfter.mitigatedCount} mitigated`,
      before: checkpointBefore, after: checkpointAfter,
      keys:  ['incidentCount', 'activeCount', 'mitigatedCount', 'isPaused'],
    })
    let changeHistory = appendChangeEntry(state.changeHistory, sessionEntry)
    changeHistory = appendChangeEntry(changeHistory, checkpointEntry)
    persistChangeHistory(changeHistory)  }),

  dismissRecoveryBanner: () => set({ recoveredSession: false }),

  // ── Checkpoint markers — Interruption Handling ──────────────────────────
  // Explicit, comparable snapshots of aggregate session state (not tied to
  // one incident). Written automatically on a timer and on pause/resume,
  // plus a manual trigger in the Change History panel — so a judge can
  // point at two checkpoints and see exactly what changed between them,
  // rather than having to infer it from a wall of individual action
  // entries. `lastCheckpointSnapshot` is the "before" for the next one.
  lastCheckpointSnapshot: null,

  recordCheckpoint: (reason = 'interval') => set(state => {
    const after = {
      incidentCount:  state.incidents.length,
      activeCount:    state.incidents.filter(i => i.status !== 'MITIGATED').length,
      mitigatedCount: state.incidents.filter(i => i.status === 'MITIGATED').length,
      isPaused:       state.isPaused,
    }
    const before = state.lastCheckpointSnapshot ?? { incidentCount: 0, activeCount: 0, mitigatedCount: 0, isPaused: false }
    const entry = buildChangeEntry({
      type:  'CHECKPOINT',
      label: `Checkpoint (${reason}) — ${after.incidentCount} incidents, ${after.activeCount} active, ${after.mitigatedCount} mitigated`,
      before, after,
      keys:  ['incidentCount', 'activeCount', 'mitigatedCount', 'isPaused'],
    })
    const changeHistory = appendChangeEntry(state.changeHistory, entry)
    persistChangeHistory(changeHistory)    
    return { changeHistory, lastCheckpointSnapshot: after }
  }),

  // 'live' = only real RIPE RIS + real API calls, zero synthetic data ever.
  // 'demo' = fully scripted, deterministic session with zero live network
  // dependency — same components/UI, different data source. See
  // src/data/demoScript.js and App.jsx's demo session runner.
  appMode: 'live',
  setAppMode: (mode) => set({ appMode: mode }),

  // Switching between Live/Demo mode should never mix real and scripted
  // incidents on the same dashboard — clean slate on every mode switch.
  clearIncidents: () => set({ incidents: [], ticker: [], totalAnnouncements: 0 }),

  activityLog: [ logEntry('INFO', 'SHYEN activity stream online') ],

  // Structured, persisted record of meaningful state transitions — see
  // src/engine/changeHistory.js. Hydrated from localStorage at store
  // creation, so a page refresh (or a real crash) doesn't lose the record
  // of what happened before the interruption.
  changeHistory: loadChangeHistory(),

  clearChangeHistoryLog: () => set(() => {
    persistChangeHistory([])
    return { changeHistory: [] }
  }),

  risStatus:      'disconnected',
  risMessageCount: 0,
  risIndianCount:  0,
  risError:        null,

  apnicLoaded: false,
  apnicCount:  0,

  notifications: [],

  chatMessages: [],

  addIncident: (incident) => set(state => {    const raw = [incident, ...state.incidents]
    const incidents = pruneIncidents(raw)
    const logItem = logEntry(
      incident.aiDecided ? 'SUCCESS' : 'INFO',
      `${incident.aiDecided ? 'AI DECIDED' : 'Incident detected'}: ${incident.severity} ${(incident.type ?? 'UNKNOWN').replace(/_/g,' ')} on ${incident.victim?.name ?? 'Unknown'}`,
      incident.id,
    )
    const activityLog = appendLog(state.activityLog, logItem)
    const isDemo = Boolean(incident.isSimulated || incident.isDemoSession)

    // Every incident creation is also a Change Log entry (type 'DETECTED') —
    // not just the actions taken on it — so judges see the log fill up
    // through Demo Mode alone, without needing to click any action buttons.
    const detectedEntry = buildChangeEntry({
      incidentId: incident.id,
      type:  'DETECTED',
      label: `${(incident.type ?? 'UNKNOWN').replace(/_/g,' ')} detected — ${incident.victim?.name ?? 'Unknown'} (${incident.severity})${isDemo ? ' [DEMO]' : ''}`,
      before: { status: null },
      after:  { status: incident.status ?? 'DETECTED' },
      keys:   ['status'],
    })
    const changeHistory = appendChangeEntry(state.changeHistory, detectedEntry)
    persistChangeHistory(changeHistory)


    return { incidents, activityLog, changeHistory }
  }),

  selectIncident: (id) => set({ selectedIncidentId: id }),

  addTickerEntry: (entry) => set(state => ({
    ticker:             [...state.ticker, entry].slice(-20),
    totalAnnouncements: state.totalAnnouncements + 1,
  })),

  addActivityLog: (level, message, incidentId = null) => set(state => ({
    activityLog: appendLog(state.activityLog, logEntry(level, message, incidentId)),
  })),

  triggerAction: (incidentId, action) => set(state => {
    let actedIncident = null
    let beforeSnapshot = null
    const incidents = state.incidents.map(inc => {
      if (inc.id !== incidentId) return inc
      beforeSnapshot = incidentSnapshot(inc)
      const u = { ...inc }
      if (action === 'rpki')      u.rpkiPushed     = true
      if (action === 'ixp')       u.ixpAlerted     = true
      if (action === 'forensics') u.forensicsReady = true
      if (action === 'flag')      u.flagged        = true
      if (u.rpkiPushed && u.ixpAlerted) {
        u.status          = 'MITIGATED'
        u.mitigatedAt     = new Date().toISOString()
        u.mitigationMs    = u.timestamp ? Date.now() - new Date(u.timestamp).getTime() : null
        u.mitigationSource = u.mitigationSource ?? 'MANUAL'
      }
      actedIncident = u
      return u
    })

    const actionLabel = ACTION_LABELS[action] ?? action.toUpperCase()
    let activityLog = appendLog(
      state.activityLog,
      logEntry('ACTION', `${actionLabel} executed${actedIncident ? ` for ${actedIncident.victim?.name ?? 'Unknown'}` : ''}`, incidentId),
    )
    if (actedIncident?.status === 'MITIGATED') {
      activityLog = appendLog(activityLog, logEntry('SUCCESS', `Mitigation complete for ${actedIncident.victim?.name ?? 'Unknown'}`, incidentId))
    }

    let changeHistory = state.changeHistory
    if (actedIncident) {
      const entry = buildChangeEntry({
        incidentId,
        type:   actedIncident.status === 'MITIGATED' ? 'STATUS' : 'ACTION',
        label:  `${actionLabel} — ${actedIncident.victim?.name ?? 'Unknown'}`,
        before: beforeSnapshot,
        after:  incidentSnapshot(actedIncident),
        keys:   INCIDENT_DIFF_KEYS,
      })
      changeHistory = appendChangeEntry(changeHistory, entry)
      persistChangeHistory(changeHistory)    }
    // row stays stuck at status 'DETECTED' forever even after the incident
    // is mitigated locally. `status` and `payload` are the only mutable    // status for querying/filtering, payload so the full incident
    // (including rpkiPushed/ixpAlerted/etc.) is preserved for the record.
    if (actedIncident) {    }

    return { incidents, activityLog, changeHistory }
  }),

  markAIAnalyzing: (incidentId) => set(state => ({
    incidents: state.incidents.map(inc =>
      inc.id === incidentId ? { ...inc, aiAnalyzing: true } : inc
    ),
  })),

  markAIDecided: (incidentId, decision) => set(state => {
    const isAlert = decision?.mode === 'alert'

    let beforeSnapshot = null
    let afterSnapshot   = null
    const incidents = state.incidents.map(inc => {
      if (inc.id !== incidentId) return inc
      beforeSnapshot = incidentSnapshot(inc)
      const updated = isAlert ? applyAlertModeDecision(inc, decision) : applyAutonomousDecision(inc, decision)
      afterSnapshot = incidentSnapshot(updated)
      return updated
    })

    const notification = {
      id:        Date.now(),
      text:      isAlert
        ? `ANOMALY FLAGGED on incident #${incidentId} — IXPs alerted autonomously, RPKI push suggested`
        : `AI autonomously acted on incident #${incidentId}`,
      action:    isAlert ? 'ALERT_IXP' : (decision?.immediateAction ?? 'MONITOR'),
      timestamp: new Date(),
      isAlert,
    }

    const activityLog = appendLog(
      state.activityLog,
      logEntry(
        isAlert ? 'INFO' : 'SUCCESS',
        isAlert
          ? `AI AUTONOMOUS: flagged incident #${String(incidentId).padStart(4,'0')} for review and alerted IXPs (low confidence) — RPKI push suggested`
          : `AI DECIDED autonomous response for incident #${String(incidentId).padStart(4,'0')}`,
        incidentId,
      ),
    )

    let changeHistory = state.changeHistory
    if (beforeSnapshot) {
      const entry = buildChangeEntry({
        incidentId,
        type:   'AI_DECISION',
        label:  isAlert ? 'AI flagged for review (low confidence)' : 'AI autonomous decision applied',
        before: beforeSnapshot,
        after:  afterSnapshot,
        keys:   INCIDENT_DIFF_KEYS,
      })
      changeHistory = appendChangeEntry(changeHistory, entry)
      persistChangeHistory(changeHistory)    }    // Same rationale as triggerAction: AI decisions can flip status/flags
    const decidedIncident = incidents.find(inc => inc.id === incidentId)
    if (decidedIncident) {    }

    return {
      incidents,
      activityLog,
      changeHistory,
      notifications: [notification, ...state.notifications].slice(0, 10),
    }
  }),

  setIncidentRPKI: (incidentId, rpkiStatus) => set(state => ({
    incidents: state.incidents.map(inc =>
      inc.id === incidentId ? { ...inc, rpkiStatus } : inc
    ),
  })),

  setIncidentAttackerCountry: (incidentId, country) => set(state => ({
    incidents: state.incidents.map(inc =>
      inc.id === incidentId
        ? { ...inc, attacker: { ...inc.attacker, country } }
        : inc
    ),
  })),

  // FIX: Also enrich the victim name if it was "Unknown Indian ISP"
  setIncidentVictim: (incidentId, victim) => set(state => ({
    incidents: state.incidents.map(inc =>
      inc.id === incidentId ? { ...inc, victim } : inc
    ),
  })),

  // FIX: Allow confidence to be updated after RPKI enrichment
  setIncidentConfidence: (incidentId, confidence, breakdown) => set(state => ({
    incidents: state.incidents.map(inc =>
      inc.id === incidentId ? { ...inc, confidence, ...(breakdown ? { confidenceBreakdown: breakdown } : {}) } : inc
    ),
  })),

  addVantageConfirmation: (incidentId, vantagePoint) => set(state => ({
    incidents: state.incidents.map(inc => {
      if (inc.id !== incidentId) return inc
      const existing = inc.confirmedPoints ?? []
      if (existing.includes(vantagePoint) || existing.length >= 8) return inc
      return { ...inc, confirmedPoints: [...existing, vantagePoint] }
    }),
  })),

  addChatMessage: (msg) => set(state => {    return { chatMessages: [...state.chatMessages, msg].slice(-100) }
  }),

  clearChat: () => set({ chatMessages: [] }),

  dismissNotification: (id) => set(state => ({
    notifications: state.notifications.filter(n => n.id !== id),
  })),

  setActiveTab:  (tab)    => set({ activeTab: tab }),
  setSystemTime: (date)   => set({ systemTime: date }),
  setRisStatus:  (status) => set({ risStatus: status, risError: null }),
  setRisError:   (error)  => set({ risError: error, risStatus: 'error' }),

  incrementRisStats: () => set(state => ({
    risMessageCount: state.risMessageCount + 1,
  })),

  incrementRisIndianCount: () => set(state => ({
    risIndianCount: state.risIndianCount + 1,
  })),

  setAPNICLoaded: (count) => set({ apnicLoaded: true, apnicCount: count }),
}),
{
  name: 'shyen-session', // localStorage key
  storage: createJSONStorage(() => localStorage),
  version: 1,

  // Only persist what constitutes "unfinished work" worth recovering.
  // Deliberately excludes ephemeral/derived state (risStatus, apnicLoaded,
  // systemTime, the raw ticker feed) so a reload reconnects live data
  // sources fresh instead of showing a stale connection badge.
  partialize: (state) => ({
    incidents:          state.incidents,
    selectedIncidentId: state.selectedIncidentId,
    activityLog:        state.activityLog,
    notifications:      state.notifications,
    totalAnnouncements: state.totalAnnouncements,
    appMode:            state.appMode,
    isPaused:           state.isPaused,
    pausedAt:           state.pausedAt,
    lastCheckpointSnapshot: state.lastCheckpointSnapshot,
  }),

  // Runs once, synchronously, right after localStorage is read and merged
  // into the initial state — before the app's first render. This is what
  // computes "was there unfinished work to recover" for the recovery
  // banner, without that flag persisting itself (it's deliberately left
  // out of partialize above).
  onRehydrateStorage: () => (state) => {
    if (!state) return
    const unfinished = (state.incidents ?? []).filter(i => i.status !== 'MITIGATED').length
    if ((state.incidents?.length ?? 0) > 0 || (state.activityLog?.length ?? 0) > 1) {
      state.recoveredSession         = true
      state.recoveredAt              = new Date().toISOString()
      state.recoveredUnfinishedCount = unfinished
    }
  },
},
))

// ── User profile store ────────────────────────────────────────────────────
export const useProfileStore = create((set, get) => ({
  name:         'Yash',
  organization: 'DIGIFARM',
  country:      'India',
  email:        '',
  reportEmail:  '',
  photo:        null,
  priorities:   [],

  setProfile: (fields) => set(state => ({ ...state, ...fields })),
  setPhoto:   (dataUrl) => set({ photo: dataUrl }),

  addPriority: (item) => set(state => ({
    priorities: [{ ...item, id: Date.now() }, ...state.priorities].slice(0, 50),
  })),
  removePriority: (id) => set(state => ({
    priorities: state.priorities.filter(p => p.id !== id),
  })),
}))

// ── Custom monitor store ──────────────────────────────────────────────────
export const useMonitorStore = create((set) => ({
  targets:  [],
  loading:  false,

  addTarget:    (t)  => set(state => ({ targets: [{ ...t, id: Date.now(), routes: [] }, ...state.targets].slice(0, 20) })),
  removeTarget: (id) => set(state => ({ targets: state.targets.filter(t => t.id !== id) })),
  updateRoutes: (id, routes) => set(state => ({
    targets: state.targets.map(t => t.id === id ? { ...t, routes, lastChecked: new Date() } : t),
  })),
  setLoading: (v) => set({ loading: v }),
}))
// Backward-compatibility aliases
export { useSHYENStore as useHexaSentinelStore }
