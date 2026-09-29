/**
 * Full-page view of all attacks originating from a given country.
 */
import { useSHYENStore } from '../../store/useSHYENStore.js'
import { WORLD_COUNTRIES } from '../../data/worldCountries.js'
import { SEVERITY_COLORS as SEV_COLOR } from '../../utils/severity.js'

export default function CountryHistoryPage({ countryCode, onBack }) {
  const incidents = useSHYENStore(s => s.incidents)
  const selectIncident = useSHYENStore(s => s.selectIncident)

  const country = WORLD_COUNTRIES.find(c => c[0] === countryCode)
  const countryName = country?.[1] ?? countryCode

  const attacks = incidents
    .filter(i => i.attacker?.country === countryCode)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  const sevCounts = { CRITICAL:0, HIGH:0, MEDIUM:0, LOW:0 }
  for (const a of attacks) sevCounts[a.severity] = (sevCounts[a.severity] ?? 0) + 1

  const asnSet = new Set(attacks.map(a => a.attacker?.asn))
  const repeatAttackers = attacks.filter(a => a.isRepeatAttacker).length

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:200,
      background:'#06090f', overflowY:'auto',
      animation:'fadeIn 0.2s ease-out',
    }}>
      <div style={{ maxWidth:920, margin:'0 auto', padding:'24px 20px 60px' }}>

        <button onClick={onBack} style={{
          background:'rgba(0,255,136,0.06)', border:'1px solid rgba(0,255,136,0.3)', color:'var(--accent-green)',
          fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:1, padding:'6px 14px',
          borderRadius:4, cursor:'pointer', marginBottom:18, boxShadow:'0 0 8px rgba(0,255,136,0.15)',
        }}>
          ← BACK TO MAP
        </button>

        <div style={{ marginBottom:6 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:24, fontWeight:800 }}>
            Attack History — {countryName} <span style={{ fontFamily:'var(--font-mono)', fontSize:14, color:'var(--text-muted)' }}>({countryCode})</span>
          </div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-muted)', marginTop:4 }}>
            {attacks.length} recorded incident{attacks.length !== 1 ? 's' : ''} originating from this country
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:8, margin:'18px 0 24px' }}>
          {Object.entries(sevCounts).map(([sev, count]) => (
            <SummaryCard key={sev} label={sev} value={count} color={SEV_COLOR[sev]} />
          ))}
          <SummaryCard label="UNIQUE ASNs" value={asnSet.size} color="var(--accent-green)" />
        </div>

        {repeatAttackers > 0 && (
          <div style={{
            padding:'8px 12px', borderRadius:4, marginBottom:16,
            background:'rgba(255,107,0,0.08)', border:'1px solid rgba(255,107,0,0.25)',
            fontFamily:'var(--font-mono)', fontSize:9, color:'#ff6b00',
          }}>
            ⚠ {repeatAttackers} incident{repeatAttackers !== 1 ? 's' : ''} from repeat attacker ASNs originating from {countryName}
          </div>
        )}

        {/* Incident list */}
        {attacks.length === 0 ? (
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-muted)', padding:'40px 0', textAlign:'center' }}>
            No attacks recorded from {countryName} yet.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {attacks.map(inc => (
              <div key={inc.id} onClick={() => { selectIncident(inc.id); onBack() }} style={{
                display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                background:'rgba(255,255,255,0.02)', border:'1px solid var(--border-subtle)',
                borderRadius:5, cursor:'pointer', transition:'background 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.02)'}
              >
                <span style={{ width:8, height:8, borderRadius:'50%', background: SEV_COLOR[inc.severity] ?? '#888', flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-primary)', fontWeight:700 }}>
                    {inc.type?.replace(/_/g,' ')} <span style={{ color:'var(--text-muted)', fontWeight:400 }}>→ {inc.victim?.name ?? inc.victim?.asn}</span>
                  </div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>
                    {inc.attacker?.asn} · {inc.prefix} · {inc.confidence}% confidence
                    {inc.isRepeatAttacker && <span style={{ color:'#ff6b00' }}> · ↻ repeat</span>}
                    {inc.isSimulated && <span style={{ color:'#bf5af2' }}> · simulated</span>}
                    {inc.isRealData && <span style={{ color:'var(--accent-green)' }}> · live</span>}
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:8, fontWeight:700, color: SEV_COLOR[inc.severity] ?? '#888' }}>{inc.severity}</div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>{new Date(inc.timestamp).toISOString().slice(11,19)} UTC</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid var(--border-subtle)', borderRadius:5, padding:'10px 8px', textAlign:'center' }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:800, color }}>{value}</div>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', letterSpacing:1, marginTop:2 }}>{label}</div>
    </div>
  )
}
