/**
 * Proactive RPKI Gap Scanner
 *
 * Everything else in SHYEN is REACTIVE — it fires after a hijack is already
 * happening. This is the preventive half: continuously audit every prefix
 * SHYEN monitors against live RPKI data and surface which ones have NO ROA
 * coverage right now — i.e. "front doors currently left unlocked" — before
 * anyone hijacks them. This is closer to real security-posture-management
 * tooling (the direction things like Kentik's RPKI tracking go) than a
 * typical hijack dashboard, and almost no hackathon project builds the
 * preventive half.
 */
import { checkRPKI } from '../api/rpkiCheck.js'
import { INDIAN_ASNS } from '../data/indianASNs.js'
import { safeGetItem, safeSetItem } from '../utils/safeStorage.js'

const PRIORITY_SECTORS = ['Financial', 'Government', 'Defense']
const HISTORY_KEY   = 'hexasentinel_rpki_scan_history'
const HISTORY_LIMIT = 20 // bounded, so this never grows unbounded across many demo sessions

function buildScanList() {
  const list = []
  for (const entry of INDIAN_ASNS) {
    for (const prefix of entry.prefixes) {
      list.push({ asn: entry.asn, name: entry.name, sector: entry.sector, prefix })
    }
  }
  // Sensitive sectors scanned first — matters if a scan is interrupted or
  // the person just wants to see the highest-stakes gaps fastest.
  list.sort((a, b) => {
    const aP = PRIORITY_SECTORS.includes(a.sector) ? 0 : 1
    const bP = PRIORITY_SECTORS.includes(b.sector) ? 0 : 1
    return aP - bP
  })
  return list
}

// Batches requests to be respectful of Cloudflare's public RPKI API rather
// than firing 89 requests at once.
const CONCURRENCY   = 6
const BATCH_GAP_MS  = 150

export async function scanRPKIGaps(onProgress) {
  const list    = buildScanList()
  const results = []

  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const batch = list.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(batch.map(async item => {
      const rpki  = await checkRPKI(item.asn, item.prefix)
      const state = rpki?.state ?? 'unreachable'
      return { ...item, rpkiState: state }
    }))
    results.push(...batchResults)
    onProgress?.(results.length, list.length)
    if (i + CONCURRENCY < list.length) {
      await new Promise(r => setTimeout(r, BATCH_GAP_MS))
    }
  }
  return results
}

export function summarizeGaps(results) {
  const gapList     = results.filter(r => r.rpkiState === 'not-found' || r.rpkiState === 'unreachable' || r.rpkiState === 'unknown')
  const coveredList = results.filter(r => r.rpkiState === 'valid')
  const invalidList = results.filter(r => r.rpkiState === 'invalid')

  return {
    total:        results.length,
    coveredCount: coveredList.length,
    gapCount:     gapList.length,
    invalidCount: invalidList.length,
    coveragePct:  results.length ? Math.round((coveredList.length / results.length) * 100) : 0,
    gapList:      gapList.sort((a, b) => (PRIORITY_SECTORS.includes(a.sector) ? 0 : 1) - (PRIORITY_SECTORS.includes(b.sector) ? 0 : 1)),
    invalidList,
  }
}

// ── Trend tracking ──────────────────────────────────────────────────────
// Turns the gap scanner from a one-off snapshot into evidence of security
// posture improving (or not) over time — a much stronger demo beat than a
// single static number ("coverage went from 41% to 62% since last scan").
export function getScanHistory() {
  try {
    const raw = safeGetItem(HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return [] // corrupted storage — degrade to "no history" rather than crash
  }
}

export function saveScanToHistory(summary) {
  const history = getScanHistory()
  const entry = {
    timestamp: new Date().toISOString(),
    coveragePct: summary.coveragePct,
    total: summary.total,
    coveredCount: summary.coveredCount,
    gapCount: summary.gapCount,
    invalidCount: summary.invalidCount,
  }
  const updated = [...history, entry].slice(-HISTORY_LIMIT)
  try { safeSetItem(HISTORY_KEY, JSON.stringify(updated)) } catch { /* best-effort — trend tracking is a nice-to-have, never block the scan over it */ }
  return updated
}

export function clearScanHistory() {
  try { safeSetItem(HISTORY_KEY, JSON.stringify([])) } catch { /* best-effort */ }
}

/**
 * Compares the current scan's coverage against the most recent PRIOR scan
 * (not counting the one just saved). Returns null if this is the first
 * scan ever recorded — there's nothing to compare against yet.
 */
export function computeTrend(currentSummary, history) {
  // history should be the array BEFORE the current scan was appended
  if (!history || history.length === 0) return null
  const previous = history[history.length - 1]
  const delta = currentSummary.coveragePct - previous.coveragePct
  return {
    previousPct: previous.coveragePct,
    previousTimestamp: previous.timestamp,
    currentPct: currentSummary.coveragePct,
    delta,
    direction: delta > 0 ? 'improved' : delta < 0 ? 'declined' : 'unchanged',
  }
}

// ── Generate a ready-to-file ROA template for a gap, BEFORE anything has
// been hijacked. Same RFC 6482 shape as the reactive countermeasure
// generator, but framed as prevention rather than emergency response.
export function generateProactiveROA(gap) {
  const now      = new Date()
  const notAfter = new Date(now.getTime() + 365 * 24 * 3600 * 1000)
  const asnNum   = gap.asn.replace('AS', '')
  const bits     = parseInt(gap.prefix.split('/')[1] ?? '24')

  const json = {
    roaVersion: '1',
    subject: {
      asID: `AS${asnNum}`,
      ipAddrBlocks: [
        { addressFamily: 'IPv4', addresses: [{ prefix: gap.prefix, maxLength: Math.min(bits + 8, 32) }] },
      ],
    },
    issuer: 'IRINN-CA (Indian Registry for Internet Names and Numbers)',
    validity: {
      notBefore: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      notAfter:  notAfter.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    },
    reason: `Proactive ROA — closes unauthorized-origin exposure window for ${gap.prefix} (${gap.name}, ${gap.sector}). No prior hijack; preventive filing.`,
    signature: 'PENDING — requires IRINN CA private key (network operator must submit via RIR portal)',
  }
  return JSON.stringify(json, null, 2)
}
