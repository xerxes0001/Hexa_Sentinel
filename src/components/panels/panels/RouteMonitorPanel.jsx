/**
 * Route Monitor Panel — type any ASN or IP to monitor its BGP routes
 */
import { useState } from 'react'
import { useMonitorStore } from '../../store/useSHYENStore.js'

async function lookupRoutes(value, type) {
  try {
    if (type === 'asn') {
      const asnNum = value.replace(/^AS/i, '')
      const res = await fetch(`https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS${asnNum}`, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error('RIPE STAT error')
      const data = await res.json()
      const prefixes = data?.data?.prefixes ?? []
      return prefixes.slice(0, 20).map(p => ({
        prefix:    p.prefix,
        timelines: p.timelines?.length ?? 0,
        label:     `${p.prefix}`,
      }))
    } else {
      // IP — reverse lookup via RIPE
      const res = await fetch(`https://stat.ripe.net/data/prefix-overview/data.json?resource=${value}`, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error('RIPE STAT error')
      const data = await res.json()
      const block = data?.data
      return [{
        prefix:  block?.resource ?? value,
        asn:     block?.asns?.[0]?.asn ?? '?',
        holder:  block?.asns?.[0]?.holder ?? 'Unknown',
        label:   `${block?.resource} — AS${block?.asns?.[0]?.asn} (${block?.asns?.[0]?.holder})`,
      }]
    }
  } catch (e) {
    return null
  }
}

async function lookupASNInfo(asn) {
  try {
    const asnNum = String(asn).replace(/^AS/i, '')
    const res = await fetch(`https://stat.ripe.net/data/as-overview/data.json?resource=AS${asnNum}`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    return {
      holder:  data?.data?.holder ?? 'Unknown',
      country: data?.data?.announced_country ?? '??',
      announced: data?.data?.announced ?? false,
      type:    data?.data?.type ?? '?',
    }
  } catch { return null }
}

export default function RouteMonitorPanel({ onClose }) {
  const { targets, addTarget, removeTarget, updateRoutes } = useMonitorStore()
  const [input,   setInput]   = useState('')
  const [type,    setType]    = useState('asn')
  const [label,   setLabel]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [loadingId, setLoadingId] = useState(null)

  async function handleAdd() {
    const val = input.trim()
    if (!val) return
    setLoading(true)
    setError('')

    // Normalize
    let normalized = val
    if (type === 'asn' && !/^AS/i.test(val)) normalized = `AS${val}`

    // Quick info lookup
    const info = type === 'asn' ? await lookupASNInfo(normalized) : null

    const target = {
      type,
      value:      normalized,
      label:      label.trim() || (info?.holder ? `${normalized} — ${info.holder}` : normalized),
      info,
      routes:     [],
      lastChecked: null,
    }

    addTarget(target)
    setInput('')
    setLabel('')
    setLoading(false)
  }

  async function fetchRoutes(target) {
    setLoadingId(target.id)
    const routes = await lookupRoutes(target.value, target.type)
    if (routes) updateRoutes(target.id, routes)
    else updateRoutes(target.id, [{ prefix: 'No routes found or lookup failed', error: true }])
    setLoadingId(null)
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:200,
      background:'rgba(4,7,14,0.97)', overflowY:'auto',
      animation:'fadeIn 0.2s ease-out',
    }}>
      {/* Header */}
      <div style={{ position:'sticky', top:0, background:'rgba(4,7,14,0.98)', borderBottom:'1px solid var(--border-subtle)', padding:'12px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', zIndex:10 }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:800 }}>ROUTE MONITOR</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)', marginTop:2 }}>
            Track BGP routes for any ASN or IP address in real time via RIPE STAT
          </div>
        </div>
        <button onClick={onClose} style={{
          fontFamily:'var(--font-mono)', fontSize:9, color:'#ff2d55',
          background:'rgba(255,45,85,0.08)', border:'1px solid rgba(255,45,85,0.45)',
          borderRadius:4, padding:'6px 14px', cursor:'pointer', boxShadow:'0 0 8px rgba(255,45,85,0.3)',
        }}>✕ CLOSE</button>
      </div>

      <div style={{ padding:24, maxWidth:900, margin:'0 auto' }}>
        {/* Add form */}
        <div style={{ background:'rgba(10,18,28,0.8)', border:'1px solid var(--border-subtle)', borderRadius:6, padding:20, marginBottom:24 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:13, fontWeight:700, marginBottom:14 }}>
            ADD MONITORING TARGET
          </div>

          {/* Type selector */}
          <div style={{ display:'flex', gap:6, marginBottom:12 }}>
            {[
              { key:'asn',    label:'ASN',        hint:'e.g. AS55836 or 55836' },
              { key:'ip',     label:'IP / PREFIX', hint:'e.g. 103.47.140.0/22' },
            ].map(opt => (
              <button key={opt.key} onClick={() => setType(opt.key)} style={{
                flex:1, fontFamily:'var(--font-mono)', fontSize:9, padding:'8px 0',
                background: type === opt.key ? 'var(--accent-green)' : 'rgba(255,255,255,0.03)',
                color: type === opt.key ? '#000' : 'var(--text-muted)',
                border:`1px solid ${type === opt.key ? 'var(--accent-green)' : 'var(--border-subtle)'}`,
                borderRadius:4, cursor:'pointer', fontWeight: type === opt.key ? 700 : 400,
              }}>
                <div>{opt.label}</div>
                <div style={{ fontSize:7, opacity:0.7, marginTop:2 }}>{opt.hint}</div>
              </button>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder={type === 'asn' ? 'AS55836 or 55836' : '103.47.140.0/22 or 1.2.3.4'}
              style={{
                fontFamily:'var(--font-mono)', fontSize:10,
                background:'rgba(6,10,16,0.9)', border:'1px solid var(--border-mid)',
                color:'var(--text-primary)', borderRadius:4, padding:'9px 12px', outline:'none',
              }}
            />
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Label (optional, e.g. Reliance Jio)"
              style={{
                fontFamily:'var(--font-mono)', fontSize:10,
                background:'rgba(6,10,16,0.9)', border:'1px solid var(--border-mid)',
                color:'var(--text-primary)', borderRadius:4, padding:'9px 12px', outline:'none',
              }}
            />
            <button onClick={handleAdd} disabled={loading || !input.trim()} style={{
              fontFamily:'var(--font-mono)', fontSize:10, fontWeight:700,
              color:'#000', background: loading ? '#333' : 'var(--accent-green)',
              border:'none', borderRadius:4, padding:'0 20px', cursor:'pointer',
              whiteSpace:'nowrap',
            }}>{loading ? '...' : '+ MONITOR'}</button>
          </div>

          {error && <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'#ff2d55', marginTop:8 }}>{error}</div>}
        </div>

        {/* Targets list */}
        {targets.length === 0 ? (
          <div style={{ textAlign:'center', padding:60, fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-muted)', letterSpacing:2 }}>
            No targets yet — add an ASN or IP above
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {targets.map(target => (
              <div key={target.id} style={{ background:'rgba(10,18,28,0.8)', border:'1px solid var(--border-subtle)', borderRadius:6, overflow:'hidden' }}>
                {/* Target header */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom: target.routes.length > 0 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{
                      fontFamily:'var(--font-mono)', fontSize:8, fontWeight:700,
                      color: target.type === 'asn' ? '#00bfff' : '#bf5af2',
                      background: target.type === 'asn' ? 'rgba(0,191,255,0.1)' : 'rgba(191,90,242,0.1)',
                      border:`1px solid ${target.type === 'asn' ? 'rgba(0,191,255,0.3)' : 'rgba(191,90,242,0.3)'}`,
                      borderRadius:3, padding:'2px 6px',
                    }}>{target.type.toUpperCase()}</span>
                    <div>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:11, fontWeight:700, color:'var(--text-primary)' }}>{target.value}</div>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>
                        {target.label !== target.value ? target.label : ''}
                        {target.info?.country && target.info.country !== '??' ? ` · ${target.info.country}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => fetchRoutes(target)} disabled={loadingId === target.id} style={{
                      fontFamily:'var(--font-mono)', fontSize:8, fontWeight:700,
                      color:'#000', background: loadingId === target.id ? '#333' : 'var(--accent-blue)',
                      border:'none', borderRadius:3, padding:'5px 12px', cursor:'pointer',
                    }}>{loadingId === target.id ? 'LOADING...' : target.routes.length > 0 ? '↻ REFRESH' : 'FETCH ROUTES'}</button>
                    <button onClick={() => removeTarget(target.id)} style={{
                      fontFamily:'var(--font-mono)', fontSize:8, color:'#666',
                      background:'none', border:'1px solid #222', borderRadius:3,
                      padding:'5px 10px', cursor:'pointer',
                    }}>REMOVE</button>
                  </div>
                </div>

                {/* ASN info */}
                {target.info && (
                  <div style={{ display:'flex', gap:16, padding:'8px 16px', background:'rgba(0,191,255,0.03)', borderBottom: target.routes.length > 0 ? '1px solid var(--border-subtle)' : 'none' }}>
                    {[
                      ['Holder',  target.info.holder],
                      ['Country', target.info.country],
                      ['Type',    target.info.type],
                      ['Active',  target.info.announced ? 'Yes' : 'No'],
                    ].map(([k,v]) => v && (
                      <div key={k}>
                        <div style={{ fontFamily:'var(--font-mono)', fontSize:7, color:'var(--text-muted)' }}>{k}</div>
                        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-primary)' }}>{v}</div>
                      </div>
                    ))}
                    {target.lastChecked && (
                      <div style={{ marginLeft:'auto' }}>
                        <div style={{ fontFamily:'var(--font-mono)', fontSize:7, color:'var(--text-muted)' }}>Last Check</div>
                        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)' }}>
                          {new Date(target.lastChecked).toISOString().slice(11,19)} UTC
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Routes */}
                {target.routes.length > 0 && (
                  <div style={{ padding:'8px 16px' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', marginBottom:6, letterSpacing:'0.08em' }}>
                      ANNOUNCED PREFIXES ({target.routes.length})
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                      {target.routes.map((r, i) => (
                        <div key={i} style={{
                          fontFamily:'var(--font-mono)', fontSize:8,
                          color: r.error ? '#ff2d55' : '#00bfff',
                          background: r.error ? 'rgba(255,45,85,0.08)' : 'rgba(0,191,255,0.08)',
                          border:`1px solid ${r.error ? 'rgba(255,45,85,0.2)' : 'rgba(0,191,255,0.2)'}`,
                          borderRadius:3, padding:'3px 8px',
                        }}>{r.label ?? r.prefix}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
