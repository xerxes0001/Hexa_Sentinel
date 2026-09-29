/**
 * Change History Engine — Interruption Handling
 *
 * SHYEN's activityLog is a flat, in-memory, capped text feed — good for a
 * live ticker, useless as evidence of what actually changed. This module
 * is the structured counterpart: every meaningful state transition (an
 * action taken on an incident, a status flip to MITIGATED, an AI decision
 * applied) is recorded as a discrete entry with an explicit before/after
 * diff, not just a sentence.
 *
 * It's persisted to localStorage independently of the rest of the app
 * state, so the record survives a refresh, a crash, or an intentional
 * pause — that's what makes it evidence of "unfinished work" being
 * recoverable rather than a cosmetic log that resets with the page.
 *
 * Deliberately narrow: it only records transitions the caller explicitly
 * asks it to (action fired, status changed, AI decision applied, session
 * paused/resumed) — never raw ticker/BGP-feed noise. That's what keeps a
 * 300-entry cap meaningful instead of getting flooded in seconds.
 */

import { safeGetItem, safeSetItem } from '../utils/safeStorage.js'

const STORAGE_KEY   = 'hexasentinel_change_history'
const HISTORY_LIMIT = 300

let entryCounter = 0

/**
 * Shallow before/after diff over a fixed set of tracked keys. Only keys
 * that actually changed are included — an entry with an empty diff array
 * means "nothing tracked changed," which is itself useful to be able to
 * see rather than infer.
 */
export function diffSnapshots(before, after, keys) {
  const diff = []
  for (const key of keys) {
    const b = before?.[key] ?? null
    const a = after?.[key] ?? null
    if (b !== a) diff.push({ key, before: b, after: a })
  }
  return diff
}

/**
 * Load persisted change history on store init. Degrades to [] on missing
 * or corrupted storage rather than crashing the app over it — recovery
 * should never be the thing that breaks the session.
 */
export function loadChangeHistory() {
  try {
    const raw = safeGetItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    entryCounter = parsed.reduce((max, e) => Math.max(max, e.id ?? 0), 0)
    return parsed
  } catch {
    return []
  }
}

/** Persist the full (already-bounded) history list. Best-effort. */
export function persistChangeHistory(history) {
  try { safeSetItem(STORAGE_KEY, JSON.stringify(history)) } catch { /* best-effort */ }
}

/**
 * Build one structured entry. Pure — does not touch storage or React
 * state. `type` is one of: 'ACTION' | 'STATUS' | 'AI_DECISION' | 'SESSION'.
 */
export function buildChangeEntry({ incidentId = null, type, label, before = null, after = null, keys = [] }) {
  return {
    id:        ++entryCounter,
    timestamp: new Date().toISOString(),
    incidentId,
    type,
    label,
    diff: keys.length ? diffSnapshots(before, after, keys) : [],
  }
}

/** Append + bound in one step, mirroring appendLog's pattern in the store. */
export function appendChangeEntry(history, entry) {
  return [...history, entry].slice(-HISTORY_LIMIT)
}

export function clearChangeHistory() {
  persistChangeHistory([])
  entryCounter = 0
}
