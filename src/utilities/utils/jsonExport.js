// Feature #65 — Export full incident log as JSON download
export function exportIncidentsJSON(incidents) {
  const payload = {
    exportedAt:  new Date().toISOString(),
    system:      'HexaSentinel v2.0 — On-Device Network Intelligence',
    totalCount:  incidents.length,
    incidents:   incidents.map(inc => ({
      incidentId:      `INC-${new Date(inc.timestamp).getFullYear()}-${String(new Date(inc.timestamp).getMonth()+1).padStart(2,'0')}${String(new Date(inc.timestamp).getDate()).padStart(2,'0')}-${String(inc.id).padStart(4,'0')}`,
      type:            inc.type,
      severity:        inc.severity,
      status:          inc.status,
      timestamp:       new Date(inc.timestamp).toISOString(),
      victim:          { asn:inc.victim.asn, name:inc.victim.name, sector:inc.victim.sector },
      attacker:        { asn:inc.attacker.asn, name:inc.attacker.name, country:inc.attacker.country },
      prefix:          inc.prefix,
      confidence:      inc.confidence,
      affectedIPs:     inc.affectedIPs,
      vantagePoints:   (inc.confirmedPoints ?? []).length,
      actions: {
        rpkiPushed:     inc.rpkiPushed,
        ixpAlerted:     inc.ixpAlerted,
        forensicsReady: inc.forensicsReady,
      },
    })),
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href:url, download:`HexaSentinel-incidents-${Date.now()}.json` })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
