/**
 * Past Attacks & Origins Panel
 * Full-screen overlay with graphs and logs of all historical incidents
 */
import { useState } from 'react'
import { useSHYENStore } from '../../store/useSHYENStore.js'
import { exportIncidentsJSON } from '../../utils/jsonExport.js'
import Last24hSummary from '../summary/Last24hSummary.jsx'
import { SEVERITY_COLORS as SEV_COLOR, SEVERITY_ORDER as SEV_ORDER } from '../../utils/severity.js'

function MiniBar({ value, max, color }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, height:18 }}>
      <div style={{ flex:1, background:'rgba(255,255,255,0.05)', borderRadius:2, height:8, overflow:'hidden' }}>
        <div style={{ width:`${max > 0 ? (value/max)*100 : 0}%`, height:'100%', background:color, borderRadius:2, transition:'width 0.5s' }} />
      </div>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color, width:20, textAlign:'right' }}>{value}</span>
    </div>
  )
}

function SeverityDonut({ incidents }) {
  const counts = { CRITICAL:0, HIGH:0, MEDIUM:0, LOW:0 }
  for (const i of incidents) counts[i.severity] = (counts[i.severity] ?? 0) + 1
  const total = incidents.length || 1

  let offset = 0
  const segments = SEV_ORDER.map(sev => {
    const pct = (counts[sev] / total) * 100
    const seg = { sev, count: counts[sev], pct, offset }
    offset += pct
    return seg
  })

  return (
    <div style={{ display:'flex', alignItems:'center', gap:16 }}>
      <svg width={80} height={80} style={{ flexShrink:0 }}>
        {segments.map(({ sev, pct, offset }) => {
          if (pct === 0) return null
          const r = 28, circ = 2 * Math.PI * r
          return (
            <circle key={sev} cx={40} cy={40} r={r}
              fill="none" stroke={SEV_COLOR[sev]} strokeWidth={12}
              strokeDasharray={`${(pct/100)*circ} ${circ}`}
              strokeDashoffset={-((offset/100)*circ)}
              style={{ transform:'rotate(-90deg)', transformOrigin:'40px 40px' }} />
          )
        })}
        <text x={40} y={44} textAnchor="middle" fontFamily="var(--font-display)" fontSize={14} fontWeight={800} fill="white">{incidents.length}</text>
      </svg>
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {SEV_ORDER.map(sev => counts[sev] > 0 && (
          <div key={sev} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:SEV_COLOR[sev], flexShrink:0 }} />
            <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>{sev}</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:SEV_COLOR[sev], marginLeft:'auto', minWidth:20, textAlign:'right' }}>{counts[sev]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AttackHistoryPanel({ onClose }) {
  const incidents = useSHYENStore(s => s.incidents)
  const [view, setView] = useState('overview') // 'overview' | 'origins' | 'log'
  const [severityFilter, setSeverityFilter] = useState('All')

  // Overview stats count active incidents only (consistent with rest of dashboard)
  const activeIncidents = incidents.filter(i => i.status !== 'MITIGATED')

  // Origins breakdown
  const originCounts = {}
  for (const i of activeIncidents) {
    const c = i.attacker?.country ?? '??'
    originCounts[c] = (originCounts[c] ?? 0) + 1
  }
  const topOrigins = Object.entries(originCounts).sort((a,b) => b[1]-a[1]).slice(0,10)
  const maxOrigin  = topOrigins[0]?.[1] ?? 1

  // Sector breakdown
  const sectorCounts = {}
  for (const i of activeIncidents) {
    const s = i.victim?.sector ?? 'Unknown'
    sectorCounts[s] = (sectorCounts[s] ?? 0) + 1
  }
  const topSectors = Object.entries(sectorCounts).sort((a,b) => b[1]-a[1])
  const maxSector  = topSectors[0]?.[1] ?? 1

  // Attack type breakdown
  const typeCounts = {}
  for (const i of activeIncidents) {
    const t = i.type?.replace(/_/g,' ') ?? 'Unknown'
    typeCounts[t] = (typeCounts[t] ?? 0) + 1
  }

  const mitigated = incidents.filter(i => i.status === 'MITIGATED').length
  const active    = incidents.filter(i => i.status === 'DETECTED').length

  const COUNTRY_NAMES = {
    CN:'China', PK:'Pakistan', US:'USA', DE:'Germany', IT:'Italy', AU:'Australia',
    JP:'Japan', EG:'Egypt', RU:'Russia', GB:'UK', NL:'Netherlands', FR:'France',
    BR:'Brazil', SG:'Singapore', '??':'Unknown',
  }

  const filtered = severityFilter === 'All' ? incidents : incidents.filter(i => i.severity === severityFilter.toUpperCase())

  const TABS = [
    { key:'overview', label:'OVERVIEW' },
    { key:'origins',  label:'ORIGINS' },
    { key:'log',      label:'FULL LOG' },
  ]

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:200,
      background:'rgba(4,7,14,0.97)', overflowY:'auto',
      animation:'fadeIn 0.2s ease-out',
    }}>
      {/* Header */}
      <div style={{ position:'sticky', top:0, background:'rgba(4,7,14,0.98)', borderBottom:'1px solid var(--border-subtle)', padding:'12px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', zIndex:10 }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:800 }}>PAST ATTACKS & ORIGIN ANALYSIS</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)', marginTop:2 }}>
            {incidents.length} total incidents · {active} active · {mitigated} mitigated
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => exportIncidentsJSON(incidents)} style={{
            fontFamily:'var(--font-mono)', fontSize:9, color:'var(--accent-blue)',
            background:'rgba(0,191,255,0.08)', border:'1px solid rgba(0,191,255,0.4)',
            borderRadius:4, padding:'6px 14px', cursor:'pointer',
          }}>⬇ EXPORT JSON</button>
          <button onClick={onClose} style={{
            fontFamily:'var(--font-mono)', fontSize:9, color:'#ff2d55',
            background:'rgba(255,45,85,0.08)', border:'1px solid rgba(255,45,85,0.45)',
            borderRadius:4, padding:'6px 14px', cursor:'pointer', boxShadow:'0 0 8px rgba(255,45,85,0.3)',
          }}>✕ CLOSE</button>
        </div>
      </div>
      <div style={{ display:'flex', borderBottom:'1px solid var(--border-subtle)', padding:'0 24px', background:'rgba(4,7,14,0.95)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setView(t.key)} style={{
            fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.1em',
            padding:'10px 20px', background:'none', border:'none', cursor:'pointer',
            color: view === t.key ? 'var(--accent-green)' : 'var(--text-muted)',
            borderBottom:`2px solid ${view === t.key ? 'var(--accent-green)' : 'transparent'}`,
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding:'24px' }}>
        {/* OVERVIEW */}
        {view === 'overview' && (
          <div>
            <Last24hSummary />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:20 }}>
            {/* Severity distribution */}
            <div style={{ background:'rgba(10,18,28,0.8)', border:'1px solid var(--border-subtle)', borderRadius:6, padding:16 }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:700, marginBottom:14 }}>SEVERITY DISTRIBUTION</div>
              <SeverityDonut incidents={incidents} />
            </div>

            {/* Attack types */}
            <div style={{ background:'rgba(10,18,28,0.8)', border:'1px solid var(--border-subtle)', borderRadius:6, padding:16 }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:700, marginBottom:14 }}>ATTACK TYPES</div>
              {Object.entries(typeCounts).map(([type, count]) => (
                <div key={type} style={{ marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>{type}</span>
                  </div>
                  <MiniBar value={count} max={incidents.length} color="var(--accent-blue)" />
                </div>
              ))}
            </div>

            {/* Sector targets */}
            <div style={{ background:'rgba(10,18,28,0.8)', border:'1px solid var(--border-subtle)', borderRadius:6, padding:16 }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:700, marginBottom:14 }}>TARGETED SECTORS</div>
              {topSectors.map(([sector, count]) => (
                <div key={sector} style={{ marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>{sector}</span>
                  </div>
                  <MiniBar value={count} max={maxSector} color="var(--accent-amber)" />
                </div>
              ))}
            </div>

            {/* Summary stats */}
            <div style={{ background:'rgba(10,18,28,0.8)', border:'1px solid var(--border-subtle)', borderRadius:6, padding:16, gridColumn:'1/-1' }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:700, marginBottom:14 }}>SUMMARY</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:12 }}>
                {[
                  ['Total Incidents',    incidents.length,  'var(--text-primary)'],
                  ['Active',             active,            'var(--accent-red)'],
                  ['Mitigated',          mitigated,         '#30d158'],
                  ['Unique Origins',     Object.keys(originCounts).filter(c=>c!=='??').length, 'var(--accent-blue)'],
                  ['Repeat Attackers',   incidents.filter(i=>i.isRepeatAttacker).length, '#ff6b00'],
                ].map(([label, value, color]) => (
                  <div key={label} style={{ textAlign:'center', padding:'12px 0', background:'rgba(255,255,255,0.02)', borderRadius:4 }}>
                    <div style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:800, color, lineHeight:1 }}>{value}</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', marginTop:4 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          </div>
        )}

        {/* ORIGINS */}
        {view === 'origins' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
            <div style={{ background:'rgba(10,18,28,0.8)', border:'1px solid var(--border-subtle)', borderRadius:6, padding:16 }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:700, marginBottom:14 }}>TOP ATTACK ORIGINS</div>
              {topOrigins.map(([code, count]) => (
                <div key={code} style={{ marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-primary)' }}>
                      {COUNTRY_NAMES[code] ?? code}
                    </span>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--accent-red)' }}>{count}</span>
                  </div>
                  <MiniBar value={count} max={maxOrigin} color="var(--accent-red)" />
                </div>
              ))}
            </div>

            <div style={{ background:'rgba(10,18,28,0.8)', border:'1px solid var(--border-subtle)', borderRadius:6, padding:16 }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:700, marginBottom:14 }}>ATTACKER ASN BREAKDOWN</div>
              {(() => {
                const asnCounts = {}
                for (const i of incidents) {
                  const a = i.attacker?.asn ?? 'Unknown'
                  asnCounts[a] = (asnCounts[a] ?? 0) + 1
                }
                const top = Object.entries(asnCounts).sort((a,b)=>b[1]-a[1]).slice(0,8)
                const max = top[0]?.[1] ?? 1
                return top.map(([asn, count]) => (
                  <div key={asn} style={{ marginBottom:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>{asn}</span>
                      <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'#ff6b00' }}>{count}x</span>
                    </div>
                    <MiniBar value={count} max={max} color="#ff6b00" />
                  </div>
                ))
              })()}
            </div>
          </div>
        )}

        {/* FULL LOG */}
        {view === 'log' && (
          <>
            <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' }}>
              {['All','Critical','High','Medium','Low'].map(f => (
                <button key={f} onClick={() => setSeverityFilter(f)} style={{
                  fontFamily:'var(--font-mono)', fontSize:9, padding:'4px 12px', borderRadius:3, cursor:'pointer',
                  background: severityFilter === f ? (f === 'All' ? 'var(--accent-green)' : SEV_COLOR[f.toUpperCase()]) : 'rgba(255,255,255,0.03)',
                  color: severityFilter === f ? '#000' : 'var(--text-muted)',
                  border:`1px solid ${severityFilter === f ? (f === 'All' ? 'var(--accent-green)' : SEV_COLOR[f.toUpperCase()]) : 'var(--border-subtle)'}`,
                  fontWeight: severityFilter === f ? 700 : 400,
                }}>{f}</button>
              ))}
              <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)', padding:'4px 0' }}>
                {filtered.length} incidents
              </span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {filtered.map(inc => (
                <div key={inc.id} style={{
                  display:'grid', gridTemplateColumns:'80px 100px 1fr 120px 100px 80px',
                  gap:12, padding:'10px 14px', alignItems:'center',
                  background:'rgba(10,18,28,0.92)', border:`1px solid ${SEV_COLOR[inc.severity] ?? '#333'}33`,
                  borderLeft:`3px solid ${SEV_COLOR[inc.severity] ?? '#333'}`,
                  borderRadius:4,
                }}>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:SEV_COLOR[inc.severity], fontWeight:700 }}>{inc.severity}</span>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>{new Date(inc.timestamp).toISOString().slice(11,19)} UTC</span>
                  <div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-primary)' }}>🇮🇳 {inc.victim?.name}</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>{inc.prefix}</div>
                  </div>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-secondary)' }}>{inc.type?.replace(/_/g,' ')}</span>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>{inc.attacker?.asn} [{inc.attacker?.country ?? '??'}]</span>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color: inc.status === 'MITIGATED' ? '#30d158' : 'var(--accent-red)', textAlign:'right' }}>{inc.status}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
