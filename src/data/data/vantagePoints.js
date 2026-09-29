export const VANTAGE_POINTS = [
  'RIPE-RIS-01 Amsterdam',
  'RouteViews Oregon',
  'RIPE-RIS-04 Geneva',
  'RouteViews Tokyo',
  'RIPE-RIS-10 Singapore',
  'RouteViews Sydney',
  'RIPE-RIS-11 New York',
  'RouteViews Sao Paulo',
]

/**
 * Deterministically map a real RIPE RIS collector host (e.g. "rrc00",
 * "rrc12.ripe.net", or a peer IP if host is unavailable) onto one of our
 * 8 named vantage points. This means as MORE distinct real RIS collectors
 * report the same prefix/origin, the incident picks up MORE confirmed
 * vantage points over time — driven by real data, not a hardcoded count.
 */
export function hostToVantage(host) {
  if (!host) return VANTAGE_POINTS[0]
  let hash = 0
  for (let i = 0; i < host.length; i++) {
    hash = (hash * 31 + host.charCodeAt(i)) >>> 0
  }
  return VANTAGE_POINTS[hash % VANTAGE_POINTS.length]
}
