// Feature #70 — IST alongside UTC everywhere
const pad = n => String(n).padStart(2,'0')

export function toIST(date = new Date()) {
  // IST = UTC+5:30
  const utcMs  = date.getTime()
  const istMs  = utcMs + (5.5 * 3600000)
  const istDate = new Date(istMs)
  return {
    hh: pad(istDate.getUTCHours()),
    mm: pad(istDate.getUTCMinutes()),
    ss: pad(istDate.getUTCSeconds()),
    str: `${pad(istDate.getUTCHours())}:${pad(istDate.getUTCMinutes())}:${pad(istDate.getUTCSeconds())}`,
  }
}

export function formatDualTime(date = new Date()) {
  const utc = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`
  const ist = toIST(date)
  return { utc, ist: `${ist.str} IST` }
}

export function timestampDual(date) {
  const d   = date instanceof Date ? date : new Date(date)
  const utc = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
  const ist = toIST(d)
  return `${utc} / ${ist.str} IST`
}

// Feature #66 — INC-YYYY-MMDD-XXXX format
export function formatIncidentId(incidentId, date = new Date()) {
  const y  = date.getFullYear()
  const mm = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const seq = String(incidentId).padStart(4, '0')
  return `INC-${y}-${mm}${dd}-${seq}`
}

export function elapsed(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (s < 60)   return `${s}s ago`
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  return `${Math.floor(s/3600)}h ago`
}

export function formatUptime(startMs) {
  const totalSec = Math.floor((Date.now() - startMs) / 1000)
  const d  = Math.floor(totalSec / 86400)
  const h  = Math.floor((totalSec % 86400) / 3600)
  const m  = Math.floor((totalSec % 3600) / 60)
  const s  = totalSec % 60
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`
}
