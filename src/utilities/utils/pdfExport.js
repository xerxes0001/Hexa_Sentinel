// Phase 7 — CERT-In PDF Report Generator (using jsPDF via CDN)

async function loadJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
    script.onload = () => {
      if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf.jsPDF)
      else reject(new Error('jsPDF not found after load'))
    }
    script.onerror = reject
    document.head.appendChild(script)
  })
}

function makeIncidentId(incident) {
  const d = new Date(incident.timestamp)
  const mm = String(d.getMonth()+1).padStart(2,'0')
  const dd = String(d.getDate()).padStart(2,'0')
  const yy = d.getFullYear()
  return `INC-${yy}${mm}${dd}-${String(incident.id).padStart(4,'0')}`
}

export async function generateCERTInReport(incident) {
  const jsPDF = await loadJsPDF()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const ts  = new Date(incident.timestamp).toISOString().replace('T', ' ').slice(0, 19)
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const incId = incident.incidentId || makeIncidentId(incident)

  // Palette
  const DARK  = [6,10,15]
  const RED   = [255,45,85]
  const GREEN = [0,200,100]
  const BLUE  = [0,191,255]
  const WHITE = [255,255,255]
  const GRAY  = [120,130,140]
  const LIGHT = [200,210,220]

  // Background
  doc.setFillColor(...DARK)
  doc.rect(0, 0, 210, 297, 'F')

  // Header bar
  doc.setFillColor(10,18,28)
  doc.rect(0, 0, 210, 32, 'F')
  doc.setFillColor(...RED)
  doc.rect(0, 0, 4, 32, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...WHITE)
  doc.text('HexaSentinel', 12, 13)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY)
  doc.text('ON-DEVICE NETWORK THREAT INTELLIGENCE · QUALCOMM AI HUB · HEXAGON NPU', 12, 19)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...RED)
  doc.text('CERT-In INCIDENT REPORT', 202, 11, { align: 'right' })
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY)
  doc.text(incId, 202, 17, { align: 'right' })
  doc.text(`Generated: ${now} UTC`, 202, 23, { align: 'right' })

  // Severity badge
  const sevColors = { CRITICAL: RED, HIGH: [255,107,0], MEDIUM: [255,214,10], LOW: [48,209,88] }
  const sc = sevColors[incident.severity] || RED
  doc.setFillColor(...sc)
  doc.roundedRect(10, 36, 42, 10, 1.5, 1.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(0,0,0)
  doc.text(`${incident.severity}`, 31, 43, { align: 'center' })

  // Status badge
  const stColor = incident.status === 'MITIGATED' ? [48,209,88] : RED
  doc.setFillColor(stColor[0]*0.08, stColor[1]*0.08, stColor[2]*0.08)
  doc.setDrawColor(...stColor)
  doc.setLineWidth(0.3)
  doc.roundedRect(56, 36, 36, 10, 1.5, 1.5, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...stColor)
  doc.text(incident.status, 74, 43, { align: 'center' })

  let y = 58

  function sectionTitle(title) {
    doc.setFillColor(14,22,34)
    doc.rect(8, y - 5, 194, 11, 'F')
    doc.setFillColor(...RED)
    doc.rect(8, y - 5, 2.5, 11, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...RED)
    doc.text(title, 15, y + 1.5)
    y += 13
  }

  function row(label, value, valueColor) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...GRAY)
    doc.text(label, 14, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...(valueColor || LIGHT))
    doc.text(String(value || '—'), 68, y)
    y += 7
  }

  function hr() {
    doc.setDrawColor(20,32,46)
    doc.setLineWidth(0.2)
    doc.line(8, y, 202, y)
    y += 5
  }

  // ── 1. Summary ──
  sectionTitle('INCIDENT SUMMARY')
  row('Incident ID', incId, BLUE)
  row('Detection Time', `${ts} UTC`)
  row('Report Generated', `${now} UTC`)
  row('Attack Type', incident.type.replace(/_/g,' '))
  row('Severity', incident.severity, sc)
  row('Status', incident.status, incident.status === 'MITIGATED' ? GREEN : RED)
  row('Confidence', `${incident.confidence}% (${(incident.confirmedPoints||[]).length}/8 vantage points)`)
  row('Affected IPs', `~${(incident.affectedIPs || 0).toLocaleString()} addresses`)
  hr()

  // ── 2. Attack Vector ──
  sectionTitle('ATTACK VECTOR DETAILS')
  row('Affected Prefix', incident.prefix, [255,214,10])
  row('Target ASN', `${incident.victim.asn} — ${incident.victim.name}`)
  row('Target Sector', incident.victim.sector)
  row('Attacker ASN', `${incident.attacker.asn} — ${incident.attacker.name}`)
  row('Attacker Country', incident.attacker.country)
  row('Observed AS-PATH', `${incident.attacker.asn} 174 3356 ${incident.victim.asn}`)
  hr()

  // ── 3. Vantage Points ──
  sectionTitle('VANTAGE POINT CONFIRMATION')
  const vps = incident.confirmedPoints || []
  let vpX = 14, col = 0
  vps.forEach(vp => {
    if (col === 2) { y += 7; vpX = 14; col = 0 }
    doc.setFillColor(0, 40, 20)
    doc.setDrawColor(...GREEN)
    doc.setLineWidth(0.2)
    doc.roundedRect(vpX, y - 3.5, 88, 6, 1, 1, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...GREEN)
    doc.text(`✓  ${vp}`, vpX + 3, y)
    vpX += 94
    col++
  })
  y += 10
  hr()

  // ── 4. Response Actions ──
  sectionTitle('RESPONSE ACTIONS EXECUTED')
  const actions = [
    { label: 'RPKI ROA Invalidation', done: incident.rpkiPushed,     detail: `ROA pushed for ${incident.prefix} — authorized: ${incident.victim.asn}` },
    { label: 'IXP Filter Push',       done: incident.ixpAlerted,     detail: 'Filters pushed — NIXI Mumbai, Delhi, Chennai, Kolkata' },
    { label: 'Forensic Package',      done: incident.forensicsReady, detail: 'Evidence bundle compiled for CERT-In submission' },
  ]
  actions.forEach(a => {
    const ac = a.done ? GREEN : [70,70,70]
    doc.setFillColor(a.done ? 0 : 18, a.done ? 25 : 18, a.done ? 18 : 18)
    doc.setDrawColor(...ac)
    doc.setLineWidth(0.3)
    doc.roundedRect(10, y - 4, 190, 11, 1.5, 1.5, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...ac)
    doc.text(a.done ? '✓' : '○', 15, y)
    doc.text(a.label, 22, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(a.done ? 80 : 55, a.done ? 120 : 55, a.done ? 80 : 55)
    doc.text(a.detail, 22, y + 4.5)
    y += 14
  })
  hr()

  // ── 5. Timeline ──
  sectionTitle('INCIDENT TIMELINE')
  const tlItems = [
    { time: ts,        label: 'Anomaly detected — BGP UPDATE received',            color: RED   },
    { time: `T+30s`,   label: 'Multi-vantage validation initiated across 8 nodes',  color: [255,107,0] },
    { time: `T+1m`,    label: `Threat confirmed at ${incident.confidence}% confidence`, color: [255,214,10] },
    { time: `T+2m`,    label: incident.rpkiPushed ? 'RPKI ROA invalidation pushed globally' : 'RPKI invalidation: PENDING', color: incident.rpkiPushed ? GREEN : GRAY },
    { time: `T+3m`,    label: incident.ixpAlerted ? 'IXP filter rules dispatched — NIXI nodes active' : 'IXP alert: PENDING', color: incident.ixpAlerted ? GREEN : GRAY },
    { time: incident.status === 'MITIGATED' ? `T+5m` : 'PENDING', label: incident.status === 'MITIGATED' ? 'Incident mitigated — continued monitoring active' : 'Mitigation in progress', color: incident.status === 'MITIGATED' ? GREEN : RED },
  ]
  tlItems.forEach((t, i) => {
    doc.setFillColor(...t.color)
    doc.circle(18, y - 1.5, 1.5, 'F')
    if (i < tlItems.length - 1) {
      doc.setDrawColor(...DARK.map(c => c+12))
      doc.setLineWidth(0.3)
      doc.line(18, y + 0.5, 18, y + 6)
    }
    doc.setFont('courier', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...t.color)
    doc.text(t.time, 24, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...LIGHT)
    doc.text(t.label, 52, y)
    y += 7
  })
  hr()

  // ── 6. Remediation ──
  sectionTitle('RECOMMENDED REMEDIATION')
  const rems = [
    '1.  Confirm RPKI ROA propagation via RIPE NCC RPKI portal (rpki.ripe.net)',
    '2.  Verify NIXI filter rules are active at all 4 exchange points',
    '3.  Contact upstream providers to withdraw the illegitimate announcement',
    '4.  Submit formal report to CERT-In at cert-in@cert-in.org.in referencing this document',
    '5.  Monitor BGP feeds for 24 hours post-mitigation for attack recurrence',
    '6.  Review and update IRR entries for all affected prefixes in IRINN',
    '7.  Consider BGPsec deployment for long-term cryptographic path validation',
  ]
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  rems.forEach(r => {
    doc.setTextColor(...LIGHT)
    doc.text(r, 14, y, { maxWidth: 186 })
    y += 6.5
  })

  // ── Footer ──
  doc.setFillColor(8,14,22)
  doc.rect(0, 283, 210, 14, 'F')
  doc.setFillColor(...RED)
  doc.rect(0, 283, 210, 0.4, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...GRAY)
  doc.text('HexaSentinel On-Device Intelligence · Confidential · For CERT-In Use Only', 105, 290, { align: 'center' })
  doc.text(`Document ID: ${incId} · Powered by Llama 3.2 3B — Qualcomm AI Hub · Hexagon NPU`, 105, 295, { align: 'center' })

  const filename = `HexaSentinel_${incId}_CERT-In_Report.pdf`
  doc.save(filename)
  return filename
}

export function makeIncidentIdFromIncident(incident) {
  return makeIncidentId(incident)
}
