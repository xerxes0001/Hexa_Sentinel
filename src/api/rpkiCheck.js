/**
 * RPKI Validation via Cloudflare RPKI API
 *
 * API: GET https://rpki.cloudflare.com/api/v1/validity/{asn}/{prefix}
 *   - 200 + JSON  → valid/invalid state from Cloudflare's ROA database
 *   - 404         → no ROA found for this prefix = "not-found" (unknown, not an error)
 *   - 403/5xx     → Cloudflare unavailable (CORS or server-side block) → return unknown
 *
 * Key fix: 404 is EXPECTED for prefixes not in the RPKI database and must
 * be treated as state="not-found" (unknown), NOT retried as a failure.
 * Retrying 404s causes the console spam seen in production.
 *
 * Root-cause fix (this pass): the 404/200 paths were already cached, but
 * every OTHER outcome — invalid/placeholder ASN, CORS block, 5xx, timeout —
 * returned `null` WITHOUT ever writing to CACHE. That meant those specific
 * ASN+prefix pairs were re-fetched from scratch on every single subsequent
 * incident/scan that touched them, with no backoff — a real violation of
 * "never repeatedly request the same ASN+prefix". We now negative-cache
 * those outcomes too, for a short TTL, so a failing/blocked lookup is
 * retried at most once per FAIL_CACHE_MS instead of on every call.
 */

const CACHE          = new Map()   // key -> result (result may legitimately be `null`)
const PENDING        = new Map()   // key -> promise (dedup in-flight requests)
const FAIL_CACHE_MS  = 60 * 1000   // short negative-cache TTL for non-404 failures

function cacheResult(key, result, ttlMs) {
  CACHE.set(key, result)
  setTimeout(() => CACHE.delete(key), ttlMs)
}

// Normalize once, up front, so the same logical ASN always maps to the same
// cache key regardless of whether a caller passes "AS55836" or "55836".
function normalizeAsnKey(asn, prefix) {
  const asnStr = String(asn ?? '')
  const asnNum = asnStr.replace(/^AS/i, '')
  return `${asnNum || asnStr}:${prefix}`
}

export async function checkRPKI(asn, prefix) {
  const key = normalizeAsnKey(asn, prefix)
  if (CACHE.has(key))   return CACHE.get(key)
  if (PENDING.has(key)) return PENDING.get(key)

  const promise = _fetchRPKI(asn, prefix, key)
  PENDING.set(key, promise)

  try {
    const result = await promise
    PENDING.delete(key)
    return result
  } catch {
    PENDING.delete(key)
    cacheResult(key, null, FAIL_CACHE_MS)
    return null
  }
}

async function _fetchRPKI(asn, prefix, key) {
  // Guard: skip RPKI for unknown/placeholder ASNs — they produce junk URLs
  // e.g. asn='AS-IN-UNKNOWN' → URL becomes /validity/-IN-UNKNOWN/... → 404 spam
  const asnStr = String(asn)
  if (!asn || asnStr.includes('UNKNOWN') || asnStr.includes('AS-IN') || asnStr === 'AS-UNKNOWN-IN') {
    cacheResult(key, null, FAIL_CACHE_MS)
    return null
  }

  // Plain ASN number (no "AS" prefix) + literal slash in prefix path
  const asnNum = asnStr.replace(/^AS/i, '')
  // Must be a pure numeric ASN — reject anything else
  if (!/^\d+$/.test(asnNum)) {
    console.warn(`[HexaSentinel RPKI] Skipping invalid ASN: ${asn}`)
    cacheResult(key, null, FAIL_CACHE_MS)
    return null
  }
  const url    = `https://rpki.cloudflare.com/api/v1/validity/${asnNum}/${prefix}`

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      // mode:'cors' is default; if CORS blocks (e.g. some Cloudflare RPKI paths),
      // the browser logs a network error regardless of JS catch. We silence this
      // by checking the cache first (done above) and only fetching on cache miss.
    })

    // 404 = no ROA entry for this prefix in Cloudflare's database.
    // This is DOCUMENTED behavior — treat as "not-found" / unknown.
    // Cache for 15 min (longer than valid results) to prevent repeat network requests.
    if (res.status === 404) {
      const result = {
        valid: false, invalid: false, unknown: true,
        state: 'not-found',
        reason: 'No Route Origin Authorization found for this prefix',
        asn, prefix,
      }
      cacheResult(key, result, 15 * 60 * 1000)  // 15 min cache for 404s
      return result
    }

    // Other non-OK responses (403 CORS block, 5xx server error) — log once,
    // negative-cache briefly so a blocked/rate-limited endpoint isn't
    // re-hit by every incident/scan that references this prefix.
    if (!res.ok) {
      console.warn(`[HexaSentinel RPKI] ${prefix}: HTTP ${res.status} — skipping RPKI check`)
      cacheResult(key, null, FAIL_CACHE_MS)
      return null
    }

    const data  = await res.json()
    const state = data?.result?.validity?.state ?? 'unknown'

    const result = {
      valid:   state === 'valid',
      invalid: state === 'invalid',
      unknown: state === 'unknown' || state === 'not-found',
      state,
      reason:  data?.result?.validity?.reason ?? null,
      asn, prefix,
    }

    // Cache successful results for 5 minutes
    cacheResult(key, result, 5 * 60 * 1000)
    return result

  } catch (err) {
    // Network error / timeout — don't retry immediately, negative-cache
    // briefly instead so a persistent outage doesn't re-fetch on every call.
    if (err.name !== 'AbortError') {
      console.warn(`[HexaSentinel RPKI] ${prefix}: network error — ${err.message}`)
    }
    cacheResult(key, null, FAIL_CACHE_MS)
    return null
  }
}

/**
 * Pre-check RPKI for an incident immediately on creation.
 * Called from App.jsx after enrichAndAdd.
 */
export async function preCheckRPKI(incident) {
  return checkRPKI(incident.victim.asn, incident.prefix)
}
