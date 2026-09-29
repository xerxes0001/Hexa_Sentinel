/**
 * NPUStatusBadge
 * Polls /api/health every 10s and displays whether the backend is
 * running on the Hexagon NPU, CPU fallback, or simulation mode.
 * Renders as a compact pill for the top nav bar.
 */

import { useState, useEffect } from 'react'

const BASE = import.meta.env.VITE_HEXASENTINEL_API_URL ?? 'http://127.0.0.1:8000'

const MODES = {
  checking:    { label: 'CHECKING…',  color: '#4F6A88',  dot: '#4F6A88',  glow: false },
  npu:         { label: 'NPU LIVE',   color: '#10B981',  dot: '#10B981',  glow: true  },
  cpu:         { label: 'CPU MODE',   color: '#F59E0B',  dot: '#F59E0B',  glow: false },
  sim:         { label: 'SIMULATION', color: '#8B5CF6',  dot: '#8B5CF6',  glow: true  },
  offline:     { label: 'OFFLINE',    color: '#F43F5E',  dot: '#F43F5E',  glow: false },
}

function detectMode(health) {
  if (!health) return 'offline'
  // Check if real NPU is active by examining the classifier provider field
  const classifier = (health.classifier ?? '').toLowerCase()
  const stats      = health.stats ?? {}
  const simulated  = stats.simulated_ratio > 0.5   // >50% events are simulated
  if (simulated)                return 'sim'
  if (classifier.includes('qnn') || classifier.includes('hexagon')) return 'npu'
  return 'cpu'
}

export default function NPUStatusBadge({ showStats = false }) {
  const [mode,   setMode]   = useState('checking')
  const [health, setHealth] = useState(null)
  const [tooltip,setTooltip]= useState(false)

  const poll = () => {
    fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) })
      .then(r => r.ok ? r.json() : null)
      .then(h => { setHealth(h); setMode(detectMode(h)) })
      .catch(() => { setHealth(null); setMode('offline') })
  }

  useEffect(() => {
    poll()
    const interval = setInterval(poll, 10_000)
    return () => clearInterval(interval)
  }, [])

  const m = MODES[mode]

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setTooltip(true)}
      onMouseLeave={() => setTooltip(false)}
    >
      {/* Main badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', borderRadius: 100,
        background: `${m.color}14`,
        border: `1px solid ${m.color}40`,
        cursor: 'default',
        userSelect: 'none',
      }}>
        {/* Animated dot */}
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: m.dot,
          flexShrink: 0,
          boxShadow: m.glow ? `0 0 6px ${m.dot}` : 'none',
          animation: m.glow ? 'npuPulse 2s ease infinite' : 'none',
        }}/>

        {/* Label */}
        <span style={{
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 8, fontWeight: 700,
          letterSpacing: '0.09em',
          color: m.color,
        }}>
          {m.label}
        </span>

        {/* Shield icon */}
        <svg width="9" height="10" viewBox="0 0 9 10" fill="none">
          <path d="M4.5 1L8 2.5V5.5C8 7.2 6.5 8.6 4.5 9.2C2.5 8.6 1 7.2 1 5.5V2.5Z"
            fill={`${m.color}30`} stroke={m.color} strokeWidth="0.8"/>
        </svg>
      </div>

      {/* Hover tooltip */}
      {tooltip && health && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6,
          background: 'rgba(6,10,18,0.97)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, padding: '10px 14px',
          zIndex: 999, minWidth: 220,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          pointerEvents: 'none',
        }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:10, fontWeight:700, color:'#EAF2FF', marginBottom:8, letterSpacing:'0.05em' }}>
            HEXASENTINEL — BACKEND STATUS
          </div>
          {[
            ['LLM',        health.llm        ?? '—'],
            ['Classifier', health.classifier  ?? '—'],
            ['Cloud',      health.cloud ? '⚠ YES' : '✓ NONE'],
            ['Windows',    health.stats?.windows_processed ?? 0],
            ['Threats',    health.stats?.threats_detected  ?? 0],
            ['Suspicious', health.stats?.suspicious        ?? 0],
          ].map(([k, v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', gap:12, marginBottom:4 }}>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'#4F6A88' }}>{k}</span>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color: k === 'Cloud' && health.cloud ? '#F43F5E' : '#8BA8C8', textAlign:'right', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Offline tooltip */}
      {tooltip && !health && (
        <div style={{
          position:'absolute', top:'100%', right:0, marginTop:6,
          background:'rgba(6,10,18,0.97)',
          border:'1px solid rgba(244,63,94,0.25)',
          borderRadius:8, padding:'10px 14px',
          zIndex:999, minWidth:200,
          fontFamily:'var(--font-mono)', fontSize:9,
          color:'#F43F5E', pointerEvents:'none',
        }}>
          Backend not reachable.<br/>
          Run: uvicorn backend.api.main:app<br/>
          --host 127.0.0.1 --port 8000
        </div>
      )}

      <style>{`
        @keyframes npuPulse { 0%,100%{opacity:1;} 50%{opacity:0.35;} }
      `}</style>
    </div>
  )
}
