/**
 * HexaSentinelPanel — Live 5-Stage Silicon Pipeline Monitor
 * Slide 5: Shows Score S ∈ [0.0, 1.0], threshold 0.85,
 * stage latencies, and energy per incident.
 */
import { useState, useEffect, useRef } from 'react'
import { checkHealth } from '../../api/hexasentinelAPI.js'

const THRESHOLD = 0.85
const MAX_EVENTS = 60

function scoreColor(s) {
  if (s >= 0.92) return '#F43F5E'
  if (s >= THRESHOLD) return '#F59E0B'
  if (s >= 0.60) return '#FBBF24'
  return '#10B981'
}
function scoreLabel(s) {
  if (s >= 0.92) return 'THREAT'
  if (s >= THRESHOLD) return 'SUSPICIOUS'
  if (s >= 0.60) return 'ELEVATED'
  return 'NORMAL'
}

export default function HexaSentinelPanel({ compact = false }) {
  const [events,   setEvents]   = useState([])
  const [wsStatus, setWsStatus] = useState('connecting')
  const [health,   setHealth]   = useState(null)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    // HexaSentinelPanel listens to the SHARED WebSocket connection managed by App.jsx
    // via the hexasentinel:threat custom DOM event — avoids a second WS connection.
    const handler = (e) => {
      try {
        const ev = JSON.parse(e.detail ?? '{}')
        if (ev.type === 'pong') return
        setEvents(prev => [ev, ...prev].slice(0, MAX_EVENTS))
        setWsStatus('connected')
      } catch {}
    }
    window.addEventListener('hexasentinel:threat', handler)
    checkHealth().then(h => { setHealth(h); if (h) setWsStatus('connected') })
    return () => window.removeEventListener('hexasentinel:threat', handler)
  }, [])

  const threats    = events.filter(e => (e.score ?? 0) >= 0.92).length
  const suspicious = events.filter(e => (e.score ?? 0) >= THRESHOLD && (e.score ?? 0) < 0.92).length
  const normals    = events.filter(e => (e.score ?? 1) < THRESHOLD).length
  const dotColor   = wsStatus === 'connected' ? '#10B981' : wsStatus === 'error' ? '#F43F5E' : '#F59E0B'

  if (compact) {
    const latest = events.find(e => (e.score ?? 0) >= THRESHOLD)
    return (
      <div style={{ padding:'7px 10px', background:'rgba(0,0,0,0.2)', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom: latest ? 4 : 0 }}>
          <div style={{ width:5, height:5, borderRadius:'50%', background:dotColor, boxShadow:`0 0 5px ${dotColor}`, flexShrink:0 }}/>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:dotColor, letterSpacing:'0.1em', fontWeight:700 }}>
            HEXASENTINEL NPU · {wsStatus === 'connected' ? 'LIVE' : wsStatus.toUpperCase()}
          </span>
          <span style={{ marginLeft:'auto', fontFamily:'var(--font-mono)', fontSize:8, color:'rgba(255,255,255,0.2)' }}>
            {threats}T {suspicious}S
          </span>
        </div>
        {latest ? (
          <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color: scoreColor(latest.score ?? 0), lineHeight:1.5 }}>
            S={((latest.score ?? 0)).toFixed(3)} · {scoreLabel(latest.score ?? 0)} · {(latest.report ?? '').split('\n')[0]?.slice(0,70)}…
          </div>
        ) : (
          <div style={{ fontFamily:'var(--font-mono)', fontSize:7.5, color:'rgba(255,255,255,0.15)' }}>
            {wsStatus === 'connected' ? 'Monitoring — no threats detected (S < 0.85)' : 'Start Python backend to enable NPU monitoring'}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

      {/* ── Header ── */}
      <div style={{ padding:'10px 14px', borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:dotColor,
            boxShadow:`0 0 7px ${dotColor}`,
            animation: wsStatus==='connected' ? 'ssPulse 2.2s ease infinite' : 'none' }}/>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:9.5, fontWeight:800, letterSpacing:'0.1em', color:'#EAF2FF' }}>
            SILICON PIPELINE MONITOR
          </span>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:dotColor, marginLeft:'auto', fontWeight:700 }}>
            {wsStatus === 'connected' ? '◉ NPU LIVE' : wsStatus === 'error' ? '✗ OFFLINE' : '◎ CONNECTING'}
          </span>
        </div>

        {/* Threshold bar */}
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:7.5, color:'rgba(255,255,255,0.3)', flexShrink:0 }}>S=0</span>
          <div style={{ flex:1, height:6, background:'rgba(255,255,255,0.06)', borderRadius:3, position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', left:0, top:0, height:'100%', width:'85%',
              background:'linear-gradient(90deg, #10B981, #F59E0B)', borderRadius:3 }}/>
            <div style={{ position:'absolute', left:'85%', top:0, height:'100%',
              width:'15%', background:'#F43F5E', borderRadius:'0 3px 3px 0' }}/>
            <div style={{ position:'absolute', left:'85%', top:-1, width:2, height:8,
              background:'#FFFFFF', boxShadow:'0 0 4px white' }}/>
          </div>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:7.5, color:'rgba(255,255,255,0.3)', flexShrink:0 }}>S=1</span>
        </div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:7, color:'rgba(255,255,255,0.2)', textAlign:'center' }}>
          ← NORMAL (S &lt; 0.85) ··· THREAT BRANCH (S ≥ 0.85) →
        </div>

        {/* Stats */}
        <div style={{ display:'flex', gap:1, background:'rgba(255,255,255,0.03)', borderRadius:6, overflow:'hidden', marginTop:8 }}>
          {[['THREAT', threats,'#F43F5E'],['SUSPICIOUS', suspicious,'#F59E0B'],['NORMAL', normals,'#10B981']].map(([l,v,c]) => (
            <div key={l} style={{ flex:1, padding:'5px 0', textAlign:'center', borderRight:'1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:18, fontWeight:800, color:c, lineHeight:1 }}>{v}</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:7, color:'rgba(255,255,255,0.3)', marginTop:2 }}>{l}</div>
            </div>
          ))}
        </div>

        {health && (
          <div style={{ marginTop:6, fontFamily:'var(--font-mono)', fontSize:7.5, color:'rgba(255,255,255,0.25)', lineHeight:1.7 }}>
            {health.classifier} · Cloud: {health.cloud ? '⚠ YES' : '✓ NONE'} · Windows: {health.stats?.windows_processed ?? 0}
          </div>
        )}
      </div>

      {/* ── Event list ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'4px 0' }}>
        {events.length === 0 && (
          <div style={{ padding:'28px 16px', textAlign:'center', fontFamily:'var(--font-mono)',
            fontSize:8.5, color:'rgba(255,255,255,0.15)', lineHeight:2 }}>
            {wsStatus === 'connected'
              ? 'Monitoring live traffic…\nEvents appear here when S ≥ 0.85'
              : 'Start: uvicorn backend.api.main:app --host 127.0.0.1 --port 8000'}
          </div>
        )}
        {events.map((ev, idx) => {
          const s     = ev.score ?? 0
          const col   = scoreColor(s)
          const lbl   = scoreLabel(s)
          const isThr = s >= THRESHOLD
          const isOpen= expanded === idx
          const lat   = ev.latency ?? {}
          const firstLine = (ev.report ?? ev.label ?? '').split('\n').find(l => l.trim()) ?? lbl

          if (!isThr) {
            return (
              <div key={idx} style={{ padding:'3px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:7, color:'rgba(255,255,255,0.1)' }}>
                  {new Date(ev.timestamp).toISOString().slice(11,19)} · NORMAL · S={s.toFixed(3)}
                  {ev.window_pkts ? ` · ${ev.window_pkts}pkts` : ''}
                  {ev.simulated ? ' [sim]' : ''}
                </div>
                {lat.stage3_onnx_ms && (
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:6.5, color:'rgba(255,255,255,0.08)' }}>
                    {lat.stage3_onnx_ms?.toFixed(1)}ms
                  </span>
                )}
              </div>
            )
          }

          return (
            <div key={idx}
              style={{ padding:'8px 14px', borderBottom:'1px solid rgba(255,255,255,0.04)',
                cursor:'pointer', background: isOpen ? 'rgba(255,255,255,0.025)' : 'transparent' }}
              onClick={() => setExpanded(isOpen ? null : idx)}>

              {/* Score + label row */}
              <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:col,
                  flexShrink:0, boxShadow:`0 0 6px ${col}` }}/>

                {/* Score bar */}
                <div style={{ width:60, height:4, background:'rgba(255,255,255,0.08)', borderRadius:2, overflow:'hidden', flexShrink:0 }}>
                  <div style={{ height:'100%', width:`${(s * 100).toFixed(0)}%`,
                    background:col, boxShadow:`0 0 4px ${col}`, transition:'width 0.4s' }}/>
                </div>

                <span style={{ fontFamily:'var(--font-mono)', fontSize:10, fontWeight:800, color:col }}>
                  S={s.toFixed(3)}
                </span>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:8, fontWeight:700, color:col }}>
                  {lbl}
                </span>
                {ev.simulated && <span style={{ fontFamily:'var(--font-mono)', fontSize:7, color:'rgba(255,255,255,0.2)' }}>[sim]</span>}
                <span style={{ fontFamily:'var(--font-mono)', fontSize:7, color:'rgba(255,255,255,0.2)', marginLeft:'auto' }}>
                  {ev.timestamp ? new Date(ev.timestamp).toISOString().slice(11,19) : ''}
                </span>
              </div>

              {/* Report text */}
              <div style={{ fontFamily:'var(--font-mono)', fontSize:8.5, color:'rgba(255,255,255,0.55)', lineHeight:1.6,
                whiteSpace: isOpen ? 'pre-wrap' : 'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {isOpen ? ev.report : firstLine}
              </div>

              {isOpen && (
                <>
                  {/* Features */}
                  {ev.features && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:8 }}>
                      {Object.entries(ev.features).map(([k,v]) => (
                        <span key={k} style={{ fontFamily:'var(--font-mono)', fontSize:7, color:'rgba(255,255,255,0.35)',
                          background:'rgba(255,255,255,0.05)', padding:'2px 7px', borderRadius:3 }}>
                          {k}: {typeof v === 'number' ? v.toFixed(2) : v}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Latency breakdown — Slide 5 values */}
                  {Object.keys(lat).length > 0 && (
                    <div style={{ marginTop:6, display:'flex', gap:8, flexWrap:'wrap' }}>
                      {[
                        ['Stage 2 (features)', lat.stage2_feature_ms, 'ms', '#8BA8C8'],
                        ['Stage 3 (ONNX NPU)', lat.stage3_onnx_ms,   'ms', '#F43F5E'],
                        ['Stage 4 (Llama NPU)', lat.stage4_llm_sec,  's',  '#A78BFA'],
                        ['Energy',              ev.energy_wh,         'Wh', '#F59E0B'],
                      ].filter(([,v]) => v != null).map(([l,v,u,c]) => (
                        <span key={l} style={{ fontFamily:'var(--font-mono)', fontSize:7, color:c }}>
                          {l}: {typeof v === 'number' ? v.toFixed(u === 'ms' ? 1 : u === 's' ? 1 : 4) : v}{u}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      <style>{`@keyframes ssPulse{0%,100%{opacity:1}50%{opacity:0.25}}`}</style>
    </div>
  )
}
