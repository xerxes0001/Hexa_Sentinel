// Feature #71 — Last 24h summary panel
import { useMemo } from 'react'
import { useSHYENStore } from '../../store/useSHYENStore.js'

export default function Last24hSummary() {
  const incidents = useSHYENStore(s => s.incidents)
  const now = Date.now()
  const window24h = 24 * 3600 * 1000

  const stats = useMemo(() => {
    const recent = incidents.filter(i => now - new Date(i.timestamp).getTime() < window24h)
    return {
      detected:    recent.length,
      // Real incidents never reach MITIGATED (SHYEN generates countermeasures,
      // it doesn't deploy them) — this counts countermeasure generation + any demo mitigations.
      mitigated:   recent.filter(i => i.countermeasuresReady || i.status === 'MITIGATED').length,
      investigating: recent.filter(i => i.status === 'DETECTED' && i.forensicsReady).length,
      critical:    recent.filter(i => i.severity === 'CRITICAL').length,
      high:        recent.filter(i => i.severity === 'HIGH').length,
      rpkiPushed:  recent.filter(i => i.rpkiPushed).length,
    }
  }, [incidents])

  const items = [
    { label:'Detected',      value:stats.detected,      color:'#ff6b00' },
    { label:'Countermeasures', value:stats.mitigated,     color:'#30d158' },
    { label:'Investigating', value:stats.investigating,  color:'#00bfff' },
    { label:'Critical',      value:stats.critical,       color:'#ff2d55' },
    { label:'High',          value:stats.high,           color:'#ffd60a' },
    { label:'RPKI Pushed',   value:stats.rpkiPushed,     color:'#30d158' },
  ]

  return (
    <div style={{ background:'rgba(6,10,18,0.85)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:4, padding:'10px 12px', marginBottom:10 }}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:8, fontWeight:700, color:'var(--text-secondary)', letterSpacing:2, marginBottom:10 }}>
        LAST 24H SUMMARY
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
        {items.map(item => (
          <div key={item.label} style={{ textAlign:'center', padding:'6px 4px', background:'rgba(255,255,255,0.02)', borderRadius:3, border:'1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:20, fontWeight:800, color:item.color, lineHeight:1.1 }}>{item.value}</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:7, color:'var(--text-muted)', marginTop:2, letterSpacing:0.5 }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
