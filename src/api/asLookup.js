/**
 * AS Number → Country Lookup via RIPE STAT
 * Free, CORS-enabled, no auth required
 * GET https://stat.ripe.net/data/as-overview/data.json?resource=AS{number}
 */

const CACHE   = new Map()
const PENDING = new Map()

export async function lookupASCountry(asn) {
  // asn comes in as "AS138886" — strip prefix
  const asnNum = String(asn).replace('AS', '')
  const key = asnNum

  if (CACHE.has(key)) return CACHE.get(key)
  if (PENDING.has(key)) return PENDING.get(key)

  const promise = _fetch(asnNum, key)
  PENDING.set(key, promise)

  try {
    const result = await promise
    PENDING.delete(key)
    return result
  } catch {
    PENDING.delete(key)
    return null
  }
}

async function _fetch(asnNum, key) {
  try {
    const url = `https://stat.ripe.net/data/as-overview/data.json?resource=AS${asnNum}`
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const json    = await res.json()
    const holder  = json?.data?.holder ?? ''
    const country = json?.data?.announced_country ?? extractCountryFromHolder(holder)

    const result = {
      country: country || 'XX',
      holder,
      asn: `AS${asnNum}`,
    }

    CACHE.set(key, result)
    setTimeout(() => CACHE.delete(key), 30 * 60 * 1000) // 30 min cache

    return result
  } catch {
    return null
  }
}

/**
 * Fallback: many RIPE holder strings end with ", XX" country code
 * e.g. "China Telecom, CN"
 */
function extractCountryFromHolder(holder) {
  const match = holder.match(/,\s*([A-Z]{2})$/)
  return match ? match[1] : null
}

/**
 * Pre-warm cache with the most commonly seen attacker ASNs
 * Called on app load — by demo time, lookups are instant
 * These are real ASNs frequently seen in BGP anomaly traffic
 */
const COMMON_ASNS = [
  '4134',   // China Telecom
  '4837',   // China Unicom
  '9808',   // China Mobile
  '45595',  // PTCL Pakistan
  '17557',  // PTCL
  '58453',  // China Telecom Next Gen
  '23969',  // TOT Thailand
  '38909',  // Indian network
  '137354', // unidentified
  '138886', // unidentified
  '135012', // unidentified
  '141873', // unidentified
  '7018',   // AT&T
  '3320',   // Deutsche Telekom
  '1221',   // Telstra
  '2516',   // KDDI
  '6762',   // Telecom Italia
  '8452',   // Telecom Egypt
  '174',    // Cogent
  '3356',   // Lumen
]

export async function prewarmASCache() {
  console.log('[HexaSentinel] Pre-warming AS country cache...')
  // Fire all lookups in parallel, don't block on results
  const results = await Promise.allSettled(
    COMMON_ASNS.map(asn => lookupASCountry(`AS${asn}`))
  )
  const resolved = results.filter(r => r.status === 'fulfilled' && r.value).length
  console.log(`[HexaSentinel] Pre-warmed ${resolved}/${COMMON_ASNS.length} ASN lookups`)
}
