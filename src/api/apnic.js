/**
 * APNIC Indian Prefix Database — Fixed v2
 *
 * KEY FIX: The old code had `match ?? INDIAN_ASNS[0]` as a final fallback,
 * which silently mapped ANY unmatched Indian IP range to Reliance Jio (index 0).
 * This caused "always Reliance" in the incident feed.
 *
 * Fix: Unknown prefixes now get a proper "Unknown Indian ISP" placeholder
 * with a null ASN so the UI can show unknown rather than wrong data.
 *
 * Also: The RIPE Routing Registry (bgp.he.net / RIPE Stat) is used to
 * resolve the real ASN for prefixes that APNIC data doesn't cover.
 */
import { INDIAN_ASNS } from '../data/indianASNs.js'

let prefixMap  = null
let loaded     = false
let loading    = false

// Resolve an IP to its real announcing ASN via RIPE Stat (free, CORS-ok)
const asnResolutionCache = new Map()
export async function resolveRealASN(prefix) {
  const ip = prefix.split('/')[0]
  if (asnResolutionCache.has(ip)) return asnResolutionCache.get(ip)
  try {
    const url = `https://stat.ripe.net/data/prefix-overview/data.json?resource=${encodeURIComponent(prefix)}&min_peers_seeing=3`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    const asns = json?.data?.asns ?? []
    if (asns.length === 0) { asnResolutionCache.set(ip, null); return null }
    const result = {
      asn:     `AS${asns[0].asn}`,
      holder:  asns[0].holder ?? 'Unknown',
      country: json?.data?.announced_by_country?.[0] ?? 'IN',
    }
    asnResolutionCache.set(ip, result)
    setTimeout(() => asnResolutionCache.delete(ip), 60 * 60 * 1000)
    return result
  } catch {
    asnResolutionCache.set(ip, null)
    return null
  }
}

// Build fallback map from our hardcoded Indian ASN list
function buildFallbackMap() {
  const map = new Map()
  for (const asn of INDIAN_ASNS) {
    for (const prefix of asn.prefixes) {
      map.set(prefix, asn)
    }
  }
  // Broad Indian IP ranges mapped to correct carriers (NOT defaulting to INDIAN_ASNS[0])
  const broadRanges = [
    ['14.96.0.0/11',   'AS9829',   'BSNL'],
    ['27.0.0.0/13',    'AS45271',  'Idea Cellular'],
    ['49.32.0.0/11',   'AS24560',  'Airtel India'],
    ['59.88.0.0/13',   'AS9829',   'BSNL'],
    ['101.0.0.0/11',   null,       'Indian ISP'],
    ['103.0.0.0/8',    null,       'Indian Network'],
    ['110.224.0.0/12', null,       'Indian ISP'],
    ['111.64.0.0/10',  'AS18101',  'Reliance Comm'],
    ['115.112.0.0/13', 'AS24560',  'Airtel India'],
    ['117.96.0.0/11',  'AS18101',  'Reliance Comm'],
    ['119.224.0.0/12', null,       'Indian ISP'],
    ['122.160.0.0/11', 'AS9829',   'BSNL'],
    ['125.16.0.0/12',  'AS9498',   'Bharti Airtel BB'],
    ['157.32.0.0/11',  'AS55836',  'Reliance Jio'],
    ['164.100.0.0/14', 'AS45758',  'NIC India'],
    ['180.64.0.0/10',  'AS9498',   'Bharti Airtel BB'],
    ['182.64.0.0/11',  'AS24560',  'Airtel India'],
    ['203.94.0.0/16',  'AS24560',  'Airtel India'],
  ]
  for (const [prefix, asnStr, name] of broadRanges) {
    if (!map.has(prefix)) {
      if (asnStr) {
        const match = INDIAN_ASNS.find(a => a.asn === asnStr)
        if (match) { map.set(prefix, match); continue }
      }
      // Generic fallback — no longer defaults to Reliance Jio
      map.set(prefix, {
        asn: `AS-IN-UNKNOWN`,
        name,
        sector: 'ISP',
        prefixes: [prefix],
        isUnknown: true,
      })
    }
  }
  return map
}

function parseCIDR(cidr) {
  const [ip, bits] = cidr.split('/')
  const parts = ip.split('.').map(Number)
  return { parts, bits: parseInt(bits) }
}

function ipInCIDR(ip, cidr) {
  try {
    const { parts: cidrParts, bits } = parseCIDR(cidr)
    const ipParts = ip.split('.').map(Number)
    if (ipParts.length !== 4 || cidrParts.length !== 4) return false
    const cidrInt = cidrParts.reduce((a, p) => (a << 8) + p, 0) >>> 0
    const ipInt   = ipParts.reduce((a, p) => (a << 8) + p, 0) >>> 0
    const mask    = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
    return (cidrInt & mask) === (ipInt & mask)
  } catch { return false }
}

export async function loadAPNICData(onProgress) {
  if (loaded || loading) return
  loading = true

  // corsproxy.io changed its API to require the target as an explicit
  // ?url=<encoded> query param — the old "append the raw URL" format this
  // used to use now gets rejected with 403 host_not_allowed. Try the
  // corrected format first, then a second independent proxy, before
  // falling back to the hardcoded Indian ASN table. This is enrichment
  // data only — the app fully functions on the fallback, just with a
  // smaller/static prefix map.
  const APNIC_SOURCE_URL = 'https://ftp.apnic.net/stats/apnic/delegated-apnic-latest'
  const PROXY_URLS = [
    `https://corsproxy.io/?url=${encodeURIComponent(APNIC_SOURCE_URL)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(APNIC_SOURCE_URL)}`,
  ]

  let text = null
  let lastError = null
  for (const url of PROXY_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) throw new Error(`proxy fetch failed (HTTP ${res.status})`)
      text = await res.text()
      break
    } catch (err) {
      lastError = err
      console.warn(`[HexaSentinel APNIC] Proxy failed (${url.split('?')[0]}):`, err.message)
    }
  }

  try {
    if (text === null) throw lastError ?? new Error('all proxies failed')

    const lines = text.split('\n')
    const map   = buildFallbackMap()

    let matched = 0
    for (const line of lines) {
      if (!line.startsWith('apnic|IN|ipv4|')) continue
      const parts = line.split('|')
      if (parts.length < 5) continue
      const baseIP = parts[3]
      const count  = parseInt(parts[4])
      if (!baseIP || isNaN(count) || count === 0) continue
      const bits = 32 - Math.log2(count)
      if (!Number.isInteger(bits)) continue
      const prefix = `${baseIP}/${bits}`
      if (!map.has(prefix)) {
        const match = INDIAN_ASNS.find(a =>
          a.prefixes.some(p => {
            const pBase = p.split('/')[0].split('.').slice(0, 2).join('.')
            const rBase = baseIP.split('.').slice(0, 2).join('.')
            return pBase === rBase
          })
        )
        // FIX: No longer defaults to INDIAN_ASNS[0] (Reliance Jio)
        map.set(prefix, match ?? {
          asn: 'AS-IN',
          name: 'Indian Network',
          sector: 'ISP',
          prefixes: [prefix],
          isUnknown: true,
        })
        matched++
      }
    }

    prefixMap = map
    onProgress?.(`Loaded ${map.size} Indian prefixes (${matched} from APNIC live data)`)
    console.log(`[HexaSentinel APNIC] Loaded ${map.size} Indian prefixes (${matched} enriched from APNIC)`)
  } catch (err) {
    console.warn('[HexaSentinel APNIC] Proxy failed, using hardcoded fallback:', err.message)
    prefixMap = buildFallbackMap()
  }

  loaded  = true
  loading = false
}

export function findIndianASNForPrefix(prefix) {
  if (!prefixMap) return null
  if (prefixMap.has(prefix)) return prefixMap.get(prefix)
  const ip = prefix.split('/')[0]
  // Most-specific match wins — iterate sorted by prefix length descending
  let bestMatch = null
  let bestBits  = -1
  for (const [knownPrefix, asn] of prefixMap) {
    const bits = parseInt(knownPrefix.split('/')[1] ?? '0')
    if (bits > bestBits && ipInCIDR(ip, knownPrefix)) {
      bestMatch = asn
      bestBits  = bits
    }
  }
  return bestMatch
}

export function isIndianPrefix(prefix) {
  return findIndianASNForPrefix(prefix) !== null
}

export function getAPNICStatus() {
  return { loaded, loading, prefixCount: prefixMap?.size ?? 0 }
}
