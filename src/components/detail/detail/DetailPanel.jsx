import { useState, useEffect, lazy, Suspense } from 'react'
import { useSHYENStore }    from '../../store/useSHYENStore.js'
import SeverityBadge        from '../shared/SeverityBadge.jsx'
import VantageMatrix        from './VantageMatrix.jsx'
import RPKIStatus           from './RPKIStatus.jsx'
import ConversationalQuery  from './ConversationalQuery.jsx'
import AIAnalysis           from './AIAnalysis.jsx'
import ActivityLog          from './ActivityLog.jsx'
import { generateCERTInReport } from '../../utils/pdfExport.js'
import ResponseActions from './ResponseActions.jsx'
import BlastRadiusPanel from './BlastRadiusPanel.jsx'
import ExecutionSimulation from './ExecutionSimulation.jsx'
import { detectCampaigns } from '../../engine/campaignDetection.js'
import { matchPrecedents } from '../../data/historicalPrecedents.js'

// Modal, only opened on click — no reason to ship in the main bundle.
const ForensicsReport = lazy(() => import('./ForensicsReport.jsx'))

const SEV_COLOR     = { CRITICAL:'var(--accent-red)', HIGH:'var(--accent-orange)', MEDIUM:'var(--accent-amber)', LOW:'#30d158' }
const SECTOR_COLORS = { Financial:'#ff2d55', Government:'#ffd60a', Defense:'#ff6b00', Telecom:'#00bfff', ISP:'#00ff88', IXP:'#bf5af2' }

export default function DetailPanel({ incident: inc }) {
  const addActivityLog = useSHYENStore(s => s.addActivityLog)
  const triggerAction  = useSHYENStore(s => s.triggerAction)
  const allIncidents   = useSHYENStore(s => s.incidents)
  const selectIncident  = useSHYENStore(s => s.selectIncident)
  const [showForensics, setShowForensics] = useState(false)
  const [responseTab, setResponseTab] = useState('countermeasures') // 'countermeasures' | 'execution'
  const [mainTab, setMainTab] = useState('overview') // 'overview' | 'intel' | 'response' | 'blast' | 'log'

  // DetailPanel doesn't remount when switching between incidents (same
  // component instance, inc prop just changes) — without this, selecting a
  // different incident from the feed kept whatever tab was previously
  // open (e.g. landing straight on Blast Radius for a brand-new incident),
  // which is confusing during a live demo.
  useEffect(() => { setMainTab('overview') }, [inc.id])

  async function handleForensics() {
    triggerAction(inc.id, 'forensics')
    setShowForensics(true)
    addActivityLog?.('SUCCESS', `Forensics evidence bundle compiled for ${inc.victim?.name}`, inc.id)
  }
  const color      = SEV_COLOR[inc.severity] ?? '#30d158'
  const ts         = inc.timestamp ? new Date(inc.timestamp) : new Date()
  const incId      = `INC-${ts.getFullYear()}-${String(ts.getMonth()+1).padStart(2,'0')}${String(ts.getDate()).padStart(2,'0')}-${String(inc.id).padStart(4,'0')}`

  // Campaign detection — does this incident share attacker infrastructure
  // with other active incidents against different victims?
  const campaigns = detectCampaigns(allIncidents)
  const campaign  = campaigns.find(c => c.incidentIds.includes(inc.id)) ?? null

  // Historical precedent matching — real, documented incidents matching
  // this attack's signature.
  const precedents = matchPrecedents(inc)

  const MAIN_TABS = [
    { key: 'overview', label: 'OVERVIEW', icon: '◈' },
    { key: 'intel',    label: 'INTEL', icon: '🧠' },
    { key: 'response', label: 'RESPONSE', icon: '⚡' },
    { key: 'blast',    label: 'BLAST', icon: '💥' },
    { key: 'log',      label: 'LOG', icon: '📜' },
  ]

  return (
    <div style={{ animation:'fadeIn 0.25s ease-out' }}>

      {/* AI SOC ANALYST header — always visible, above the tabs */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:14, fontWeight:800, letterSpacing:'-0.01em' }}>AI SOC ANALYST</div>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--accent-purple)', letterSpacing:'0.08em' }}>Powered by Groq ›</span>
      </div>

      {/* Incident header — always visible, above the tabs, so context never
          scrolls away no matter which tab a judge is looking at */}
      <div style={{ padding:'10px 12px', background:'rgba(10,18,28,0.92)', border:`1px solid ${color}33`, borderRadius:4, marginBottom:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
          <SeverityBadge severity={inc.severity} />
          <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)' }}>{incId}</span>
          {inc.isRealData  && <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'#00ff88', border:'1px solid #00ff8844', borderRadius:2, padding:'1px 5px' }}>● LIVE</span>}
          {inc.isSimulated && <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'#bf5af2', border:'1px solid #bf5af244', borderRadius:2, padding:'1px 5px' }}>⚡ SIM</span>}
          {inc.aiDecided   && <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'#00bfff', border:'1px solid #00bfff44', borderRadius:2, padding:'1px 5px' }}>◈ AI ACTED</span>}
          {inc.aiAlerted && !inc.aiDecided && <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'#ffd60a', border:'1px solid #ffd60a44', borderRadius:2, padding:'1px 5px' }}>⚠ AI ALERT</span>}
          {inc.flagged && <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'#ff6b00', border:'1px solid #ff6b0044', borderRadius:2, padding:'1px 5px' }}>🚩 FLAGGED</span>}
          {inc.coordinatedAttack && <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'#ff2d55', border:'1px solid #ff2d5566', borderRadius:2, padding:'1px 5px', animation:'glowPulse 1.5s ease-in-out infinite' }}>⚠ COORDINATED ATTACK</span>}
        </div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:14, fontWeight:700, marginBottom:3 }}>🇮🇳 {inc.victim?.name}</div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)' }}>{inc.type?.replace(/_/g,' ')} · {inc.prefix}</div>
      </div>

      {/* Tab bar */}
      <div style={{
        display:'flex', gap:2, marginBottom:12, borderBottom:'1px solid var(--border-subtle)',
        overflowX:'auto',
      }}>
        {MAIN_TABS.map(tab => (
          <button key={tab.key} onClick={() => setMainTab(tab.key)} style={{
            fontFamily:'var(--font-mono)', fontSize:8, fontWeight:700, letterSpacing:0.3,
            padding:'8px 7px', whiteSpace:'nowrap', cursor:'pointer', flex:'1 1 0',
            background:'none', border:'none', borderBottom:`2px solid ${mainTab === tab.key ? color : 'transparent'}`,
            color: mainTab === tab.key ? color : 'var(--text-muted)',
            transition:'all 0.15s',
          }}>
            {tab.icon} {tab.label}
            {tab.key === 'response' && inc.isSimulated && <span style={{ color:'var(--accent-purple)' }}> •</span>}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
      {mainTab === 'overview' && (
        <div>
          {inc.coordinatedAttack && (
            <div style={{
              padding: '10px 14px', marginBottom: 10,
              background: 'rgba(255,45,85,0.08)', border: '1px solid rgba(255,45,85,0.4)',
              borderRadius: 4,
            }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: '#ff2d55', letterSpacing: 1, marginBottom: 4 }}>
                ⚠ COORDINATED ATTACK DETECTED — ROUTING + PKI LAYER
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                A TLS certificate for <span style={{ color: '#fff', fontWeight: 700 }}>{inc.coordinatedAttack.domain}</span> was
                issued by "{inc.coordinatedAttack.certIssuer}" just {Math.round(inc.coordinatedAttack.windowMs / 60000)} minutes
                from this hijack — the same pattern used in real incidents like the 2018 MyEtherWallet and 2022 KLAYswap attacks,
                where routing hijack + fraudulent cert together let attackers serve a fully "valid-looking" phishing site.
              </div>
            </div>
          )}

          {campaign && (
            <div style={{
              padding: '10px 14px', marginBottom: 10,
              background: 'rgba(255,107,0,0.08)', border: '1px solid rgba(255,107,0,0.4)',
              borderRadius: 4,
            }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 4 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: '#ff6b00', letterSpacing: 1 }}>
                  🎯 PART OF ACTIVE CAMPAIGN — {campaign.victimCount} TARGETS
                </div>
                <span style={{
                  fontFamily:'var(--font-mono)', fontSize:7, padding:'2px 6px', borderRadius:2,
                  color: campaign.correlationType === 'same-asn' ? '#ff6b00' : '#ffd60a',
                  border: `1px solid ${campaign.correlationType === 'same-asn' ? '#ff6b0066' : '#ffd60a66'}`,
                }}>
                  {campaign.correlationType === 'same-asn' ? 'STRONG SIGNAL — SAME ASN' : 'MODERATE SIGNAL — SAME COUNTRY, DIFFERENT ASNs'}
                </span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 8 }}>
                {campaign.correlationType === 'same-asn' ? (
                  <><span style={{ color: '#fff', fontWeight: 700 }}>{campaign.attackerName}</span> ({campaign.attackerAsn}) has hit{' '}
                  {campaign.victimCount} different networks across {campaign.sectors.join(', ')} in this window — the exact same
                  attacker ASN, so this is unambiguously one actor running a coordinated campaign, not isolated events.</>
                ) : (
                  <>{campaign.attackerAsns.length} different attacker ASNs — all registered in {campaign.attackerCountry} — hit{' '}
                  {campaign.victimCount} different networks across {campaign.sectors.join(', ')} in this window. Different
                  infrastructure could be coincidence, so treat this as a weaker signal worth investigating, not a confirmed
                  single actor.</>
                )}
              </div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {campaign.incidents.filter(i => i.id !== inc.id).map(i => (
                  <button key={i.id} onClick={() => selectIncident(i.id)} style={{
                    fontFamily:'var(--font-mono)', fontSize:8, padding:'4px 9px', borderRadius:2, cursor:'pointer',
                    background:'rgba(255,107,0,0.1)', border:'1px solid rgba(255,107,0,0.4)', color:'#ff6b00',
                  }}>
                    → {i.victim?.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, color:'var(--text-secondary)', letterSpacing:'0.1em', marginBottom:6 }}>ATTACK VECTOR</div>
            <div style={{ padding:'8px 10px', background:'rgba(255,255,255,0.02)', border:'1px solid var(--border-subtle)', borderRadius:3 }}>
              {[
                ['Type',             inc.type?.replace(/_/g,' ')],
                ['Attacker ASN',     inc.attacker?.asn],
                ['Target ASN',       inc.victim?.asn],
                ['Affected Prefix',  inc.prefix],
                ['First Seen',       inc.timestamp ? new Date(inc.timestamp).toISOString().replace('T',' ').slice(0,19)+' UTC' : '—'],
                ['Confidence',       `${inc.confidence}%`],
              ].map(([k,v]) => (
                <div key={k} style={{ display:'flex', gap:8, marginBottom:3 }}>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', minWidth:90 }}>• {k}</span>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-secondary)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {inc.confidenceBreakdown && (
            <div style={{ marginBottom:10 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, color:'var(--text-secondary)', letterSpacing:'0.1em', marginBottom:6 }}>
                CONFIDENCE BREAKDOWN — WHY {inc.confidence}%?
              </div>
              <div style={{ padding:'8px 10px', background:'rgba(255,255,255,0.02)', border:'1px solid var(--border-subtle)', borderRadius:3 }}>
                {inc.confidenceBreakdown.map((f, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-secondary)' }}>{f.label}</span>
                    <span style={{
                      fontFamily:'var(--font-mono)', fontSize:8, fontWeight:700, flexShrink:0, marginLeft:8,
                      color: f.points > 0 ? '#ff6b00' : f.points < 0 ? '#30d158' : 'var(--text-muted)',
                    }}>
                      {f.points > 0 ? '+' : ''}{f.points}
                    </span>
                  </div>
                ))}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:6, paddingTop:6, borderTop:'1px solid var(--border-subtle)' }}>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:8.5, fontWeight:700, color:'var(--text-primary)' }}>TOTAL</span>
                  <span style={{ fontFamily:'var(--font-display)', fontSize:11, fontWeight:800, color }}>{inc.confidence}%</span>
                </div>
              </div>
            </div>
          )}

          <RPKIStatus asn={inc.victim?.asn} prefix={inc.prefix} presetStatus={inc.rpkiStatus} />

          {inc.aiAlerted && inc.aiAlert && !inc.aiDecided && (
            <div style={{ marginBottom:10, padding:'10px 12px', background:'rgba(255,214,10,0.05)', border:'1px solid rgba(255,214,10,0.25)', borderRadius:4 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'#ffd60a', letterSpacing:'0.12em', marginBottom:6, fontWeight:700 }}>
                ⚠ ANOMALY ALERT — LOW CONFIDENCE
              </div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'#00bfff', marginBottom:8, lineHeight:1.6 }}>
                ◈ AI ACTED AUTONOMOUSLY: flagged for review &amp; alerted IXPs
                <br/>→ RPKI push <span style={{ color:'#ffd60a' }}>suggested</span> — review and trigger manually in the RESPONSE tab
              </div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-secondary)', marginBottom:8, lineHeight:1.6 }}>
                {inc.aiAlert.summary}
              </div>
              {inc.aiAlert.safeguards?.length > 0 && (
                <div style={{ marginBottom:6 }}>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', marginBottom:4, letterSpacing:'0.08em' }}>SAFEGUARDING MEASURES:</div>
                  {inc.aiAlert.safeguards.map((s, i) => (
                    <div key={i} style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-secondary)', marginBottom:2, paddingLeft:8 }}>
                      – {s}
                    </div>
                  ))}
                </div>
              )}
              {inc.aiAlert.monitorFor && (
                <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', marginBottom:3 }}>
                  <span style={{ color:'#ffd60a' }}>MONITOR: </span>{inc.aiAlert.monitorFor}
                </div>
              )}
              {inc.aiAlert.escalateIf && (
                <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>
                  <span style={{ color:'#ff6b00' }}>ESCALATE IF: </span>{inc.aiAlert.escalateIf}
                </div>
              )}
            </div>
          )}

          <div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, color:'var(--text-secondary)', letterSpacing:'0.1em', marginBottom:6 }}>VANTAGE MATRIX</div>
            <VantageMatrix incident={inc} />
          </div>
        </div>
      )}

      {/* ── AI & INTEL ───────────────────────────────────────────────── */}
      {mainTab === 'intel' && (
        <div>
          <div style={{ marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, color:'var(--text-secondary)', letterSpacing:'0.1em', marginBottom:6 }}>THREAT SUMMARY</div>
            <AIAnalysis incident={inc} compact />
          </div>

          {precedents.length > 0 && (
            <div style={{ marginBottom:10 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, color:'var(--text-secondary)', letterSpacing:'0.1em', marginBottom:6 }}>HISTORICAL PRECEDENT</div>
              {precedents.map(p => (
                <div key={p.id} style={{
                  padding: '9px 11px', marginBottom: 6,
                  background: 'rgba(0,191,255,0.04)', border: '1px solid rgba(0,191,255,0.25)', borderRadius: 4,
                }}>
                  <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:6, marginBottom:4 }}>
                    <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
                      <span style={{ fontFamily:'var(--font-display)', fontSize:10, fontWeight:700, color:'var(--accent-blue)' }}>{p.name}</span>
                      <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>({p.year})</span>
                    </div>
                    <span style={{
                      fontFamily:'var(--font-mono)', fontSize:8, fontWeight:700, flexShrink:0,
                      color: p.matchScore >= 80 ? '#30d158' : p.matchScore >= 50 ? '#ffd60a' : 'var(--text-muted)',
                    }}>
                      {p.matchScore}% MATCH
                    </span>
                  </div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-secondary)', lineHeight:1.6, marginBottom:5 }}>
                    {p.summary}
                  </div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'#00bfff', lineHeight:1.6, marginBottom:4 }}>
                    → {p.lesson}
                  </div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:7, color:'var(--text-muted)', fontStyle:'italic' }}>
                    Source: {p.source}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, color:'var(--text-secondary)', letterSpacing:'0.1em', marginBottom:6 }}>RECOMMENDED ACTIONS</div>
            <div style={{ padding:'8px 10px', background:'rgba(255,255,255,0.02)', border:'1px solid var(--border-subtle)', borderRadius:3 }}>
              {[
                { label:'Push RPKI Invalidation', done: inc.rpkiPushed },
                { label:'Alert IXPs',             done: inc.ixpAlerted },
                { label:'Generate Forensics Report', done: inc.forensicsReady },
              ].map(({ label, done }) => (
                <div key={label} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <div style={{ width:16, height:16, borderRadius:'50%', background: done ? 'rgba(48,209,88,0.2)' : 'rgba(255,255,255,0.05)', border:`1px solid ${done ? '#30d158' : 'var(--border-subtle)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    {done && <span style={{ color:'#30d158', fontSize:9 }}>✓</span>}
                  </div>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color: done ? '#30d158' : 'var(--text-secondary)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <ConversationalQuery compact incidentId={inc.id} />
        </div>
      )}

      {/* ── RESPONSE ─────────────────────────────────────────────────── */}
      {mainTab === 'response' && (
        <div>
          {inc.isSimulated && (
            <div style={{ display:'flex', gap:6, marginBottom:8 }}>
              <button onClick={() => setResponseTab('countermeasures')} style={{
                fontFamily:'var(--font-mono)', fontSize:8, padding:'6px 12px', borderRadius:2, cursor:'pointer',
                background: responseTab === 'countermeasures' ? 'rgba(0,191,255,0.15)' : 'none',
                border:`1px solid ${responseTab === 'countermeasures' ? 'var(--accent-blue)' : 'var(--border-mid)'}`,
                color: responseTab === 'countermeasures' ? 'var(--accent-blue)' : 'var(--text-muted)',
              }}>COUNTERMEASURES</button>
              <button onClick={() => setResponseTab('execution')} style={{
                fontFamily:'var(--font-mono)', fontSize:8, padding:'6px 12px', borderRadius:2, cursor:'pointer',
                background: responseTab === 'execution' ? 'rgba(191,90,242,0.15)' : 'none',
                border:`1px solid ${responseTab === 'execution' ? 'var(--accent-purple)' : 'var(--border-mid)'}`,
                color: responseTab === 'execution' ? 'var(--accent-purple)' : 'var(--text-muted)',
              }}>🎬 EXECUTION (DEMO)</button>
            </div>
          )}

          {inc.isSimulated && responseTab === 'execution'
            ? <ExecutionSimulation incident={inc} />
            : <ResponseActions incident={inc} />
          }
          {inc.forensicsReady && (
            <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'#30d158', marginBottom:6, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <button onClick={async () => { try { await generateCERTInReport(inc); addActivityLog?.('SUCCESS', `CERT-In PDF downloaded`, inc.id) } catch { addActivityLog?.('INFO', `PDF export failed`, inc.id) } }} style={{
                fontFamily:'var(--font-mono)', fontSize:8, color:'#00bfff',
                background:'none', border:'1px solid rgba(0,191,255,0.35)',
                borderRadius:2, padding:'1px 6px', cursor:'pointer',
              }}>⬇ DOWNLOAD PDF</button>
              <button onClick={() => setShowForensics(true)} style={{
                fontFamily:'var(--font-mono)', fontSize:8, color:'#ff8c00',
                background:'none', border:'1px solid rgba(255,140,0,0.35)',
                borderRadius:2, padding:'1px 6px', cursor:'pointer',
              }}>✉ EMAIL REPORT</button>
            </div>
          )}
        </div>
      )}

      {/* ── BLAST RADIUS ─────────────────────────────────────────────── */}
      {mainTab === 'blast' && (
        <BlastRadiusPanel incident={inc} />
      )}

      {/* ── ACTIVITY LOG ─────────────────────────────────────────────── */}
      {mainTab === 'log' && (
        <ActivityLog />
      )}

      {showForensics && <Suspense fallback={null}><ForensicsReport incident={inc} onClose={() => setShowForensics(false)} /></Suspense>}

      {/* VIEW FORENSICS — always-visible button at bottom, regardless of tab */}
      <div style={{ marginTop:12, paddingTop:10, borderTop:'1px solid var(--border-subtle)' }}>
        <button
          onClick={handleForensics}
          style={{
            width:'100%', fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700,
            letterSpacing:'0.1em', padding:'9px 0', borderRadius:4, cursor:'pointer',
            background: inc.forensicsReady ? 'rgba(255,140,0,0.12)' : 'rgba(255,140,0,0.06)',
            border:`1px solid ${inc.forensicsReady ? 'rgba(255,140,0,0.55)' : 'rgba(255,140,0,0.25)'}`,
            color: inc.forensicsReady ? '#ff8c00' : 'rgba(255,140,0,0.55)',
            transition:'all 0.2s',
          }}
        >
          {inc.forensicsReady ? '📋 VIEW FORENSICS EVIDENCE BUNDLE' : '🔍 COMPILE & VIEW FORENSICS'}
        </button>
      </div>
    </div>
  )
}
