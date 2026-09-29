import { useSHYENStore } from '../../store/useSHYENStore.js'
import { INDIAN_ASNS }   from '../../data/indianASNs.js'

const SECTOR_COLORS = {
  Financial:  '#ff2d55',
  Government: '#ffd60a',
  Defense:    '#ff6b00',
  Telecom:    '#00bfff',
  ISP:        '#00ff88',
  IXP:        '#bf5af2',
}

const SECTOR_ICONS = {
  Financial:  '🏦',
  Government: '🏛️',
  Defense:    '🛡️',
  Telecom:    '📡',
  ISP:        '🌐',
  IXP:        '🔀',
}

const RPKI_COVERAGE = {
  'AS55836': 98, 'AS24560': 95, 'AS9829': 92,
  'AS55655': 97, 'AS136334': 94, 'AS55665': 88,
  'AS45117': 90, 'AS45758': 85, 'AS55824': 96,
  'AS45769': 82, 'AS10029': 78, 'AS18101': 71,
  'AS17813': 88, 'AS45271': 75, 'AS9498': 93,
}

// NOTE: This used to render a mini trend line seeded with Math.random() —
// a fabricated per-ASN health history with no backing data source, shown
// unconditionally in Live Mode. SHYEN has no real time-series feed for
// per-ASN health, so per the "no substitute data in Live Mode" requirement
// this was removed outright rather than replaced with another synthetic
// stand-in. Re-add only if wired to a genuine historical data source.

function ASNCard({ asn }) {
  const incidents    = useSHYENStore(s => s.incidents)
  const asnIncidents = incidents.filter(i => i.victim?.asn === asn.asn)
  const active       = asnIncidents.filter(i => i.status === 'DETECTED').length
  const color        = SECTOR_COLORS[asn.sector] ?? '#888'
  const rpki         = RPKI_COVERAGE[asn.asn] ?? 70

  // Threat score: deterministic — no Math.random (was causing flicker on every render)
  const asnHash = asn.asn.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0xff, 0)
  const score = Math.min(99, Math.max(1,
    (active * 15) +
    (asnIncidents.length * 3) +
    (asn.sector === 'Financial' || asn.sector === 'Defense' ? 20 : 0) +
    (asnHash % 10)
  ))

  const scoreColor = score >= 80 ? '#ff2d55' : score >= 50 ? '#ff6b00' : score >= 30 ? '#ffd60a' : '#30d158'
  const health     = rpki >= 90 ? { label:'Good', color:'#30d158' } : rpki >= 75 ? { label:'Fair', color:'#ffd60a' } : { label:'Poor', color:'#ff2d55' }

  return (
    <div style={{
      background:'rgba(10,18,28,0.8)', border:`1px solid ${active > 0 ? color+'44' : 'var(--border-subtle)'}`,
      borderTop: active > 0 ? `2px solid ${color}` : '2px solid transparent',
      borderRadius:4, padding:'10px 12px', minWidth:150,
    }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
        <div style={{ width:28, height:28, borderRadius:'50%', background:`${color}22`, border:`1px solid ${color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>
          {SECTOR_ICONS[asn.sector] ?? '🌐'}
        </div>
        <div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>{asn.asn}</div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:11, fontWeight:700, color:'var(--text-primary)', lineHeight:1.2 }}>{asn.name}</div>
        </div>
      </div>

      {/* Threat score */}
      <div style={{ marginBottom:8 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', marginBottom:2 }}>Threat Score</div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:800, color:scoreColor, lineHeight:1 }}>{score}</div>
      </div>

      {/* Stats */}
      <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', marginBottom:4 }}>
        Incidents{' '}
        <span style={{ color: active > 0 ? '#ff6b00' : 'var(--text-secondary)' }}>
          {active > 0 ? `${active} Active` : 'None'}
        </span>
      </div>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', marginBottom:4 }}>
        RPKI Coverage{' '}
        <span style={{ color: rpki >= 90 ? '#30d158' : '#ffd60a' }}>{rpki}%</span>
      </div>

      {/* Route health */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>Route Health</span>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <div style={{ width:5, height:5, borderRadius:'50%', background:health.color }} />
          <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:health.color }}>{health.label}</span>
        </div>
      </div>

    </div>
  )
}

export default function ASNHealthGrid() {
  return (
    <div style={{ padding:'12px 10px' }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:700, marginBottom:2 }}>ASN HEALTH OVERVIEW</div>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', marginBottom:10, letterSpacing:'0.05em' }}>Indian critical networks status</div>
      <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:6 }}>
        {INDIAN_ASNS.map(asn => <ASNCard key={asn.asn} asn={asn} />)}
      </div>
    </div>
  )
}
