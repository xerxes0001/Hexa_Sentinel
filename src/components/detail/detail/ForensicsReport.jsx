/**
 * Forensics Report Modal
 * Renders the auto-compiled CERT-In style evidence bundle for an incident
 * and lets the analyst copy / download it as a .txt file
 */
import { useState } from 'react'
import { generateCERTInReport } from '../../utils/pdfExport.js'
import { generateISPNotification } from '../../api/hexasentinelAPI.js'
import { useSHYENStore } from '../../store/useSHYENStore.js'

function buildReport(inc) {
  const ts  = new Date(inc.timestamp).toISOString().replace('T',' ').slice(0,19)
  const now = new Date().toISOString().replace('T',' ').slice(0,19)
  const incId = `INC-${new Date(inc.timestamp).getFullYear()}-${String(new Date(inc.timestamp).getMonth()+1).padStart(2,'0')}${String(new Date(inc.timestamp).getDate()).padStart(2,'0')}-${String(inc.id).padStart(4,'0')}`
  const ref = `SS-${String(inc.id).padStart(4,'0')}-${Date.now().toString(36).toUpperCase()}`

  return `CERT-IN FORENSICS EVIDENCE BUNDLE
═══════════════════════════════════════════════════════════
CLASSIFICATION : BGP ROUTE HIJACK / ROUTING SECURITY
INCIDENT ID    : ${incId}
REPORT REF     : ${ref}
GENERATED AT   : ${now} UTC
DATA SOURCE    : ${inc.isRealData ? 'RIPE RIS Live (real-time BGP feed)' : inc.isSimulated ? 'HexaSentinel Simulation Mode' : 'HexaSentinel NPU — Live Capture'}
SYSTEM         : HexaSentinel — On-Device AI (Llama 3.2 3B, Qualcomm AI Hub)

SECTION 1 — SUMMARY
──────────────────────────────────────────────────────
Attack Type    : ${inc.type?.replace(/_/g,' ')}
Severity       : ${inc.severity}
Status         : ${inc.status}
Detected       : ${ts} UTC
Confidence     : ${inc.confidence}%
Affected IPs   : ~${inc.affectedIPs?.toLocaleString() ?? 'Unknown'}

SECTION 2 — VICTIM NETWORK
──────────────────────────────────────────────────────
Organization   : ${inc.victim?.name}
ASN            : ${inc.victim?.asn}
Sector         : ${inc.victim?.sector}
Hijacked Prefix: ${inc.prefix}
RPKI Status    : ${inc.rpkiStatus?.state?.toUpperCase() ?? 'NOT CHECKED'}

SECTION 3 — ATTACKER
──────────────────────────────────────────────────────
Attacker ASN   : ${inc.attacker?.asn}
Country        : ${inc.attacker?.country && inc.attacker.country !== '??' ? inc.attacker.country : 'Pending resolution (RIPE STAT)'}
Repeat Offender: ${inc.isRepeatAttacker ? `YES (${inc.repeatCount} recorded attacks)` : 'NO'}${inc.pathAnomaly ? `\nPath Anomaly   : ${inc.pathAnomaly.replace(/_/g,' ')}` : ''}

SECTION 4 — DETECTION EVIDENCE
──────────────────────────────────────────────────────
Vantage Points : ${inc.confirmedPoints?.length ?? 0}/8 confirmed
Confirmations  :
${(inc.confirmedPoints ?? []).map(p => `  · ${p}`).join('\n') || '  · (none recorded)'}

SECTION 5 — RESPONSE ACTIONS TAKEN
──────────────────────────────────────────────────────
RPKI ROA Push  : ${inc.rpkiPushed ? '✓ EXECUTED' : '✗ PENDING'}
IXP Filter     : ${inc.ixpAlerted ? '✓ EXECUTED — NIXI Mumbai, Delhi, Chennai, Kolkata notified' : '✗ PENDING'}
Forensics Pkg  : ✓ GENERATED (this document)
AI Decision    : ${inc.aiDecided
  ? `✓ AUTONOMOUS — ${inc.aiDecision?.immediateAction?.replace(/_/g,' ')}`
  : '○ No autonomous action taken (below confidence threshold or AI unavailable)'}

SECTION 6 — AI ASSESSMENT
──────────────────────────────────────────────────────
${inc.aiDecision
  ? `Threat Level   : ${inc.aiDecision.threatLevel ?? inc.severity}
Reasoning      : ${inc.aiDecision.reasoning ?? 'N/A'}
Est. Impact    : ${inc.aiDecision.estimatedImpact ?? 'N/A'}`
  : 'AI analysis not yet available — manual review required.'}

═══════════════════════════════════════════════════════════
Submit to: incident@cert-in.org.in
Ref: ${ref}
═══════════════════════════════════════════════════════════`
}

export default function ForensicsReport({ incident: inc, onClose }) {
  const [copied, setCopied]   = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [nocDraft, setNocDraft] = useState(null)
  const [nocLoading, setNocLoading] = useState(false)
  const [nocError, setNocError] = useState(null)
  const [nocCopied, setNocCopied] = useState(false)
  
  const report = buildReport(inc)
  const incIdShort = `INC-${String(inc.id).padStart(4,'0')}`

  async function draftNocEmail() {
    setNocLoading(true)
    setNocError(null)
    try {
      const analysis = inc.aiDecision?.reasoning ?? null
      const text = await generateISPNotification(inc, analysis)
      setNocDraft(text)
    } catch (e) {
      setNocError(e.message ?? 'Failed to draft NOC notification.')
    } finally {
      setNocLoading(false)
    }
  }

  async function copyNocDraft() {
    if (!nocDraft) return
    try { await navigator.clipboard.writeText(nocDraft) } catch {}
    setNocCopied(true)
    setTimeout(() => setNocCopied(false), 2000)
  }

  function download() {
    const blob = new Blob([report], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `forensics-${String(inc.id).padStart(4,'0')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function copy() {
    try { await navigator.clipboard.writeText(report) } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Opens the user's mail client with a concise summary pre-filled, and
  // also triggers a PDF download so the full bundle can be attached
  // manually (browsers do not allow auto-attaching files to mailto links).
  // Body is kept short — mail clients truncate very long mailto URLs,
  // so the full report stays in the downloaded PDF/.txt.
  async function emailReport() {
    setEmailing(true)
    try {
      await generateCERTInReport(inc)
    } catch {
      // PDF generation failing shouldn't block the email draft
    }
    const subject = `CERT-In Forensics Bundle — ${incIdShort} — ${inc.victim?.name ?? 'Incident'}`
    const body =
      `A CERT-In forensics evidence bundle for incident ${incIdShort} has just been downloaded as a PDF — please attach it before sending.\n\n` +
      `Incident: ${inc.type?.replace(/_/g,' ')}\n` +
      `Victim: ${inc.victim?.name} (${inc.victim?.asn})\n` +
      `Severity: ${inc.severity} | Confidence: ${inc.confidence}%\n` +
      `Status: ${inc.status}\n\n` +
      `Generated by HexaSentinel — On-Device AI powered by Qualcomm AI Hub.`
    const mailto = `mailto:incident@cert-in.org.in?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = mailto
    setEmailing(false)
  }

  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, zIndex:1000,
      background:'rgba(0,0,0,0.6)', backdropFilter:'blur(2px)',
      display:'flex', alignItems:'center', justifyContent:'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width:'min(640px, 92vw)', maxHeight:'85vh',
        background:'rgba(8,12,18,0.98)', border:'1px solid rgba(255,107,0,0.3)',
        borderRadius:6, display:'flex', flexDirection:'column', overflow:'hidden',
        boxShadow:'0 0 40px rgba(255,107,0,0.15)',
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid var(--border-subtle)', flexShrink:0 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'#ff8c00', letterSpacing:'0.15em' }}>
            📋 FORENSICS EVIDENCE BUNDLE · #{String(inc.id).padStart(4,'0')}
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <Btn onClick={copy}>{copied ? '✓ COPIED' : 'COPY'}</Btn>
            <Btn onClick={download}>⬇ DOWNLOAD .TXT</Btn>
            <Btn onClick={emailReport}>{emailing ? '…' : '✉ EMAIL'}</Btn>
            <Btn onClick={draftNocEmail}>{nocLoading ? '…' : '📡 DRAFT NOC EMAIL'}</Btn>
            <button onClick={onClose} style={{
              fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-muted)',
              background:'none', border:'none', cursor:'pointer', padding:'2px 8px',
            }}>✕</button>
          </div>
        </div>
        <pre style={{
          fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--text-secondary)',
          lineHeight:1.7, padding:'14px 16px', margin:0,
          whiteSpace:'pre-wrap', wordBreak:'break-word', overflowY:'auto', flex:1,
        }}>
          {report}
        </pre>
        {(nocDraft || nocError) && (
          <div style={{
            borderTop:'1px solid var(--border-subtle)', padding:'12px 16px',
            background:'rgba(255,140,0,0.04)', flexShrink:0, maxHeight:'35vh', overflowY:'auto',
          }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'#ff8c00', letterSpacing:'0.1em' }}>
                📡 DRAFT ISP NOC NOTIFICATION
              </div>
              {nocDraft && <Btn onClick={copyNocDraft}>{nocCopied ? '✓ COPIED' : 'COPY'}</Btn>}
            </div>
            {nocError ? (
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-muted)' }}>{nocError}</div>
            ) : (
              <pre style={{
                fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--text-secondary)',
                lineHeight:1.7, margin:0, whiteSpace:'pre-wrap', wordBreak:'break-word',
              }}>
                {nocDraft}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Btn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontFamily:'var(--font-mono)', fontSize:8, padding:'3px 10px',
      background:'none', border:'1px solid rgba(255,140,0,0.4)',
      color:'#ff8c00', borderRadius:2, cursor:'pointer', letterSpacing:'0.05em',
    }}>
      {children}
    </button>
  )
}
